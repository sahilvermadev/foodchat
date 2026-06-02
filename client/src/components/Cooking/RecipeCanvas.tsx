import React, { useEffect, useMemo, useRef, useState } from 'react';
import copy from 'copy-to-clipboard';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkDirective from 'remark-directive';
import type { CookingDraft, StructuredRecipe } from 'librechat-data-provider';
import { BookmarkCheck, BookmarkPlus, Check, Copy, RefreshCw, Play, Pause, RotateCcw } from 'lucide-react';
import { Button, TooltipAnchor, useToastContext } from '@librechat/client';
import {
  useSaveRecipeMutation,
  useSavedRecipeByDraftQuery,
  useUpdateSavedRecipeMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { code, a as StandardA, p, img } from '~/components/Chat/Messages/Content/MarkdownComponents';
import { Citation, CompositeCitation, HighlightedText } from '~/components/Web/Citation';
import { MCPUIResource, MCPUIResourceCarousel, mcpUIResourcePlugin } from '~/components/MCPUIResource';
import { CodeBlockProvider } from '~/Providers';
import { unicodeCitation } from '~/components/Web';
import { langSubset } from '~/utils';
import RecipeMetrics from './Metrics';
import StructuredIngredients, { hasDisplayableIngredients } from './StructuredIngredients';
import { recipeMarkdownDisplay, stripIngredientsSection } from './recipe';

// KitchenTimer Component
function KitchenTimer({ seconds }: { seconds: number }) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      setIsRunning(false);
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playBeep = (time: number, freq: number) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, time);
          gain.gain.setValueAtTime(0.3, time);
          gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(time);
          osc.stop(time + 0.3);
        };
        // Pleasant triple high-pitch chime sound
        playBeep(audioCtx.currentTime, 880);
        playBeep(audioCtx.currentTime + 0.3, 880);
        playBeep(audioCtx.currentTime + 0.6, 1200);
      } catch (err) {
        console.error('Audio chime failed:', err);
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timeLeft]);

  const handleStartPause = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRunning(!isRunning);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRunning(false);
    setTimeLeft(seconds);
  };

  const minutes = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeString = `${minutes}:${secs.toString().padStart(2, '0')}`;
  const isCompleted = timeLeft === 0;

  return (
    <span
      className={`rekky-timer inline-flex items-center gap-2 px-3 py-1 mx-1.5 rounded-full text-xs font-semibold select-none border transition-all duration-300 ${
        isCompleted
          ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 animate-pulse'
          : isRunning
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.05)]'
          : 'bg-surface-active border-border-medium text-text-secondary hover:text-text-primary'
      }`}
      style={{ verticalAlign: 'middle' }}
    >
      <span className="relative flex h-3 w-3 items-center justify-center">
        {isRunning && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-30"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isCompleted ? 'bg-red-500' : isRunning ? 'bg-amber-500' : 'bg-text-tertiary'
          }`}
        ></span>
      </span>
      
      <span className="text-sm leading-none">{timeString}</span>

      <button
        type="button"
        onClick={handleStartPause}
        className="p-0.5 rounded-full hover:bg-surface-hover transition-colors"
        title={isRunning ? 'Pause' : 'Start'}
      >
        {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>

      <button
        type="button"
        onClick={handleReset}
        className="p-0.5 rounded-full hover:bg-surface-hover transition-colors"
        title="Reset"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

// Custom Anchor Component
const customA: React.ElementType = React.memo(function CustomAnchor(props: any) {
  const { href, children } = props;
  if (href && href.startsWith('#timer-')) {
    const seconds = parseInt(href.substring(7), 10);
    if (!isNaN(seconds)) {
      return <KitchenTimer seconds={seconds} />;
    }
  }
  return <StandardA {...props} />;
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

  const documentParts = useMemo(() => recipeMarkdownDisplay(documentMarkdown, draft?.recipe.title), [documentMarkdown, draft?.recipe.title]);
  const hasStructuredIngredients = draft?.recipe
    ? hasDisplayableIngredients(draft.recipe.ingredients)
    : false;

  const processedBody = useMemo(() => {
    if (!documentParts.body) {
      return '';
    }
    const body = hasStructuredIngredients
      ? stripIngredientsSection(documentParts.body)
      : documentParts.body;
    const formatSeconds = (secStr: string) => {
      const totalSec = parseInt(secStr, 10);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    };
    return body.replace(/\[timer:(\d+)\]/g, (match, seconds) => {
      return `[⏱️ ${formatSeconds(seconds)}](#timer-${seconds})`;
    });
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

  const remarkPlugins = useMemo(
    () => [
      supersub,
      remarkGfm,
      remarkDirective,
      [remarkMath, { singleDollarTextMath: false }],
      unicodeCitation,
      mcpUIResourcePlugin,
    ],
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
  let saveIcon = <BookmarkPlus className="h-4 w-4" aria-hidden="true" />;
  if (hasSavedRecipe && !hasChangedSavedRecipe) {
    saveIcon = <BookmarkCheck className="h-4 w-4" aria-hidden="true" />;
  }
  if (isSaving) {
    saveIcon = <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />;
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
    <section className="rekky-ui rekky-recipe-surface flex min-h-0 min-w-0 flex-1 flex-col bg-surface-primary-alt text-text-primary">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-7 lg:px-10">
        <article className="mx-auto min-h-full max-w-[68rem] rounded-lg border border-border-light bg-surface-primary shadow-none">
          {documentMarkdown ? (
            <header className="border-b border-border-light px-5 py-7 sm:px-8 sm:py-9 lg:px-12">
              <div className="flex flex-col gap-5">
                {canSave ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
                <div className="min-w-0">
                  {documentParts.title ? (
                    <h1 className="rekky-title text-text-primary">
                      {documentParts.title}
                    </h1>
                  ) : null}
                  {draft ? (
                    <p className="rekky-meta mt-3 text-text-secondary">
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
              </div>
            </header>
          ) : null}
          {documentMarkdown ? (
            <div className="px-5 py-7 sm:px-8 sm:py-9 lg:px-12">
              <RecipeMetrics metrics={documentParts.metrics} />
              {hasStructuredIngredients ? (
                <StructuredIngredients ingredients={draft?.recipe.ingredients ?? []} />
              ) : null}
              <div className="cooking-recipe-markdown markdown prose light dark:prose-invert max-w-none break-words text-text-primary">
                <CodeBlockProvider>
                  <ReactMarkdown
                    remarkPlugins={remarkPlugins as any}
                    rehypePlugins={rehypePlugins as any}
                    components={
                      {
                        code,
                        a: customA,
                        p,
                        img,
                        citation: Citation,
                        'highlighted-text': HighlightedText,
                        'composite-citation': CompositeCitation,
                        'mcp-ui-resource': MCPUIResource,
                        'mcp-ui-carousel': MCPUIResourceCarousel,
                      } as any
                    }
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
