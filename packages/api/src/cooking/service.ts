import mongoose from 'mongoose';
import type {
  ConversationCookingDocuments,
  CookingDocumentType,
  CookingDraft,
  StructuredRecipe,
} from 'librechat-data-provider';
import { canonicalRecipeFromContent } from 'librechat-data-provider';
import type { ICookingDraft } from '@librechat/data-schemas';
import { CookingValidationError, normalizeRecipe, personalizeRecipe } from './validation';
import { getExistingPreferences } from '../preferences/service';

function idOf(doc: { _id: unknown }): string {
  return String(doc._id);
}

function iso(date?: Date): string {
  return (date ?? new Date()).toISOString();
}

function serializeStructuredRecipe(recipe: StructuredRecipe): StructuredRecipe {
  return normalizeRecipe(recipe);
}

function models() {
  return {
    Draft: mongoose.model<ICookingDraft>('CookingDraft'),
  };
}

function serializeDraft(draft: ICookingDraft): CookingDraft {
  const storedRecipe = serializeStructuredRecipe(draft.recipe);
  const canonicalRecipe = draft.documentMarkdown
    ? canonicalRecipeFromContent({ markdown: draft.documentMarkdown, recipe: storedRecipe })
    : null;
  return {
    _id: idOf(draft),
    user: draft.user,
    ...(draft.conversationId ? { conversationId: draft.conversationId } : {}),
    prompt: draft.prompt,
    status: draft.status,
    documentType: draft.documentType ?? 'recipe',
    selected: draft.selected ?? false,
    ...(draft.documentMarkdown ? { documentMarkdown: draft.documentMarkdown } : {}),
    recipe: canonicalRecipe ? serializeStructuredRecipe(canonicalRecipe) : storedRecipe,
    ...(draft.expiresAt ? { expiresAt: iso(draft.expiresAt) } : {}),
    createdAt: iso(draft.createdAt),
    updatedAt: iso(draft.updatedAt),
  };
}

function assertPrompt(prompt: string): string {
  const clean = prompt.trim();
  if (!clean) {
    throw new CookingValidationError('Prompt is required.');
  }
  return clean;
}

function assertDocumentType(documentType?: CookingDocumentType): CookingDocumentType {
  if (!documentType) {
    return 'recipe';
  }
  if (documentType === 'recipe' || documentType === 'guide' || documentType === 'prep_plan') {
    return documentType;
  }
  throw new CookingValidationError('Cooking document type is malformed.');
}

function markdownTitle(markdown?: string): string | undefined {
  const title = markdown?.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return title && title !== '{' && title !== '}' ? title : undefined;
}

function blankRecipe(title: string): StructuredRecipe {
  return {
    title:
      title
        .split('\n')
        .find(Boolean)
        ?.replace(/^#+\s*/, '')
        .slice(0, 80) || 'Recipe',
    description: '',
    servings: 2,
    timing: { prepMinutes: 0, cookMinutes: 0, totalMinutes: 0 },
    ingredients: [
      {
        id: 'ingredient-1',
        originalText: '1 item',
        item: 'item',
        quantityType: 'estimated',
      },
    ],
    steps: [
      {
        id: 'step-1',
        order: 1,
        text: 'Prepare the recipe.',
        ingredientIds: ['ingredient-1'],
        timers: [],
        warnings: [],
        tips: [],
      },
    ],
    notes: [],
    tags: [],
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

async function selectDraft(
  user: string,
  conversationId: string,
  documentId: unknown,
): Promise<void> {
  const { Draft } = models();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await Draft.updateMany(
      { user, conversationId, status: 'active', selected: true },
      { $set: { selected: false } },
    );
    try {
      await Draft.updateOne(
        { _id: documentId, user, conversationId, status: 'active' },
        { $set: { selected: true } },
      );
      return;
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt === 2) {
        throw error;
      }
    }
  }
}

export async function generateCookingDraft(
  user: string,
  prompt: string,
  conversationId?: string,
  documentMarkdown?: string,
  documentType?: CookingDocumentType,
  recipe?: StructuredRecipe,
): Promise<CookingDraft> {
  const { Draft } = models();
  const cleanPrompt = assertPrompt(prompt);
  const cleanDocumentMarkdown = documentMarkdown?.trim();
  const preferences = await getExistingPreferences(user);
  const selectedDocumentType = assertDocumentType(documentType);
  const fallbackRecipe = recipe ?? blankRecipe(markdownTitle(cleanDocumentMarkdown) ?? cleanPrompt);
  const parsedRecipe = cleanDocumentMarkdown
    ? canonicalRecipeFromContent({ markdown: cleanDocumentMarkdown, recipe: fallbackRecipe })
    : null;
  const normalizedBase = normalizeRecipe(parsedRecipe ?? fallbackRecipe);
  const personalized = personalizeRecipe(normalizedBase, preferences?.markdown);
  const finalRecipe = personalized.recipe;
  const adjustments = personalized.adjustments;
  const payload = {
    user,
    ...(conversationId ? { conversationId } : {}),
    prompt: cleanPrompt,
    status: 'active',
    documentType: selectedDocumentType,
    selected: false,
    ...(cleanDocumentMarkdown ? { documentMarkdown: cleanDocumentMarkdown } : {}),
    recipe: finalRecipe,
  };
  const draft = await Draft.create(payload);
  if (conversationId) {
    await selectDraft(user, conversationId, draft._id);
    draft.selected = true;
  } else {
    draft.selected = true;
    await draft.save();
  }
  return {
    ...serializeDraft(draft),
    adjustments,
  };
}

export const createCookingDocument = generateCookingDraft;

export async function listCookingDocuments(
  user: string,
  conversationId: string,
): Promise<ConversationCookingDocuments> {
  const { Draft } = models();
  let documents = await Draft.find({ user, conversationId, status: 'active' }).sort({
    updatedAt: -1,
  });
  if (!documents.length) {
    return { documents: [] };
  }

  const draftIds = documents.map((doc) => idOf(doc));
  const SocialImport = mongoose.model('SocialImport');
  const imports = await SocialImport.find({
    user,
    draftId: { $in: draftIds },
  })
    .select('draftId sourceUrl')
    .lean<{ draftId?: string; sourceUrl?: string }[]>();

  const sourceUrlMap = new Map<string, string>();
  for (const imp of imports) {
    if (imp.draftId && imp.sourceUrl) {
      sourceUrlMap.set(String(imp.draftId), imp.sourceUrl);
    }
  }

  let selectedDocument = documents.find((document) => document.selected);
  if (!selectedDocument) {
    selectedDocument = documents[0];
    await selectDraft(user, conversationId, selectedDocument._id);
    documents = documents.map((document) => {
      if (idOf(document) === idOf(selectedDocument!)) {
        document.selected = true;
      }
      return document;
    });
  }

  return {
    documents: documents.map((doc) => {
      const serialized = serializeDraft(doc);
      const url = sourceUrlMap.get(serialized._id);
      if (url) {
        serialized.sourceUrl = url;
      }
      return serialized;
    }),
    selectedDocumentId: idOf(selectedDocument),
  };
}

export async function getSelectedCookingDocument(
  user: string,
  conversationId: string,
): Promise<CookingDraft | null> {
  const collection = await listCookingDocuments(user, conversationId);
  return (
    collection.documents.find((document) => document._id === collection.selectedDocumentId) ?? null
  );
}

export const getCookingDraftByConversation = getSelectedCookingDocument;

export async function selectCookingDocument(
  user: string,
  documentId: string,
): Promise<ConversationCookingDocuments | null> {
  const { Draft } = models();
  const selected = await Draft.findOne({ _id: documentId, user, status: 'active' });
  if (!selected?.conversationId) {
    return null;
  }
  await selectDraft(user, selected.conversationId, selected._id);
  return listCookingDocuments(user, selected.conversationId);
}

export async function deleteCookingDocument(
  user: string,
  documentId: string,
): Promise<ConversationCookingDocuments | null> {
  const { Draft } = models();
  const deleted = await Draft.findOneAndDelete({ _id: documentId, user, status: 'active' });
  if (!deleted) {
    return null;
  }
  if (!deleted.conversationId) {
    return { documents: [] };
  }
  const collection = await listCookingDocuments(user, deleted.conversationId);
  if (!deleted.selected || !collection.documents.length) {
    return collection;
  }
  return selectCookingDocument(user, collection.documents[0]._id);
}

export async function updateCookingDraft(
  user: string,
  draftId: string,
  recipe?: StructuredRecipe,
  documentMarkdown?: string,
): Promise<CookingDraft | null> {
  const { Draft } = models();
  const set: Partial<Pick<ICookingDraft, 'recipe' | 'documentMarkdown'>> & {
    'recipe.title'?: string;
  } = {};
  const cleanDocumentMarkdown = documentMarkdown?.trim();
  const documentTitle = markdownTitle(cleanDocumentMarkdown);
  let adjustments: string[] = [];
  const parsedRecipe = cleanDocumentMarkdown
    ? canonicalRecipeFromContent({ markdown: cleanDocumentMarkdown, recipe })
    : null;
  if (recipe || parsedRecipe) {
    const preferences = await getExistingPreferences(user);
    const sourceRecipe = parsedRecipe ?? recipe!;
    const baseRecipe = documentTitle ? { ...sourceRecipe, title: documentTitle } : sourceRecipe;
    const normalizedBase = normalizeRecipe(baseRecipe);
    const personalized = personalizeRecipe(normalizedBase, preferences?.markdown);
    set.recipe = personalized.recipe;
    adjustments = personalized.adjustments;
  }
  if (typeof documentMarkdown === 'string') {
    set.documentMarkdown = documentMarkdown.trim();
    if (!set.recipe && !recipe && documentTitle) {
      set['recipe.title'] = documentTitle;
    }
  }
  if (!set.recipe && set.documentMarkdown == null) {
    throw new CookingValidationError('Draft update is empty.');
  }
  const draft = await Draft.findOneAndUpdate(
    { _id: draftId, user, status: 'active' },
    { $set: set },
    { new: true },
  );
  if (!draft) {
    return null;
  }
  return {
    ...serializeDraft(draft),
    adjustments,
  };
}

export const updateCookingDocument = updateCookingDraft;

export { CookingValidationError };
