import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Heart,
  MessageSquare,
  MoreHorizontal,
  Pin,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, Input, TextareaAutosize } from '@librechat/client';
import { EModelEndpoint } from 'librechat-data-provider';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import {
  useRecipeQuery,
  useUpdateSavedRecipeMutation,
  useCreateCookingDocumentMutation,
} from '~/data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import RecipeMetrics from './Metrics';
import RecipeDocument, { RecipeDetailsDisclosure } from './RecipeDocument';
import RecipeHeaderAction from './RecipeHeaderAction';
import ShareAction from './ShareAction';
import RecipeInstructions, { hasDisplayableInstructions } from './RecipeInstructions';
import StructuredIngredients, { hasDisplayableIngredients } from './StructuredIngredients';
import {
  recipeBodyMarkdown,
  recipeDisplayTitle,
  recipeMarkdownDisplay,
  structuredRecipeMarkdownSections,
} from './recipe';
import {
  recipeSourceLabel,
  savedRecipePresentation,
  uniqueRecipeValues,
} from './recipePresentation';
import useRecipeWorkspace from './useRecipeWorkspace';

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
  const { newConversation } = useNewConvo();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const [draftCollections, setDraftCollections] = useState('');
  const [personalNotes, setPersonalNotes] = useState('');
  const recipeQuery = useRecipeQuery(recipeId, {
    refetchInterval: (recipe) =>
      recipe?.categorizationStatus === 'pending' ||
      recipe?.illustrationStatus === 'pending' ||
      recipe?.illustrationStatus === 'generating'
        ? 3000
        : false,
  });
  const recipe = recipeQuery.data;
  const [workspaceState, updateWorkspaceState] = useRecipeWorkspace(
    recipe?.workspaceState,
    recipe
      ? (next) => updateRecipe.mutate({ recipeId: recipe._id, payload: { workspaceState: next } })
      : undefined,
  );

  useEffect(() => {
    if (!recipe || isEditing) {
      return;
    }
    setDraftTitle(recipeDisplayTitle(recipe));
    setDraftMarkdown(recipeBodyMarkdown(recipe));
    setDraftCollections(recipe.collections.join(', '));
    setPersonalNotes(recipe.personalNotes ?? '');
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

  const presentation = savedRecipePresentation(recipe);
  const documentTags = uniqueRecipeValues([
    ...recipe.collections,
    ...presentation.primaryTags,
    ...presentation.diets,
  ]);
  const updatedAt = formatRecipeDate(recipe.updatedAt);
  const markdown = recipeBodyMarkdown(recipe);
  const markdownDisplay = recipeMarkdownDisplay(markdown);
  const hasStructuredIngredients = recipe.recipe
    ? hasDisplayableIngredients(recipe.recipe.ingredients)
    : false;
  const hasStructuredSteps = hasDisplayableInstructions(recipe.recipe);
  const recipeSections = structuredRecipeMarkdownSections(markdownDisplay.body, {
    ingredients: hasStructuredIngredients,
    instructions: hasStructuredSteps,
  });
  const saveDisabled =
    updateRecipe.isLoading || draftTitle.trim().length === 0 || draftMarkdown.trim().length === 0;

  const startEditing = () => {
    setDraftTitle(recipeDisplayTitle(recipe));
    setDraftMarkdown(markdown);
    setDraftCollections(recipe.collections.join(', '));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraftTitle(recipeDisplayTitle(recipe));
    setDraftMarkdown(markdown);
    setDraftCollections(recipe.collections.join(', '));
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
          collections: draftCollections
            .split(',')
            .map((collection) => collection.trim())
            .filter(Boolean),
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
    const title = `Discuss ${recipeDisplayTitle(recipe)}`;
    createCookingDocument.mutate(
      {
        prompt: title,
        conversationId: newConvoId,
        savedRecipeId: recipe._id,
        documentMarkdown: recipe.documentMarkdown,
        documentType: recipe.documentType,
        recipe: recipe.recipe,
      },
      {
        onSuccess: () => {
          newConversation({
            template: {
              conversationId: newConvoId,
              title,
              endpoint: EModelEndpoint.agents,
              cookingCategory: 'saved_recipe',
              savedRecipeId: recipe._id,
            },
            buildDefault: false,
            keepLatestMessage: false,
            routeBase: '/cook',
          });
        },
      },
    );
  };

  return (
    <main className="rekky-ui rekky-recipe-surface h-full overflow-y-auto bg-surface-primary-alt text-text-primary sm:px-7 sm:py-7 lg:px-10">
      <div className="mx-auto max-w-[68rem] pt-10 sm:pt-0">
        <div className="flex min-h-11 items-center justify-between px-4 sm:px-0">
          <Link
            to="/recipes"
            className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-control text-sm font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
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
        <div className="mt-4">
          <RecipeDocument
            title={isEditing ? localize('com_recipes_edit_recipe') : recipeDisplayTitle(recipe)}
            imageUrl={!isEditing ? recipe.illustrationUrl : undefined}
            sourceUrl={!isEditing ? recipe.sourceUrl : undefined}
            sourceLabel={recipe.sourceUrl ? recipeSourceLabel(recipe.sourceUrl) : undefined}
            metadata={
              !isEditing ? (
                <>
                  <span>{documentTypeLabel(localize, recipe.documentType)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {localize(
                      recipe.saveList === 'cooked_already'
                        ? 'com_recipes_save_list_cooked_already'
                        : 'com_recipes_save_list_want_to_cook',
                    )}
                  </span>
                  {recipe.lineage ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <Link
                        to={`/r/${recipe.lineage.parentRecipeId}`}
                        className="hover:text-text-primary hover:underline"
                      >
                        {localize('com_public_adapted_from', {
                          name: recipe.lineage.parentAuthor.name,
                        })}
                      </Link>
                    </>
                  ) : null}
                  {updatedAt ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{localize('com_recipes_updated_date', { date: updatedAt })}</span>
                    </>
                  ) : null}
                </>
              ) : null
            }
            tags={!isEditing ? documentTags : []}
            warnings={!isEditing ? presentation.allergens : []}
            actions={
              !isEditing ? (
                <div className="flex items-center gap-2">
                  <RecipeHeaderAction
                    type="button"
                    variant="primary"
                    disabled={createCookingDocument.isLoading}
                    onClick={discussWithAI}
                    aria-label={localize('com_recipes_discuss_ai')}
                    icon={<MessageSquare className="size-4" aria-hidden="true" />}
                  >
                    {localize('com_ui_chat')}
                  </RecipeHeaderAction>
                  <RecipeHeaderAction
                    type="button"
                    aria-pressed={recipe.favorite}
                    onClick={() =>
                      updateRecipe.mutate({
                        recipeId: recipe._id,
                        payload: { favorite: !recipe.favorite },
                      })
                    }
                    aria-label={localize(
                      recipe.favorite ? 'com_recipes_remove_favorite' : 'com_recipes_add_favorite',
                    )}
                    icon={<Heart className={`size-4 ${recipe.favorite ? 'fill-current' : ''}`} />}
                    labelClassName="sr-only"
                    className={recipe.favorite ? 'border-border-medium text-text-primary' : ''}
                  >
                    {localize('com_recipes_favorites')}
                  </RecipeHeaderAction>
                  <ShareAction
                    title={recipe.title}
                    url={`/r/${recipe._id}`}
                    showLabel={false}
                    className="inline-flex size-11 items-center justify-center rounded-control border border-border-light text-text-secondary transition-colors hover:border-border-medium hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
                  />
                  <details className="group/actions relative">
                    <summary
                      className="inline-flex size-11 list-none items-center justify-center rounded-control border border-border-light text-text-secondary transition-colors marker:content-none hover:border-border-medium hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
                      aria-label={localize('com_recipes_recipe_actions', { 0: recipe.title })}
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </summary>
                    <div className="absolute right-0 top-12 z-dropdown min-w-52 rounded-card border border-border-light bg-surface-primary p-1.5 shadow-floating">
                      <button
                        type="button"
                        aria-pressed={recipe.pinned}
                        className="flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-control px-3 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
                        onClick={() =>
                          updateRecipe.mutate({
                            recipeId: recipe._id,
                            payload: { pinned: !recipe.pinned },
                          })
                        }
                      >
                        <Pin className={`size-4 ${recipe.pinned ? 'fill-current' : ''}`} />
                        {localize(recipe.pinned ? 'com_recipes_unpin' : 'com_recipes_pin')}
                      </button>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-control px-3 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
                        onClick={() =>
                          updateRecipe.mutate({
                            recipeId: recipe._id,
                            payload: {
                              saveList:
                                recipe.saveList === 'cooked_already'
                                  ? 'want_to_cook'
                                  : 'cooked_already',
                            },
                          })
                        }
                      >
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        {localize(
                          recipe.saveList === 'cooked_already'
                            ? 'com_recipe_mark_want_to_cook'
                            : 'com_recipe_mark_cooked',
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={localize('com_recipes_edit_markdown_btn')}
                        className="flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-control px-3 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
                        onClick={startEditing}
                      >
                        <Edit3 className="size-4" aria-hidden="true" />
                        {localize('com_ui_edit')}
                      </button>
                    </div>
                  </details>
                </div>
              ) : null
            }
          >
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
                    {localize('com_recipes_collections_field')}
                  </span>
                  <Input
                    value={draftCollections}
                    onChange={(event) => setDraftCollections(event.target.value)}
                    placeholder={localize('com_recipes_collections_placeholder')}
                    className="min-h-11 bg-surface-primary-alt"
                  />
                  <span className="text-xs text-text-secondary">
                    {localize('com_recipes_collections_hint')}
                  </span>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-text-secondary">
                    {localize('com_recipes_edit_markdown')}
                  </span>
                  <TextareaAutosize
                    aria-label={localize('com_recipes_edit_markdown')}
                    value={draftMarkdown}
                    onChange={(event) => setDraftMarkdown(event.target.value)}
                    rows={18}
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
                {recipeSections.preamble ? (
                  <div className="cooking-recipe-markdown markdown prose light dark:prose-invert mb-7 max-w-none break-words text-text-primary">
                    <Markdown content={recipeSections.preamble} isLatestMessage={false} />
                  </div>
                ) : null}
                <RecipeMetrics metrics={markdownDisplay.metrics} />
                <RecipeDetailsDisclosure
                  label={localize('com_recipe_equipment_details')}
                  groups={[
                    {
                      label: localize('com_recipe_equipment'),
                      items: presentation.equipment,
                    },
                    { label: localize('com_ui_details'), items: presentation.detailTags },
                  ]}
                />
                {hasStructuredIngredients ? (
                  <StructuredIngredients
                    ingredients={recipe.recipe?.ingredients ?? []}
                    onWorkspaceChange={updateWorkspaceState}
                    recipeId={recipe._id}
                    recipeTitle={recipe.title}
                    servings={recipe.recipe?.servings}
                    workspaceState={workspaceState}
                  />
                ) : null}
                {recipe.recipe && hasStructuredSteps ? (
                  <RecipeInstructions
                    onWorkspaceChange={updateWorkspaceState}
                    recipe={recipe.recipe}
                    workspaceState={workspaceState}
                  />
                ) : null}
                {recipeSections.remainder ? (
                  <div className="cooking-recipe-markdown markdown prose light dark:prose-invert max-w-none break-words text-text-primary">
                    <Markdown content={recipeSections.remainder} isLatestMessage={false} />
                  </div>
                ) : null}
                <section className="mt-9 border-t border-border-light pt-7">
                  <h2 className="rekky-section-title text-text-primary">
                    {localize('com_recipe_personal_notes')}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {localize('com_recipe_personal_notes_hint')}
                  </p>
                  <textarea
                    rows={4}
                    value={personalNotes}
                    onChange={(event) => setPersonalNotes(event.target.value)}
                    onBlur={() =>
                      updateRecipe.mutate({
                        recipeId: recipe._id,
                        payload: { personalNotes },
                      })
                    }
                    placeholder={localize('com_recipe_notes_placeholder')}
                    className="mt-4 w-full resize-y rounded-lg border border-border-light bg-surface-primary-alt p-3 text-sm leading-6 text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                  />
                </section>
              </>
            )}
          </RecipeDocument>
        </div>
      </div>
    </main>
  );
}
