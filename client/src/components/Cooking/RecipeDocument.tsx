/* Hallmark · genre: editorial · macrostructure: Long Document · design-system: DESIGN.md · designed-as-app · pre-emit critique: P5 H5 E5 S5 R5 V4 */
import type { ReactNode } from 'react';
import { ChevronDown, ExternalLink, TriangleAlert } from 'lucide-react';
import { ProtectedImage } from '~/components/ui';
import { displayRecipeTag } from './recipePresentation';

export type RecipeDetailGroup = {
  items: string[];
  label: string;
};

type RecipeDocumentProps = {
  actions?: ReactNode;
  children: ReactNode;
  compactHero?: boolean;
  imageUrl?: string;
  metadata?: ReactNode;
  sourceLabel?: string;
  sourceUrl?: string;
  tags?: string[];
  title: string;
  warnings?: string[];
};

export default function RecipeDocument({
  actions,
  children,
  compactHero = false,
  imageUrl,
  metadata,
  sourceLabel,
  sourceUrl,
  tags = [],
  title,
  warnings = [],
}: RecipeDocumentProps) {
  return (
    <article className="mx-auto w-full max-w-[68rem]" data-testid="recipe-document">
      {imageUrl ? (
        <div
          className={
            compactHero
              ? 'h-[clamp(14rem,32vw,24rem)] overflow-hidden bg-surface-hover sm:rounded-card'
              : 'aspect-[16/7] overflow-hidden bg-surface-hover sm:rounded-card'
          }
        >
          <ProtectedImage
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            fallback={<div className="h-full w-full bg-surface-hover" />}
          />
        </div>
      ) : null}

      <div className="mx-auto max-w-[48rem] px-4 py-7 sm:px-8 sm:py-10">
        <header className="border-b border-border-light pb-7">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="min-w-0">
                <h1 className="rekky-title min-w-0 text-text-primary [overflow-wrap:anywhere]">
                  {title}{' '}
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={sourceLabel}
                      className="ml-1 inline-flex size-9 translate-y-0.5 items-center justify-center rounded-control align-middle text-text-secondary transition-colors hover:bg-surface-hover hover:text-surface-submit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-1"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                    </a>
                  ) : null}
                </h1>
              </div>
              {metadata ? (
                <div className="rekky-meta mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-text-secondary">
                  {metadata}
                </div>
              ) : null}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>

          {tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border-light bg-surface-primary-alt px-2.5 py-1 text-xs capitalize text-text-secondary"
                >
                  {displayRecipeTag(tag)}
                </span>
              ))}
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {warnings.map((warning) => (
                <span
                  key={warning}
                  className="border-status-caution/50 bg-status-caution/10 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize text-status-caution"
                >
                  <TriangleAlert className="size-3" aria-hidden="true" />
                  {displayRecipeTag(warning)}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        <div className="pt-7">{children}</div>
      </div>
    </article>
  );
}

export function RecipeDetailsDisclosure({
  groups,
  label,
}: {
  groups: RecipeDetailGroup[];
  label: string;
}) {
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  if (!visibleGroups.length) return null;

  return (
    <details className="group/details mb-8 border-y border-border-light">
      <summary className="flex min-h-11 w-full cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium text-text-secondary transition-colors marker:content-none hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px">
        <span>{label}</span>
        <ChevronDown
          className="ml-auto size-4 transition-transform group-open/details:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="grid gap-5 border-t border-border-light py-4 sm:grid-cols-2">
        {visibleGroups.map((group) => (
          <div key={group.label} className="min-w-0">
            <h2 className="rekky-meta text-text-secondary">{group.label}</h2>
            <p className="mt-1.5 max-w-[68ch] text-sm leading-6 text-text-primary">
              {group.items.map(displayRecipeTag).join(' · ')}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}
