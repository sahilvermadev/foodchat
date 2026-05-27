import { useMemo, useState } from 'react';
import copy from 'copy-to-clipboard';
import type { CookingDraft, StructuredRecipe } from 'librechat-data-provider';
import { BookmarkCheck, BookmarkPlus, Check, Copy, RefreshCw } from 'lucide-react';
import { Button, TooltipAnchor, useToastContext } from '@librechat/client';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import {
  useSaveRecipeMutation,
  useSavedRecipeByDraftQuery,
  useUpdateSavedRecipeMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';
import RecipeMetrics from './Metrics';
import { recipeMarkdownDisplay } from './recipe';

type RecipeCanvasProps = {
  draft?: CookingDraft;
  markdown?: string;
  conversationId?: string;
  isPreparingDraft?: boolean;
};

function documentTypeKey(draft: CookingDraft) {
  if (draft.documentType === 'prep_plan') {
    return 'com_cooking_document_type_prep_plan' as const;
  }
  if (draft.documentType === 'guide') {
    return 'com_cooking_document_type_guide' as const;
  }
  return 'com_cooking_document_type_recipe' as const;
}

function recipeToMarkdown(recipe: StructuredRecipe): string {
  const timing = [
    recipe.timing.prepMinutes ? `Prep ${recipe.timing.prepMinutes}m` : '',
    recipe.timing.cookMinutes ? `Cook ${recipe.timing.cookMinutes}m` : '',
    recipe.timing.totalMinutes ? `Total ${recipe.timing.totalMinutes}m` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const ingredients = recipe.ingredients
    .map((ingredient) => `- ${ingredient.originalText}`)
    .join('\n');
  const steps = recipe.steps.map((step) => `${step.order}. ${step.text}`).join('\n\n');
  const notes = recipe.notes.map((note) => `- ${note}`).join('\n');

  return [
    `# ${recipe.title}`,
    recipe.description,
    `**Servings:** ${recipe.servings}${timing ? `  \n**Time:** ${timing}` : ''}`,
    '## Ingredients',
    ingredients,
    '## Instructions',
    steps,
    notes ? '## Notes' : '',
    notes,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export default function RecipeCanvas({
  draft,
  markdown = '',
  conversationId,
  isPreparingDraft,
}: RecipeCanvasProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isCopied, setIsCopied] = useState(false);
  const savedRecipeQuery = useSavedRecipeByDraftQuery(draft?._id, {
    enabled: Boolean(draft?._id),
    refetchInterval: (recipe) =>
      recipe?.categorizationStatus === 'pending' ||
      recipe?.illustrationStatus === 'pending' ||
      recipe?.illustrationStatus === 'generating'
        ? 3000
        : false,
  });
  const saveRecipe = useSaveRecipeMutation();
  const updateSavedRecipe = useUpdateSavedRecipeMutation();

  const documentMarkdown = useMemo(() => {
    const assistantMarkdown = markdown.trim();
    if (assistantMarkdown) {
      return assistantMarkdown;
    }
    return draft ? recipeToMarkdown(draft.recipe) : '';
  }, [draft, markdown]);

  if (!documentMarkdown && !isPreparingDraft) {
    return null;
  }

  const savedRecipe = savedRecipeQuery.data;
  const canSave = Boolean(documentMarkdown.trim());
  const hasSavedRecipe = Boolean(savedRecipe);
  const hasChangedSavedRecipe =
    hasSavedRecipe && savedRecipe?.documentMarkdown.trim() !== documentMarkdown.trim();
  const isSaving = saveRecipe.isLoading || updateSavedRecipe.isLoading;
  let buttonLabel = localize('com_recipes_save_recipe');
  if (hasSavedRecipe) {
    buttonLabel = localize('com_recipes_saved');
  }
  if (hasChangedSavedRecipe) {
    buttonLabel = localize('com_recipes_update_saved');
  }
  if (isSaving) {
    buttonLabel = localize('com_recipes_saving');
  }
  let saveIcon = <BookmarkPlus className="h-4 w-4" aria-hidden="true" />;
  if (hasSavedRecipe && !hasChangedSavedRecipe) {
    saveIcon = <BookmarkCheck className="h-4 w-4" aria-hidden="true" />;
  }
  if (isSaving) {
    saveIcon = <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />;
  }
  const documentParts = recipeMarkdownDisplay(documentMarkdown, draft?.recipe.title);

  const handleCopyMarkdown = () => {
    const copied = copy(documentMarkdown, { format: 'text/plain' });
    setIsCopied(copied);
    showToast({
      message: localize(copied ? 'com_cooking_markdown_copied' : 'com_ui_copy_failed'),
      severity: copied ? NotificationSeverity.SUCCESS : NotificationSeverity.ERROR,
    });
    if (copied) {
      window.setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleSave = () => {
    if (!canSave || !draft || isSaving) {
      return;
    }

    const payload = {
      title: draft.recipe.title,
      documentType: draft.documentType,
      documentMarkdown,
      recipe: draft.recipe,
      sourceDraftId: draft._id,
      ...(conversationId ? { sourceConversationId: conversationId } : {}),
    };

    if (savedRecipe && hasChangedSavedRecipe) {
      updateSavedRecipe.mutate({
        recipeId: savedRecipe._id,
        payload,
      });
      return;
    }

    if (!savedRecipe) {
      saveRecipe.mutate(payload);
    }
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-primary-alt text-text-primary">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-7 lg:px-10">
        <article className="mx-auto min-h-full max-w-[56rem] rounded-lg border border-border-light bg-surface-primary shadow-[0_4px_20px_-2px_rgba(26,25,23,0.04)]">
          {documentMarkdown ? (
            <header className="border-b border-border-light px-5 py-6 sm:px-8 lg:px-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  {documentParts.title ? (
                    <h1 className="font-serif text-3xl font-normal leading-tight tracking-normal text-text-primary sm:text-4xl">
                      {documentParts.title}
                    </h1>
                  ) : null}
                  {draft ? (
                    <p className="mt-2 text-xs uppercase tracking-wide text-text-secondary">
                      {localize(documentTypeKey(draft))}
                    </p>
                  ) : null}
                  {savedRecipe?.categorizationStatus === 'pending' ? (
                    <p className="mt-2 text-xs text-text-secondary">
                      {localize('com_recipes_categorizing')}
                    </p>
                  ) : null}
                  {isPreparingDraft ? (
                    <p className="mt-2 text-xs text-text-secondary">
                      {localize('com_cooking_updating_canvas')}
                    </p>
                  ) : null}
                </div>
                {canSave ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <TooltipAnchor
                      description={localize('com_cooking_copy_markdown')}
                      render={
                        <button
                          type="button"
                          onClick={handleCopyMarkdown}
                          aria-label={localize('com_cooking_copy_markdown')}
                          className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy"
                        >
                          {isCopied ? (
                            <Check className="size-4" aria-hidden="true" />
                          ) : (
                            <Copy className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      }
                    />
                    <Button
                      size="sm"
                      variant={hasChangedSavedRecipe || !hasSavedRecipe ? 'submit' : 'outline'}
                      disabled={isSaving || (hasSavedRecipe && !hasChangedSavedRecipe)}
                      onClick={handleSave}
                      className="h-9 gap-2 px-3"
                    >
                      {saveIcon}
                      <span>{buttonLabel}</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            </header>
          ) : null}
          {documentMarkdown ? (
            <div className="px-5 py-6 sm:px-8 sm:py-7 lg:px-10">
              <RecipeMetrics metrics={documentParts.metrics} />
              <div className="cooking-recipe-markdown markdown prose light dark:prose-invert max-w-none break-words text-text-primary">
                <Markdown content={documentParts.body} isLatestMessage={false} />
              </div>
            </div>
          ) : (
            <div className="flex min-h-72 items-center justify-center text-sm text-text-secondary">
              {localize('com_cooking_preparing_recipe')}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
