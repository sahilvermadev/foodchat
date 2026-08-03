/* Hallmark · genre: editorial · macrostructure: Catalogue · design-system: DESIGN.md · designed-as-app · pre-emit critique: P5 H5 E5 S5 R5 V4 */
import { Link, useParams } from 'react-router-dom';
import { ProtectedImage } from '~/components/ui';
import { usePublicProfileQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import {
  collectionCard,
  collectionCardBody,
  collectionCardMedia,
  collectionCardTitle,
  collectionGrid,
} from './collection';
import ShareAction from './ShareAction';
import { publicProfilePath } from './public';
import { displayRecipeTag } from './recipePresentation';
import usePublicMetadata from './usePublicMetadata';

export default function PublicProfile() {
  const localize = useLocalize();
  const { userId } = useParams();
  const profileQuery = usePublicProfileQuery(userId);
  const profile = profileQuery.data?.pages[0];
  const recipes = profileQuery.data?.pages.flatMap((page) => page.recipes) ?? [];
  usePublicMetadata({
    title: profile?.author.name,
    description: profile
      ? localize('com_public_profile_description', {
          count: profile.total,
          name: profile.author.name,
        })
      : undefined,
    image: profile?.author.avatar,
  });

  if (profileQuery.isLoading)
    return (
      <main className="rekky-ui flex min-h-dvh items-center justify-center bg-surface-primary-alt text-text-secondary">
        {localize('com_ui_loading')}
      </main>
    );
  if (!profile)
    return (
      <main className="rekky-ui flex min-h-dvh items-center justify-center bg-surface-primary-alt text-text-secondary">
        {localize('com_public_profile_not_found')}
      </main>
    );

  return (
    <main className="rekky-ui min-h-dvh bg-surface-primary-alt text-text-primary">
      <header className="border-b border-border-light">
        <div className="mx-auto flex min-h-16 max-w-[90rem] items-center justify-between px-5 sm:px-10">
          <Link
            to="/"
            className="rekky-wordmark rounded-control text-text-primary transition-colors hover:text-surface-submit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            aria-label={localize('com_landing_home')}
          >
            {localize('com_landing_brand')}
          </Link>
          <ShareAction
            title={profile.author.name}
            url={publicProfilePath(profile.author)}
            className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-control border border-border-light px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
          />
        </div>
      </header>
      <div className="mx-auto max-w-[90rem] px-5 py-10 sm:px-10 sm:py-14">
        <section className="mb-8 border-b border-border-light pb-8 sm:mb-10 sm:pb-10">
          <div className="flex min-w-0 flex-col items-start gap-4 min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-5">
            {profile.author.avatar ? (
              <img
                src={profile.author.avatar}
                alt=""
                className="size-16 shrink-0 rounded-full object-cover sm:size-20"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-surface-hover text-xl font-semibold sm:size-20 sm:text-2xl">
                {profile.author.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="min-w-0 text-[clamp(2rem,4vw,3rem)] font-medium leading-none tracking-[-0.01em] [overflow-wrap:anywhere]">
                {profile.author.name}
              </h1>
              {profile.author.username ? (
                <p className="mt-2 break-all text-sm text-text-secondary">
                  @{profile.author.username}
                </p>
              ) : null}
              <p className="mt-3 max-w-[52ch] text-sm leading-6 text-text-secondary">
                {localize('com_public_profile_intro', { name: profile.author.name })}
              </p>
              <p className="rekky-meta mt-3 text-text-secondary">
                {localize('com_public_recipe_count', { count: profile.total })}
              </p>
            </div>
          </div>
        </section>
        {recipes.length ? (
          <>
            <div className={collectionGrid}>
              {recipes.map((recipe, index) => {
                const cuisine = recipe.categorization?.cuisine[0];
                const metadata = [
                  ...(recipe.totalMinutes
                    ? [localize('com_cooking_minutes_short', { 0: recipe.totalMinutes })]
                    : []),
                  ...(cuisine ? [displayRecipeTag(cuisine)] : []),
                ];

                return (
                  <article key={recipe._id} className={collectionCard}>
                    <Link
                      to={`/r/${recipe._id}`}
                      className="absolute inset-0 z-base rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                      aria-label={recipe.title}
                    />
                    <div className={collectionCardMedia}>
                      {recipe.illustrationUrl ? (
                        <ProtectedImage
                          src={recipe.illustrationUrl}
                          alt=""
                          loading={index < 4 ? 'eager' : 'lazy'}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className={collectionCardBody}>
                      <h2
                        className={`${collectionCardTitle} transition-colors group-focus-within:text-surface-submit group-hover:text-surface-submit group-hover:underline group-hover:decoration-surface-submit group-hover:underline-offset-4`}
                      >
                        {recipe.title}
                      </h2>
                      {metadata.length ? (
                        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs capitalize text-text-secondary">
                          {metadata.map((item, metadataIndex) => (
                            <span key={item}>
                              {metadataIndex > 0 ? <span aria-hidden="true">· </span> : null}
                              {item}
                            </span>
                          ))}
                        </p>
                      ) : null}
                      {recipe.lineage ? (
                        <p className="mt-1 text-xs text-text-secondary">
                          {localize('com_public_adapted_from', {
                            name: recipe.lineage.parentAuthor.name,
                          })}
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            {profileQuery.hasNextPage ? (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => void profileQuery.fetchNextPage()}
                  disabled={profileQuery.isFetchingNextPage}
                  className="min-h-11 whitespace-nowrap rounded-control border border-border-light px-5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {localize(
                    profileQuery.isFetchingNextPage ? 'com_ui_loading' : 'com_public_load_more',
                  )}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-text-secondary">{localize('com_public_no_recipes')}</p>
        )}
      </div>
    </main>
  );
}
