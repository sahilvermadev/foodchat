/* Hallmark · genre: editorial · macrostructure: Long Document · design-system: DESIGN.md · designed-as-app · pre-emit critique: P5 H5 E5 S5 R5 V4 */
import { BookOpen } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { useCopyPublicRecipeMutation, usePublicRecipeQuery } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { cn, getPublicReturnTarget, persistRedirectToSession, setAuthMode } from '~/utils';
import RecipeDocument from './RecipeDocument';
import RecipeInstructions, { hasDisplayableInstructions } from './RecipeInstructions';
import RecipeMetrics from './Metrics';
import ShareAction from './ShareAction';
import StructuredIngredients, { hasDisplayableIngredients } from './StructuredIngredients';
import { recipeSourceLabel } from './recipePresentation';
import { publicProfilePath } from './public';
import usePublicMetadata from './usePublicMetadata';

function publicTags(
  recipe: NonNullable<ReturnType<typeof usePublicRecipeQuery>['data']>,
): string[] {
  const categorization = recipe.categorization;
  return [
    ...new Set([
      ...(categorization?.cuisine ?? []),
      ...(categorization?.mealType ?? []),
      ...(categorization?.diet ?? []),
    ]),
  ].slice(0, 8);
}

export default function PublicRecipe() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const { recipeId } = useParams();
  const { isAuthenticated, user } = useAuthContext();
  const recipeQuery = usePublicRecipeQuery(recipeId);
  const copyRecipe = useCopyPublicRecipeMutation();
  const recipe = recipeQuery.data;
  usePublicMetadata({
    title: recipe?.title,
    description: recipe?.shortDescription,
    image: recipe?.illustrationUrl,
  });

  if (recipeQuery.isLoading) {
    return (
      <main className="rekky-ui flex min-h-dvh items-center justify-center bg-surface-primary-alt text-text-secondary">
        {localize('com_ui_loading')}
      </main>
    );
  }
  if (!recipe) {
    return (
      <main className="rekky-ui flex min-h-dvh items-center justify-center bg-surface-primary-alt text-text-secondary">
        {localize('com_public_recipe_not_found')}
      </main>
    );
  }

  const isOwner = user?.id === recipe.author.id;
  const structured = recipe.recipe;
  const metrics = structured
    ? [
        { label: localize('com_recipe_servings'), value: String(structured.servings) },
        ...(structured.timing.prepMinutes > 0
          ? [
              {
                label: localize('com_public_prep_time'),
                value: localize('com_cooking_minutes_short', {
                  0: structured.timing.prepMinutes,
                }),
              },
            ]
          : []),
        ...(structured.timing.cookMinutes > 0
          ? [
              {
                label: localize('com_public_cook_time'),
                value: localize('com_cooking_minutes_short', {
                  0: structured.timing.cookMinutes,
                }),
              },
            ]
          : []),
        ...(structured.timing.totalMinutes > 0
          ? [
              {
                label: localize('com_public_total_time'),
                value: localize('com_cooking_minutes_short', {
                  0: structured.timing.totalMinutes,
                }),
              },
            ]
          : []),
      ]
    : [];
  const copy = () => {
    if (!isAuthenticated) {
      persistRedirectToSession(
        getPublicReturnTarget(location.pathname, location.search, location.hash),
      );
      navigate(
        {
          pathname: location.pathname,
          search: setAuthMode(location.search, 'login'),
          hash: location.hash,
        },
        { state: { contextualAuth: true } },
      );
      return;
    }
    if (isOwner) {
      navigate(`/recipes/${recipe._id}`);
      return;
    }
    copyRecipe.mutate(recipe._id, { onSuccess: (saved) => navigate(`/recipes/${saved._id}`) });
  };

  return (
    <main className="rekky-ui rekky-recipe-surface min-h-dvh bg-surface-primary-alt text-text-primary">
      <header className="bg-surface-primary-alt/90 sticky top-0 z-sticky border-b border-border-light backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[68rem] items-center justify-between px-4 sm:px-8">
          <Link
            to="/"
            className="rekky-wordmark rounded-control text-text-primary transition-colors hover:text-surface-submit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            aria-label={localize('com_landing_home')}
          >
            {localize('com_landing_brand')}
          </Link>
          <div className="flex items-center gap-2">
            <ShareAction
              title={recipe.title}
              url={`/r/${recipe._id}`}
              className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-control border border-border-light px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
            />
            <button
              type="button"
              onClick={copy}
              disabled={copyRecipe.isLoading}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-control px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60',
                isOwner
                  ? 'border border-border-light text-text-primary hover:bg-surface-hover'
                  : 'bg-surface-submit text-text-submit hover:bg-surface-submit-hover',
              )}
            >
              <BookOpen className="size-4" aria-hidden="true" />
              {localize(isOwner ? 'com_public_edit_in_rekky' : 'com_public_save_copy')}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[68rem] pt-5">
        {copyRecipe.isError ? (
          <p
            role="alert"
            className="bg-status-danger/10 mx-4 mb-3 rounded-control px-3 py-2 text-sm text-status-danger sm:mx-8"
          >
            {localize('com_public_copy_error')}
          </p>
        ) : null}
        <Link
          to={publicProfilePath(recipe.author)}
          className="mx-4 inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary sm:mx-8"
        >
          {recipe.author.avatar ? (
            <img src={recipe.author.avatar} alt="" className="size-6 rounded-full object-cover" />
          ) : (
            <span
              className="flex size-6 items-center justify-center rounded-full bg-surface-hover text-[0.7rem] font-semibold text-text-primary"
              aria-hidden="true"
            >
              {recipe.author.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {localize('com_public_recipes_by', { name: recipe.author.name })}
        </Link>
        <RecipeDocument
          compactHero={true}
          title={recipe.title}
          imageUrl={recipe.illustrationUrl}
          sourceUrl={recipe.sourceUrl}
          sourceLabel={recipe.sourceUrl ? recipeSourceLabel(recipe.sourceUrl) : undefined}
          tags={publicTags(recipe)}
          metadata={
            <>
              <Link
                to={publicProfilePath(recipe.author)}
                className="font-medium text-text-primary hover:underline"
              >
                {recipe.author.name}
              </Link>
              {recipe.lineage ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {localize('com_public_adapted_from', {
                      name: recipe.lineage.parentAuthor.name,
                    })}
                  </span>
                </>
              ) : null}
            </>
          }
        >
          <RecipeMetrics metrics={metrics} />
          {recipe.shortDescription ? (
            <p className="mb-7 max-w-[68ch] text-lg leading-8 text-text-secondary">
              {recipe.shortDescription}
            </p>
          ) : null}
          {structured && hasDisplayableIngredients(structured.ingredients) ? (
            <StructuredIngredients
              ingredients={structured.ingredients}
              servings={structured.servings}
            />
          ) : null}
          {structured && hasDisplayableInstructions(structured) ? (
            <RecipeInstructions recipe={structured} />
          ) : null}
          {!structured ? (
            <Markdown content={recipe.documentMarkdown} isLatestMessage={false} />
          ) : null}
          {structured?.notes.length ? (
            <section className="mt-8 border-t border-border-light pt-7">
              <h2 className="rekky-section-title">{localize('com_public_notes')}</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6">
                {structured.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </RecipeDocument>
      </div>
    </main>
  );
}
