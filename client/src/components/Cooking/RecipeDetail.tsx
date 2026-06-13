import { useEffect, useState } from 'react';
import { ArrowLeft, Edit3, MessageSquare } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Input, TextareaAutosize } from '@librechat/client';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import {
  useRecipeQuery,
  useUpdateSavedRecipeMutation,
  useCreateCookingDocumentMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import RecipeMetrics from './Metrics';
import StructuredIngredients, { hasDisplayableIngredients } from './StructuredIngredients';
import {
  recipeBodyMarkdown,
  recipeDisplayTitle,
  recipeMarkdownDisplay,
  stripIngredientsSection,
} from './recipe';

function arrayChips(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function categoryChips(recipe: ReturnType<typeof useRecipeQuery>['data']): string[] {
  const categorization = recipe?.categorization;
  if (!categorization) {
    return [];
  }
  return [
    ...arrayChips(categorization.cuisine),
    ...arrayChips(categorization.mealType),
    ...arrayChips(categorization.dishType),
    ...arrayChips(categorization.diet),
    categorization.difficulty ?? '',
    categorization.timeBucket ?? '',
    ...arrayChips(categorization.occasion),
    ...arrayChips(categorization.equipment),
    ...arrayChips(categorization.mainIngredients),
    ...arrayChips(categorization.techniques),
    ...arrayChips(categorization.flavorProfile),
  ].filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function displayTag(value: string): string {
  return value.replace(/_/g, ' ');
}

function metadataTags(recipe: ReturnType<typeof useRecipeQuery>['data']): string[] {
  const categorization = recipe?.categorization;
  if (!categorization) {
    return [];
  }
  return unique([
    ...arrayChips(categorization.cuisine),
    ...arrayChips(categorization.mealType),
    categorization.timeBucket ?? '',
    ...arrayChips(categorization.diet),
  ]).slice(0, 6);
}

function compactMetadataTags(recipe: ReturnType<typeof useRecipeQuery>['data']): string[] {
  const categorization = recipe?.categorization;
  if (!categorization) {
    return [];
  }
  return unique([
    ...arrayChips(categorization.cuisine),
    ...arrayChips(categorization.mealType),
    ...arrayChips(categorization.dishType),
    ...arrayChips(categorization.diet),
  ]).slice(0, 4);
}

function documentTypeLabel(
  localize: ReturnType<typeof useLocalize>,
  documentType: 'recipe' | 'guide' | 'prep_plan',
): string {
  if (documentType === 'prep_plan') {
    return localize('com_cooking_document_type_prep_plan');
  }
  if (documentType === 'guide') {
    return localize('com_cooking_document_type_guide');
  }
  return localize('com_cooking_document_type_recipe');
}

function formatRecipeDate(value?: string): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export default function RecipeDetail() {
  const localize = useLocalize();
  const { recipeId } = useParams();
  const updateRecipe = useUpdateSavedRecipeMutation();
  const createCookingDocument = useCreateCookingDocumentMutation();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const recipeQuery = useRecipeQuery(recipeId, {
    refetchInterval: (recipe) =>
      recipe?.categorizationStatus === 'pending' ||
      recipe?.illustrationStatus === 'pending' ||
      recipe?.illustrationStatus === 'generating'
        ? 3000
        : false,
  });
  const recipe = recipeQuery.data;

  useEffect(() => {
    if (!recipe || isEditing) {
      return;
    }
    setDraftTitle(recipeDisplayTitle(recipe));
    setDraftMarkdown(recipeBodyMarkdown(recipe));
  }, [isEditing, recipe]);

  if (recipeQuery.isLoading) {
    return (
      <main className="flex h-full items-center justify-center bg-surface-primary-alt text-sm text-text-secondary">
        {localize('com_ui_loading')}
      </main>
    );
  }

  if (!recipe) {
    return (
      <main className="flex h-full items-center justify-center bg-surface-primary-alt text-sm text-text-secondary">
        {localize('com_recipes_not_found')}
      </main>
    );
  }

  const metadata = metadataTags(recipe);
  const compactMetadata = compactMetadataTags(recipe);
  const metadataSet = new Set(metadata);
  const secondaryChips = categoryChips(recipe).filter((chip) => !metadataSet.has(chip));
  const updatedAt = formatRecipeDate(recipe.updatedAt);
  const markdown = recipeBodyMarkdown(recipe);
  const markdownDisplay = recipeMarkdownDisplay(markdown);
  const hasStructuredIngredients = recipe.recipe
    ? hasDisplayableIngredients(recipe.recipe.ingredients)
    : false;
  const recipeBody = hasStructuredIngredients
    ? stripIngredientsSection(markdownDisplay.body)
    : markdownDisplay.body;
  const saveDisabled =
    updateRecipe.isLoading || draftTitle.trim().length === 0 || draftMarkdown.trim().length === 0;

  const startEditing = () => {
    setDraftTitle(recipeDisplayTitle(recipe));
    setDraftMarkdown(markdown);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraftTitle(recipeDisplayTitle(recipe));
    setDraftMarkdown(markdown);
    setIsEditing(false);
  };

  const saveEdits = () => {
    if (!recipeId || saveDisabled) {
      return;
    }

    updateRecipe.mutate(
      {
        recipeId,
        payload: {
          title: draftTitle.trim(),
          documentMarkdown: `# ${draftTitle.trim()}\n\n${draftMarkdown.trim()}`,
          ...(recipe.recipe ? { recipe: { ...recipe.recipe, title: draftTitle.trim() } } : {}),
        },
      },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      },
    );
  };

  const discussWithAI = () => {
    if (!recipe) {
      return;
    }

    const newConvoId = window.crypto.randomUUID();
    createCookingDocument.mutate(
      {
        prompt: `Discuss ${recipeDisplayTitle(recipe)}`,
        conversationId: newConvoId,
        savedRecipeId: recipe._id,
        documentMarkdown: recipe.documentMarkdown,
        documentType: recipe.documentType,
        recipe: recipe.recipe,
      },
      {
        onSuccess: () => {
          navigate(`/cook/${newConvoId}`);
        },
      },
    );
  };

  return (
    <main className="rekky-ui rekky-recipe-surface h-full overflow-y-auto bg-surface-primary-alt px-0 py-0 text-text-primary sm:px-7 sm:py-7 lg:px-10">
      <div className="mx-auto max-w-[68rem] pt-10 sm:pt-0">
        <div className="flex min-h-10 items-center justify-between px-4 sm:px-0">
          <Link
            to="/recipes"
            className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>{localize('com_recipes_back_to_library')}</span>
          </Link>
          {recipe.categorizationStatus === 'pending' ? (
            <span className="pr-12 text-xs text-text-secondary sm:pr-0">
              {localize('com_recipes_categorizing')}
            </span>
          ) : null}
        </div>
        <article className="bg-surface-primary px-4 py-6 shadow-none sm:mt-4 sm:rounded-lg sm:border sm:border-border-light sm:px-8 sm:py-9 lg:px-12 lg:py-10">
          <header className="mb-7 border-b border-border-light pb-6 sm:mb-8 sm:pb-7">
            <div className="flex items-start justify-between gap-4">
              <h1 className="rekky-title min-w-0">
                {isEditing ? localize('com_recipes_edit_recipe') : recipeDisplayTitle(recipe)}
              </h1>
              {!isEditing ? (
                <div className="mt-0.5 flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="size-9 px-0 sm:size-auto sm:gap-2 sm:px-3"
                    disabled={createCookingDocument.isLoading}
                    onClick={discussWithAI}
                    aria-label={localize('com_recipes_discuss_ai')}
                  >
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{localize('com_recipes_discuss_ai')}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="size-9 px-0 sm:size-auto sm:gap-2 sm:px-3"
                    onClick={startEditing}
                    aria-label={localize('com_recipes_edit_markdown_btn')}
                  >
                    <Edit3 className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {localize('com_recipes_edit_markdown_btn')}
                    </span>
                  </Button>
                </div>
              ) : null}
            </div>
            {!isEditing ? (
              <div className="rekky-meta mt-4 flex flex-wrap gap-x-3 gap-y-1 text-text-secondary sm:mt-3">
                <span>{documentTypeLabel(localize, recipe.documentType)}</span>
                {updatedAt ? (
                  <span>{localize('com_recipes_updated_date', { date: updatedAt })}</span>
                ) : null}
              </div>
            ) : null}
            {!isEditing && compactMetadata.length > 0 ? (
              <p className="rekky-meta mt-4 max-w-3xl text-balance capitalize text-text-secondary">
                {compactMetadata.map(displayTag).join(' · ')}
              </p>
            ) : null}
            {!isEditing && secondaryChips.length > 0 ? (
              <details className="group mt-3 hidden sm:block">
                <summary className="cursor-pointer list-none text-xs text-text-secondary hover:text-text-primary">
                  {localize('com_recipes_view_tags', { count: secondaryChips.length })}
                </summary>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {secondaryChips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-md border border-border-light px-2 py-1 text-xs text-text-secondary"
                    >
                      {displayTag(chip)}
                    </span>
                  ))}
                </div>
              </details>
            ) : null}
          </header>
          {isEditing ? (
            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-secondary">
                  {localize('com_recipes_edit_title')}
                </span>
                <Input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  className="min-h-11 bg-surface-primary-alt"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-secondary">
                  {localize('com_recipes_edit_markdown')}
                </span>
                <TextareaAutosize
                  aria-label={localize('com_recipes_edit_markdown')}
                  value={draftMarkdown}
                  onChange={(event) => setDraftMarkdown(event.target.value)}
                  minRows={18}
                  className="w-full resize-y rounded-lg border border-border-light bg-surface-primary-alt p-4 font-mono text-sm leading-6 text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                />
              </label>
              <div className="flex items-center justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
                <Button
                  type="button"
                  variant="outline"
                  disabled={updateRecipe.isLoading}
                  onClick={cancelEditing}
                >
                  {localize('com_ui_cancel')}
                </Button>
                <Button type="button" disabled={saveDisabled} onClick={saveEdits}>
                  {updateRecipe.isLoading
                    ? localize('com_recipes_saving')
                    : localize('com_ui_save')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <RecipeMetrics metrics={markdownDisplay.metrics} />
              {hasStructuredIngredients ? (
                <StructuredIngredients ingredients={recipe.recipe?.ingredients ?? []} />
              ) : null}
              <div className="cooking-recipe-markdown markdown prose light dark:prose-invert max-w-none break-words text-text-primary">
                <Markdown content={recipeBody} isLatestMessage={false} />
              </div>
            </>
          )}
        </article>
      </div>
    </main>
  );
}
