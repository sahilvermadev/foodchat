import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import copy from 'copy-to-clipboard';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkDirective from 'remark-directive';
import type { Pluggable } from 'unified';
import type {
  CookingDraft,
  SavedRecipeList,
  SaveRecipeRequest,
  StructuredRecipe,
} from 'librechat-data-provider';
import {
  BookmarkCheck,
  BookmarkPlus,
  Check,
  ChevronDown,
  Copy,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TooltipAnchor,
  useToastContext,
} from '@librechat/client';
import {
  useSaveRecipeMutation,
  useRecipeQuery,
  useSavedRecipeByDraftQuery,
  useUpdateSavedRecipeMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';
import {
  a as StandardA,
  p,
  img,
  table as MarkdownTable,
} from '~/components/Chat/Messages/Content/MarkdownComponents';
import { Citation, CompositeCitation, HighlightedText } from '~/components/Web/Citation';
import {
  MCPUIResource,
  MCPUIResourceCarousel,
  mcpUIResourcePlugin,
} from '~/components/MCPUIResource';
import { RekkyJsonMarkdownCode } from '~/components/RekkyJsonRender';
import { CodeBlockProvider } from '~/Providers';
import { unicodeCitation } from '~/components/Web';
import { langSubset } from '~/utils';
import RecipeMetrics from './Metrics';
import RecipeDocument, { RecipeDetailsDisclosure } from './RecipeDocument';
import RecipeInstructions, { hasDisplayableInstructions } from './RecipeInstructions';
import StructuredIngredients, { hasDisplayableIngredients } from './StructuredIngredients';
import { recipeMarkdownDisplay, structuredRecipeMarkdownSections } from './recipe';
import {
  recipeSourceLabel,
  savedRecipePresentation,
  uniqueRecipeValues,
} from './recipePresentation';
import { remarkCookingTimers } from './timerMarkdown';
import { playTimerCompleteAlarm, prepareTimerAlarm } from './timerAlarm';
import useRecipeWorkspace from './useRecipeWorkspace';
import VoiceAssistantWidget from './VoiceAssistantWidget';

export function KitchenTimer({ seconds, label }: { seconds: number; label?: string }) {
  const localize = useLocalize();
  const [timeLeft, setTimeLeft] = useState(seconds);
  const [isRunning, setIsRunning] = useState(false);
  const endsAtRef = useRef<number | null>(null);

  const syncRemainingTime = useCallback(() => {
    const endsAt = endsAtRef.current;
    if (endsAt === null) {
      return;
    }

    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    setTimeLeft(remaining);
    if (remaining > 0) {
      return;
    }

    endsAtRef.current = null;
    setIsRunning(false);
    try {
      playTimerCompleteAlarm();
    } catch (error) {
      console.error('Timer alarm failed:', error);
    }
  }, []);

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    syncRemainingTime();
    const interval = window.setInterval(syncRemainingTime, 250);
    document.addEventListener('visibilitychange', syncRemainingTime);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', syncRemainingTime);
    };
  }, [isRunning, syncRemainingTime]);

  const isCompleted = timeLeft === 0;
  const hasStarted = timeLeft !== seconds;
  const timerName = label
    ? localize('com_cooking_named_timer', { 0: label })
    : localize('com_cooking_timer');

  const handlePrimaryAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCompleted) {
      prepareTimerAlarm();
      setTimeLeft(seconds);
      endsAtRef.current = Date.now() + seconds * 1000;
      setIsRunning(true);
      return;
    }
    if (isRunning) {
      syncRemainingTime();
      endsAtRef.current = null;
      setIsRunning(false);
      return;
    }

    prepareTimerAlarm();
    endsAtRef.current = Date.now() + timeLeft * 1000;
    setIsRunning(true);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    endsAtRef.current = null;
    setIsRunning(false);
    setTimeLeft(seconds);
  };

  const minutes = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeString = `${minutes}:${secs.toString().padStart(2, '0')}`;
  let timerToneClass = 'border-border-light bg-surface-primary text-text-secondary';
  if (isRunning) {
    timerToneClass = 'border-status-caution/25 bg-status-caution/10 text-status-caution';
  }
  if (isCompleted) {
    timerToneClass = 'border-status-success/25 bg-status-success/10 text-status-success';
  }
  let primaryActionLabel = localize('com_cooking_start_named_timer', { 0: timerName });
  if (isRunning) {
    primaryActionLabel = localize('com_cooking_pause_named_timer', { 0: timerName });
  }
  if (isCompleted) {
    primaryActionLabel = localize('com_cooking_restart_named_timer', { 0: timerName });
  }

  let timerIcon = <Play className="h-3 w-3" aria-hidden="true" />;
  if (isRunning) {
    timerIcon = <Pause className="h-3 w-3" aria-hidden="true" />;
  }
  if (isCompleted) {
    timerIcon = <Check className="h-3 w-3" aria-hidden="true" />;
  }

  return (
    <span
      className={`rekky-timer mx-1 my-1 inline-flex min-h-11 select-none items-center gap-0.5 rounded-control border px-1 text-[0.72rem] font-semibold leading-none transition-colors duration-200 ${timerToneClass}`}
      style={{ verticalAlign: '-0.35em' }}
      aria-label={`${timerName} ${timeString}`}
      title={timerName}
    >
      <button
        type="button"
        onClick={handlePrimaryAction}
        className="inline-flex min-h-11 min-w-16 items-center justify-center gap-1 rounded-control px-2 tabular-nums transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
        aria-label={primaryActionLabel}
        title={primaryActionLabel}
      >
        {timerIcon}
        <span>{timeString}</span>
      </button>

      {hasStarted && (
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex size-11 items-center justify-center rounded-control text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
          aria-label={localize('com_cooking_reset_named_timer', { 0: timerName })}
          title={localize('com_cooking_reset_timer')}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

type RekkyTimerElementProps = {
  seconds?: number | string;
  label?: string;
};

const RekkyTimerElement = React.memo(function RekkyTimerElement({
  seconds: rawSeconds,
  label,
}: RekkyTimerElementProps) {
  const seconds = Number(rawSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return <KitchenTimer seconds={seconds} label={label} />;
});

type RecipeCanvasProps = {
  draft?: CookingDraft;
  markdown?: string;
  conversationId?: string;
  savedRecipeId?: string;
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
  savedRecipeId,
  isPreparingDraft,
}: RecipeCanvasProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isCopied, setIsCopied] = useState(false);
  const refetchSavedRecipeWhileProcessing = (recipe?: {
    categorizationStatus?: string;
    illustrationStatus?: string;
  }) =>
    recipe?.categorizationStatus === 'pending' ||
    recipe?.illustrationStatus === 'pending' ||
    recipe?.illustrationStatus === 'generating'
      ? 3000
      : false;
  const savedRecipeByIdQuery = useRecipeQuery(savedRecipeId, {
    enabled: Boolean(savedRecipeId),
    refetchInterval: refetchSavedRecipeWhileProcessing,
  });
  const savedRecipeByDraftQuery = useSavedRecipeByDraftQuery(draft?._id, {
    enabled: Boolean(draft?._id) && !savedRecipeId,
    refetchInterval: refetchSavedRecipeWhileProcessing,
  });
  const saveRecipe = useSaveRecipeMutation();
  const updateSavedRecipe = useUpdateSavedRecipeMutation();
  const savedRecipe = savedRecipeByIdQuery.data ?? savedRecipeByDraftQuery.data;
  const [workspaceState, updateWorkspaceState] = useRecipeWorkspace(
    savedRecipe?.workspaceState,
    savedRecipe
      ? (next) =>
          updateSavedRecipe
            .mutateAsync({
              recipeId: savedRecipe._id,
              payload: { workspaceState: next },
            })
            .then(() => undefined)
      : undefined,
  );

  const documentMarkdown = useMemo(() => {
    const assistantMarkdown = markdown.trim();
    if (assistantMarkdown) {
      return assistantMarkdown;
    }
    return draft ? recipeToMarkdown(draft.recipe) : '';
  }, [draft, markdown]);

  const voiceWorkspaceContext = useMemo(() => {
    if (!draft) return '';
    const checkedIds = new Set(workspaceState?.checkedIngredientIds ?? []);
    const checkedIngredients = draft.recipe.ingredients
      .filter((ingredient) => checkedIds.has(ingredient.id))
      .map((ingredient) => ingredient.item);
    return [
      `Recipe revision: ${workspaceState?.updatedAt ?? draft.updatedAt}`,
      `Servings: ${workspaceState?.servings ?? draft.recipe.servings}`,
      `Unit mode: ${workspaceState?.unitMode ?? 'original'}`,
      `Checked ingredients: ${checkedIngredients.length ? checkedIngredients.join(', ') : 'none'}`,
    ].join('\n');
  }, [draft, workspaceState]);

  const documentParts = useMemo(
    () => recipeMarkdownDisplay(documentMarkdown, draft?.recipe.title),
    [documentMarkdown, draft?.recipe.title],
  );
  const hasStructuredIngredients = draft?.recipe
    ? hasDisplayableIngredients(draft.recipe.ingredients)
    : false;
  const hasStructuredSteps = hasDisplayableInstructions(draft?.recipe);

  const documentSections = useMemo(
    () =>
      structuredRecipeMarkdownSections(documentParts.body, {
        ingredients: hasStructuredIngredients,
        instructions: hasStructuredSteps,
      }),
    [documentParts.body, hasStructuredIngredients, hasStructuredSteps],
  );

  const rehypePlugins = useMemo(
    () => [
      [rehypeKatex],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
    ],
    [],
  );

  const remarkPlugins = useMemo<Pluggable[]>(
    () => [
      supersub,
      remarkGfm,
      remarkDirective,
      remarkCookingTimers,
      [remarkMath, { singleDollarTextMath: false }],
      unicodeCitation,
      mcpUIResourcePlugin,
    ],
    [],
  );
  const markdownComponents = useMemo(
    () => ({
      code: RekkyJsonMarkdownCode,
      a: StandardA,
      p,
      img,
      table: MarkdownTable,
      'rekky-timer': RekkyTimerElement,
      citation: Citation,
      'highlighted-text': HighlightedText,
      'composite-citation': CompositeCitation,
      'mcp-ui-resource': MCPUIResource,
      'mcp-ui-carousel': MCPUIResourceCarousel,
    }),
    [],
  );

  if (!documentMarkdown && !isPreparingDraft) {
    return null;
  }

  const presentation = savedRecipePresentation(savedRecipe);
  const documentTags = uniqueRecipeValues([
    ...(savedRecipe?.collections ?? []),
    ...presentation.primaryTags,
    ...presentation.diets,
    ...(savedRecipe ? [] : (draft?.recipe.tags ?? [])),
  ]);
  const equipment = presentation.equipment.length
    ? presentation.equipment
    : uniqueRecipeValues(draft?.recipe.equipment ?? []);
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
  let saveIcon = <BookmarkPlus className="size-5 sm:size-4" aria-hidden="true" />;
  if (hasSavedRecipe && !hasChangedSavedRecipe) {
    saveIcon = <BookmarkCheck className="size-5 sm:size-4" aria-hidden="true" />;
  }
  if (isSaving) {
    saveIcon = <RefreshCw className="size-5 animate-spin sm:size-4" aria-hidden="true" />;
  }

  const handleCopyMarkdown = () => {
    const copied = copy(documentMarkdown, { format: 'text/plain' });
    setIsCopied(copied);
    if (!copied) {
      showToast({
        message: localize('com_ui_copy_failed'),
        severity: NotificationSeverity.ERROR,
      });
    }
    if (copied) {
      window.setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const savePayload = (saveList?: SavedRecipeList): SaveRecipeRequest | null => {
    if (!draft) {
      return null;
    }
    return {
      title: draft.recipe.title,
      documentType: draft.documentType,
      documentMarkdown,
      recipe: draft.recipe,
      sourceDraftId: draft._id,
      ...(saveList ? { saveList } : {}),
      ...(conversationId ? { sourceConversationId: conversationId } : {}),
    };
  };

  const saveNewRecipe = (saveList: SavedRecipeList) => {
    if (!canSave || isSaving) {
      return;
    }
    const payload = savePayload(saveList);
    if (!payload) {
      return;
    }
    saveRecipe.mutate(payload);
  };

  const ensureRecipeId = async () => {
    if (savedRecipe) {
      return savedRecipe._id;
    }
    const payload = savePayload('want_to_cook');
    if (!payload) {
      throw new Error('Recipe data is unavailable.');
    }
    const created = await saveRecipe.mutateAsync(payload);
    return created._id;
  };

  const handleSave = () => {
    if (!canSave || !draft || isSaving) {
      return;
    }

    if (savedRecipe && hasChangedSavedRecipe) {
      const payload = savePayload();
      if (!payload) {
        return;
      }
      updateSavedRecipe.mutate({
        recipeId: savedRecipe._id,
        payload,
      });
      return;
    }
  };

  const saveButton = !hasSavedRecipe ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="submit"
          disabled={isSaving}
          className="min-h-11 gap-2 rounded-control border-transparent bg-surface-submit px-3.5 text-text-submit shadow-none transition-colors hover:bg-surface-submit-hover focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
          aria-label={localize('com_recipes_save_recipe')}
        >
          {saveIcon}
          <span>{buttonLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-85" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-44 rounded-card border-border-light bg-surface-primary p-1.5 shadow-floating"
      >
        <DropdownMenuItem
          className="flex min-h-11 cursor-pointer items-center rounded-control px-3 text-sm text-text-primary transition-colors hover:bg-surface-hover focus:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
          onSelect={() => saveNewRecipe('want_to_cook')}
        >
          {localize('com_recipes_save_list_want_to_cook')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex min-h-11 cursor-pointer items-center rounded-control px-3 text-sm text-text-primary transition-colors hover:bg-surface-hover focus:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
          onSelect={() => saveNewRecipe('cooked_already')}
        >
          {localize('com_recipes_save_list_cooked_already')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Button
      size="sm"
      variant={hasChangedSavedRecipe ? 'submit' : 'outline'}
      disabled={isSaving || !hasChangedSavedRecipe}
      onClick={handleSave}
      className="min-h-11 gap-2 rounded-control border border-border-light bg-transparent px-3.5 text-text-secondary shadow-none transition-colors hover:border-border-medium hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
      aria-label={buttonLabel}
    >
      {saveIcon}
      <span>{buttonLabel}</span>
    </Button>
  );

  const documentActions = canSave ? (
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <TooltipAnchor
        description={localize('com_cooking_copy_markdown')}
        render={
          <button
            type="button"
            onClick={handleCopyMarkdown}
            aria-label={localize('com_cooking_copy_markdown')}
            className="inline-flex size-11 items-center justify-center rounded-control border border-border-light text-text-secondary transition-colors hover:border-border-medium hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px"
          >
            {isCopied ? (
              <Check className="size-[1.125rem] sm:size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-[1.125rem] sm:size-4" aria-hidden="true" />
            )}
          </button>
        }
      />
      {saveButton}
    </div>
  ) : null;

  return (
    <section className="rekky-ui rekky-recipe-surface flex min-h-0 min-w-0 flex-1 flex-col bg-surface-primary-alt text-text-primary">
      <div className="min-h-0 flex-1 overflow-y-auto sm:px-7 sm:py-6 lg:px-10">
        {documentMarkdown ? (
          <RecipeDocument
            title={documentParts.title || draft?.recipe.title || localize('com_cooking_recipe')}
            imageUrl={savedRecipe?.illustrationUrl}
            sourceUrl={draft?.sourceUrl ?? savedRecipe?.sourceUrl}
            sourceLabel={
              draft?.sourceUrl || savedRecipe?.sourceUrl
                ? recipeSourceLabel(draft?.sourceUrl ?? savedRecipe?.sourceUrl ?? '')
                : undefined
            }
            metadata={
              <>
                {draft ? <span>{localize(documentTypeKey(draft))}</span> : null}
                {savedRecipe?.categorizationStatus === 'pending' ? (
                  <>
                    {draft ? <span aria-hidden="true">·</span> : null}
                    <span>{localize('com_recipes_categorizing')}</span>
                  </>
                ) : null}
                {isPreparingDraft ? (
                  <>
                    {draft || savedRecipe?.categorizationStatus === 'pending' ? (
                      <span aria-hidden="true">·</span>
                    ) : null}
                    <span>{localize('com_cooking_updating_canvas')}</span>
                  </>
                ) : null}
              </>
            }
            actions={documentActions}
            tags={documentTags}
            warnings={presentation.allergens}
          >
            {documentSections.preamble ? (
              <div className="cooking-recipe-markdown markdown prose light dark:prose-invert mb-7 max-w-none break-words text-text-primary">
                <CodeBlockProvider>
                  <ReactMarkdown
                    /** @ts-expect-error Unified plugin versions expose incompatible duplicate types. */
                    remarkPlugins={remarkPlugins}
                    /** @ts-expect-error Unified plugin versions expose incompatible duplicate types. */
                    rehypePlugins={rehypePlugins}
                    components={markdownComponents as { [nodeType: string]: React.ElementType }}
                  >
                    {documentSections.preamble}
                  </ReactMarkdown>
                </CodeBlockProvider>
              </div>
            ) : null}
            <RecipeMetrics metrics={documentParts.metrics} />
            <RecipeDetailsDisclosure
              label={localize('com_recipe_equipment_details')}
              groups={[
                { label: localize('com_recipe_equipment'), items: equipment },
                { label: localize('com_ui_details'), items: presentation.detailTags },
              ]}
            />
            {hasStructuredIngredients ? (
              <StructuredIngredients
                ensureRecipeId={draft ? ensureRecipeId : undefined}
                ingredients={draft?.recipe.ingredients ?? []}
                onWorkspaceChange={savedRecipe ? updateWorkspaceState : undefined}
                recipeId={savedRecipe?._id}
                recipeTitle={draft?.recipe.title}
                servings={draft?.recipe.servings}
                workspaceState={workspaceState}
              />
            ) : null}
            {draft?.recipe && hasStructuredSteps ? (
              <RecipeInstructions
                onWorkspaceChange={savedRecipe ? updateWorkspaceState : undefined}
                recipe={draft.recipe}
                workspaceState={workspaceState}
              />
            ) : null}
            {documentSections.remainder ? (
              <div className="cooking-recipe-markdown markdown prose light dark:prose-invert max-w-none break-words text-text-primary">
                <CodeBlockProvider>
                  <ReactMarkdown
                    /** @ts-expect-error Unified plugin versions expose incompatible duplicate types. */
                    remarkPlugins={remarkPlugins}
                    /** @ts-expect-error Unified plugin versions expose incompatible duplicate types. */
                    rehypePlugins={rehypePlugins}
                    components={markdownComponents as { [nodeType: string]: React.ElementType }}
                  >
                    {documentSections.remainder}
                  </ReactMarkdown>
                </CodeBlockProvider>
              </div>
            ) : null}
          </RecipeDocument>
        ) : (
          <div className="flex min-h-72 items-center justify-center text-sm text-text-secondary">
            {localize('com_cooking_preparing_recipe')}
          </div>
        )}
      </div>
      {conversationId && (
        <VoiceAssistantWidget
          conversationId={conversationId}
          recipeMarkdown={documentMarkdown}
          workspaceContext={voiceWorkspaceContext}
        />
      )}
    </section>
  );
}
