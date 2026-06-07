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
import StructuredIngredients, { hasDisplayableIngredients } from './StructuredIngredients';
import { recipeMarkdownDisplay, stripIngredientsSection } from './recipe';
import { remarkCookingTimers } from './timerMarkdown';

type BrowserAudioContext = typeof AudioContext;

function playTimerCompleteAlarm() {
  const AudioContextCtor = (window.AudioContext ||
    (window as Window & { webkitAudioContext?: BrowserAudioContext }).webkitAudioContext) as
    | BrowserAudioContext
    | undefined;

  if (!AudioContextCtor) {
    return;
  }

  const audioCtx = new AudioContextCtor();
  void audioCtx.resume?.();

  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
  compressor.knee.setValueAtTime(16, audioCtx.currentTime);
  compressor.ratio.setValueAtTime(4, audioCtx.currentTime);
  compressor.attack.setValueAtTime(0.004, audioCtx.currentTime);
  compressor.release.setValueAtTime(0.18, audioCtx.currentTime);
  compressor.connect(audioCtx.destination);

  const masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0.72, audioCtx.currentTime);
  masterGain.connect(compressor);

  const playTone = (startTime: number, frequency: number, duration: number, peakGain = 0.42) => {
    const oscillator = audioCtx.createOscillator();
    const harmonic = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const harmonicGain = audioCtx.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.012, startTime + duration);

    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(frequency * 2, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    harmonicGain.gain.setValueAtTime(0.0001, startTime);
    harmonicGain.gain.linearRampToValueAtTime(peakGain * 0.18, startTime + 0.016);
    harmonicGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.72);

    oscillator.connect(gain);
    gain.connect(masterGain);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.04);
    harmonic.start(startTime);
    harmonic.stop(startTime + duration + 0.04);
  };

  const start = audioCtx.currentTime + 0.04;
  [
    [0, 659.25, 0.16, 0.34],
    [0.18, 880, 0.18, 0.42],
    [0.4, 1174.66, 0.26, 0.36],
    [0.86, 659.25, 0.16, 0.32],
    [1.04, 880, 0.18, 0.4],
    [1.26, 1318.51, 0.32, 0.36],
  ].forEach(([offset, frequency, duration, peakGain]) => {
    playTone(start + offset, frequency, duration, peakGain);
  });

  if ('vibrate' in navigator) {
    navigator.vibrate([70, 40, 90]);
  }

  window.setTimeout(() => {
    void audioCtx.close();
  }, 2200);
}

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
    timerToneClass =
      'border-amber-500/25 bg-amber-500/10 text-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.04)] dark:text-amber-300';
  }
  if (isCompleted) {
    timerToneClass =
      'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
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
      className={`rekky-timer mx-1 inline-flex h-6 select-none items-center gap-0.5 rounded-full border px-1 text-[0.72rem] font-semibold leading-none transition-colors duration-200 ${timerToneClass}`}
      style={{ verticalAlign: '-0.14em' }}
      aria-label={`${timerName} ${timeString}`}
      title={timerName}
    >
      <button
        type="button"
        onClick={handlePrimaryAction}
        className="inline-flex h-5 min-w-12 items-center justify-center gap-1 rounded-full px-1.5 tabular-nums transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy"
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
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy"
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

  const documentParts = useMemo(
    () => recipeMarkdownDisplay(documentMarkdown, draft?.recipe.title),
    [documentMarkdown, draft?.recipe.title],
  );
  const hasStructuredIngredients = draft?.recipe
    ? hasDisplayableIngredients(draft.recipe.ingredients)
    : false;

  const processedBody = useMemo(() => {
    if (!documentParts.body) {
      return '';
    }
    return hasStructuredIngredients
      ? stripIngredientsSection(documentParts.body)
      : documentParts.body;
  }, [documentParts.body, hasStructuredIngredients]);

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
    showToast({
      message: localize(copied ? 'com_cooking_markdown_copied' : 'com_ui_copy_failed'),
      severity: copied ? NotificationSeverity.SUCCESS : NotificationSeverity.ERROR,
    });
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
          className="size-11 gap-0 rounded-full bg-transparent p-0 text-surface-submit shadow-none hover:bg-surface-hover hover:text-surface-submit sm:h-9 sm:w-auto sm:gap-2 sm:rounded-md sm:bg-surface-submit sm:px-3 sm:text-white sm:hover:bg-surface-submit sm:hover:text-white"
          aria-label={localize('com_recipes_save_recipe')}
        >
          {saveIcon}
          <span className="hidden sm:inline">{buttonLabel}</span>
          <ChevronDown className="hidden h-3.5 w-3.5 opacity-85 sm:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-44 rounded-lg border-border-light bg-surface-primary p-1.5 shadow-xl"
      >
        <DropdownMenuItem
          className="flex cursor-pointer items-center rounded-md px-2.5 py-2 text-sm text-text-primary transition-colors hover:bg-surface-hover focus:bg-surface-hover"
          onSelect={() => saveNewRecipe('want_to_cook')}
        >
          {localize('com_recipes_save_list_want_to_cook')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex cursor-pointer items-center rounded-md px-2.5 py-2 text-sm text-text-primary transition-colors hover:bg-surface-hover focus:bg-surface-hover"
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
      className="size-11 gap-0 rounded-full border-0 bg-transparent p-0 text-surface-submit shadow-none hover:bg-surface-hover hover:text-surface-submit disabled:text-surface-submit sm:h-9 sm:w-auto sm:gap-2 sm:rounded-md sm:border sm:px-3"
      aria-label={buttonLabel}
    >
      {saveIcon}
      <span className="hidden sm:inline">{buttonLabel}</span>
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
            className="inline-flex size-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy sm:size-8 sm:rounded-md"
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
      <div className="min-h-0 flex-1 overflow-y-auto px-0 py-0 sm:px-7 sm:py-6 lg:px-10">
        <article className="mx-auto min-h-full max-w-[68rem] border-y border-border-light bg-surface-primary shadow-none sm:rounded-lg sm:border">
          {documentMarkdown ? (
            <header className="border-b border-border-light px-4 py-6 sm:px-8 sm:py-9 lg:px-12">
              <div className="min-w-0">
                {documentParts.title ? (
                  <h1 className="rekky-title text-text-primary">{documentParts.title}</h1>
                ) : null}
                <div className="mt-3 flex min-h-11 items-start justify-between gap-3 sm:min-h-9">
                  <div className="min-w-0 pt-1 sm:pt-0">
                    {draft ? (
                      <p className="rekky-meta text-text-secondary">
                        {localize(documentTypeKey(draft))}
                      </p>
                    ) : null}
                    {savedRecipe?.categorizationStatus === 'pending' ? (
                      <p className="rekky-meta mt-2 text-text-secondary">
                        {localize('com_recipes_categorizing')}
                      </p>
                    ) : null}
                    {isPreparingDraft ? (
                      <p className="rekky-meta mt-2 text-text-secondary">
                        {localize('com_cooking_updating_canvas')}
                      </p>
                    ) : null}
                  </div>
                  {documentActions}
                </div>
              </div>
            </header>
          ) : null}
          {documentMarkdown ? (
            <div className="px-4 py-6 sm:px-8 sm:py-9 lg:px-12">
              <RecipeMetrics metrics={documentParts.metrics} />
              {hasStructuredIngredients ? (
                <StructuredIngredients ingredients={draft?.recipe.ingredients ?? []} />
              ) : null}
              <div className="cooking-recipe-markdown markdown prose light dark:prose-invert max-w-none break-words text-text-primary">
                <CodeBlockProvider>
                  <ReactMarkdown
                    /** @ts-expect-error Unified plugin versions expose incompatible duplicate types. */
                    remarkPlugins={remarkPlugins}
                    /** @ts-expect-error Unified plugin versions expose incompatible duplicate types. */
                    rehypePlugins={rehypePlugins}
                    components={markdownComponents as { [nodeType: string]: React.ElementType }}
                  >
                    {processedBody}
                  </ReactMarkdown>
                </CodeBlockProvider>
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
