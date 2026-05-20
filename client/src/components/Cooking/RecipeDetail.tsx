import { useEffect, useState } from 'react';
import { Edit3 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, Input, TextareaAutosize } from '@librechat/client';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { useRecipeQuery, useUpdateSavedRecipeMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { recipeBodyMarkdown, recipeDisplayTitle } from './recipe';

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

export default function RecipeDetail() {
  const localize = useLocalize();
  const { recipeId } = useParams();
  const updateRecipe = useUpdateSavedRecipeMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const recipeQuery = useRecipeQuery(recipeId, {
    refetchInterval: (recipe) =>
      recipe?.categorizationStatus === 'pending' || recipe?.illustrationStatus === 'pending'
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
  const metadataSet = new Set(metadata);
  const secondaryChips = categoryChips(recipe).filter((chip) => !metadataSet.has(chip));
  const markdown = recipeBodyMarkdown(recipe);
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

  return (
    <main className="h-full overflow-y-auto bg-surface-primary-alt px-4 py-6 text-text-primary sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[56rem]">
        <Link to="/recipes" className="text-sm text-text-secondary hover:text-text-primary">
          {localize('com_recipes_back_to_library')}
        </Link>
        <article className="mt-4 rounded-lg border border-border-light bg-surface-primary px-5 py-6 shadow-sm sm:px-8 sm:py-8 lg:px-10">
          <header className="mb-5 border-b border-border-light pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <h1 className="text-2xl font-semibold">
                {isEditing ? localize('com_recipes_edit_recipe') : recipeDisplayTitle(recipe)}
              </h1>
              <div className="flex shrink-0 items-center gap-2">
                {recipe.categorizationStatus === 'pending' ? (
                  <span className="text-xs text-text-secondary">
                    {localize('com_recipes_categorizing')}
                  </span>
                ) : null}
                {!isEditing ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={startEditing}
                  >
                    <Edit3 className="h-4 w-4" aria-hidden="true" />
                    <span>{localize('com_ui_edit')}</span>
                  </Button>
                ) : null}
              </div>
            </div>
            {!isEditing && metadata.length > 0 ? (
              <p className="mt-4 text-sm capitalize text-text-secondary">
                {metadata.map(displayTag).join(' · ')}
              </p>
            ) : null}
            {!isEditing && secondaryChips.length > 0 ? (
              <details className="group mt-3">
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
              <div className="flex items-center justify-end gap-2">
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
            <div className="markdown prose light dark:prose-invert max-w-none break-words text-text-primary">
              <Markdown content={markdown} isLatestMessage={false} />
            </div>
          )}
        </article>
      </div>
    </main>
  );
}
