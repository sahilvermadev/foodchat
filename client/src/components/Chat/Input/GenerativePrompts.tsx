import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createSpecStreamCompiler, resolveAction } from '@json-render/core';
import { useRecoilValue } from 'recoil';
import {
  generativePrompts,
  getTokenHeader,
  type GenerativePromptElement,
  type GenerativePromptsRequest,
  type GenerativePromptSpec,
} from 'librechat-data-provider';
import { usePreferencesQuery } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';
import { getPromptRailClass } from '../landingLayout';

type GenerativePromptsProps = {
  enabled: boolean;
  disabled: boolean;
  onSubmitPrompt: (prompt: string) => void;
};

type PartialPromptSpec = Partial<Omit<GenerativePromptSpec, 'elements'>> & {
  elements?: Record<string, GenerativePromptElement>;
};

type PromptStatus = 'idle' | 'loading' | 'ready' | 'empty';

type CachedPromptSpec = {
  expiresAt: number;
  spec: GenerativePromptSpec;
};

const seasonByMonth = [
  'winter',
  'winter',
  'spring',
  'spring',
  'spring',
  'summer',
  'summer',
  'summer',
  'autumn',
  'autumn',
  'autumn',
  'winter',
] as const;
const promptCachePrefix = 'rekky:generative-prompts:v5';
const promptCacheTtlMs = 6 * 60 * 60 * 1000;
const promptStreamTimeoutMs = 25000;
const guestPromptKeys = {
  quick: {
    slot: 'efficient',
    title: 'com_cooking_guest_prompt_quick_title',
    text: 'com_cooking_guest_prompt_quick_text',
    prompt: 'com_cooking_guest_prompt_quick_prompt',
  },
  seasonal: {
    slot: 'seasonal',
    title: 'com_cooking_guest_prompt_seasonal_title',
    text: 'com_cooking_guest_prompt_seasonal_text',
    prompt: 'com_cooking_guest_prompt_seasonal_prompt',
  },
  explore: {
    slot: 'experimental',
    title: 'com_cooking_guest_prompt_explore_title',
    text: 'com_cooking_guest_prompt_explore_text',
    prompt: 'com_cooking_guest_prompt_explore_prompt',
  },
} as const satisfies Record<
  string,
  {
    slot: 'efficient' | 'seasonal' | 'experimental';
    title: TranslationKeys;
    text: TranslationKeys;
    prompt: TranslationKeys;
  }
>;

const slotLabels: Record<'efficient' | 'seasonal' | 'experimental', string> = {
  efficient: 'Quick',
  seasonal: 'Seasonal',
  experimental: 'Explore',
};

function environmentContext(): GenerativePromptsRequest['environmental_context'] {
  const now = new Date();
  const locale = navigator.language || undefined;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  return {
    current_time: now.toISOString(),
    day_of_week: now.toLocaleDateString(locale, { weekday: 'long' }),
    current_month: now.toLocaleDateString(locale, { month: 'long' }),
    locale,
    timezone,
    season: seasonByMonth[now.getMonth()],
  };
}

function hasRenderableRoot(spec: PartialPromptSpec): spec is GenerativePromptSpec {
  if (!spec.root || !spec.elements) {
    return false;
  }
  const root = spec.elements[spec.root];
  if (!root || root.type !== 'SuggestionList') {
    return false;
  }
  return root.children.some((key) => {
    const element = spec.elements?.[key];
    return Boolean(
      element?.type === 'SuggestionLink' &&
        element.props.title.trim() &&
        element.props.text.trim() &&
        promptFromElement(element),
    );
  });
}

function promptCacheKey(scope: string): string {
  return `${promptCachePrefix}:${encodeURIComponent(scope)}`;
}

function readPromptCache(scope: string): GenerativePromptSpec | null {
  try {
    const cached = JSON.parse(
      localStorage.getItem(promptCacheKey(scope)) ?? 'null',
    ) as CachedPromptSpec;
    return cached?.expiresAt > Date.now() && hasRenderableRoot(cached.spec) ? cached.spec : null;
  } catch {
    return null;
  }
}

function writePromptCache(scope: string, spec: GenerativePromptSpec) {
  try {
    localStorage.setItem(
      promptCacheKey(scope),
      JSON.stringify({
        expiresAt: Date.now() + promptCacheTtlMs,
        spec,
      } satisfies CachedPromptSpec),
    );
  } catch {
    // Suggestions remain usable without local storage.
  }
}

function guestPromptSpec(localize: (key: TranslationKeys) => string): GenerativePromptSpec {
  return {
    root: 'suggestions',
    elements: {
      suggestions: {
        type: 'SuggestionList',
        props: {},
        children: ['quick', 'seasonal', 'explore'],
      },
      ...Object.fromEntries(
        Object.entries(guestPromptKeys).map(([key, config]) => [
          key,
          {
            type: 'SuggestionLink',
            props: {
              slot: config.slot,
              title: localize(config.title),
              text: localize(config.text),
            },
            children: [],
            on: {
              click: {
                action: 'SET_INPUT',
                params: { prompt_injection: localize(config.prompt) },
              },
            },
          } satisfies GenerativePromptElement,
        ]),
      ),
    },
  };
}

function promptFromElement(element: GenerativePromptElement): string | null {
  if (element.type !== 'SuggestionLink') {
    return null;
  }
  const binding = element.on?.click;
  if (!binding) {
    return null;
  }
  const resolved = resolveAction(binding, {});
  if (resolved.action !== 'SET_INPUT') {
    return null;
  }
  const prompt = resolved.params?.prompt_injection;
  return typeof prompt === 'string' && prompt.trim() ? prompt.trim() : null;
}

function SuggestionLink({
  element,
  disabled,
  onSubmitPrompt,
  useTitleLabel,
}: {
  element: Extract<GenerativePromptElement, { type: 'SuggestionLink' }>;
  disabled: boolean;
  onSubmitPrompt: (prompt: string) => void;
  useTitleLabel: boolean;
}) {
  const prompt = useMemo(() => promptFromElement(element), [element]);
  const text = element.props.text.trim();
  const title = element.props.title.trim();

  if (!text || !title) {
    return <span className="h-5" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      aria-label={useTitleLabel ? title : `${slotLabels[element.props.slot]}: ${title}`}
      disabled={disabled || !prompt}
      onClick={() => {
        if (prompt) {
          onSubmitPrompt(prompt);
        }
      }}
      className={cn(
        'bg-surface-secondary/60 group inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-border-light px-3 py-2 text-left transition-colors duration-150',
        'min-[769px]:mx-auto min-[769px]:block min-[769px]:min-h-0 min-[769px]:w-full min-[769px]:max-w-xl min-[769px]:whitespace-normal min-[769px]:rounded-none min-[769px]:border-0 min-[769px]:bg-transparent min-[769px]:px-0 min-[769px]:py-0 dark:min-[769px]:bg-transparent',
        'hover:bg-surface-hover min-[769px]:hover:bg-transparent min-[769px]:hover:underline min-[769px]:hover:decoration-surface-submit min-[769px]:hover:underline-offset-4',
        'focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary min-[769px]:focus-visible:bg-transparent',
        'active:bg-surface-active min-[769px]:active:bg-transparent',
        disabled && 'cursor-not-allowed opacity-50 hover:no-underline',
      )}
    >
      <span className="hidden text-[10px] font-semibold uppercase tracking-[0.24em] text-text-tertiary min-[769px]:mb-1 min-[769px]:block">
        {useTitleLabel ? title : slotLabels[element.props.slot]}
      </span>
      <span className="block text-[11px] font-medium leading-4 text-text-secondary transition-colors duration-150 group-hover:text-text-primary min-[769px]:hidden">
        {title}
      </span>
      <span className="mt-1 hidden min-w-0 text-[14px] leading-6 text-text-secondary transition-colors duration-150 group-hover:text-text-primary min-[769px]:block">
        {text}
      </span>
    </button>
  );
}

function PromptRail({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  const sidebarExpanded = useRecoilValue(store.sidebarExpanded);

  return (
    <div
      className={getPromptRailClass(sidebarExpanded, loading)}
      data-testid="generative-prompts"
      aria-hidden={sidebarExpanded ? 'true' : undefined}
      inert={sidebarExpanded ? '' : undefined}
    >
      {children}
    </div>
  );
}

function PromptSkeleton() {
  return (
    <PromptRail loading>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-8 w-20 rounded-full border border-black/10 bg-black/[0.02] px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.025] min-[769px]:h-auto min-[769px]:w-full min-[769px]:max-w-xl min-[769px]:rounded-none min-[769px]:border-0 min-[769px]:bg-transparent min-[769px]:px-0 min-[769px]:py-0 dark:min-[769px]:bg-transparent xl:max-w-none"
          aria-hidden="true"
        >
          <span className="mx-auto block h-3 w-16 rounded-full bg-black/10 dark:bg-gray-400/10 min-[769px]:mx-0 min-[769px]:mb-2 min-[769px]:h-2 min-[769px]:w-12" />
          <span className="hidden h-3 w-full rounded-full bg-black/10 dark:bg-gray-400/10 min-[769px]:block" />
          <span className="mt-2 hidden h-3 w-4/5 rounded-full bg-black/10 dark:bg-gray-400/10 min-[769px]:block" />
        </div>
      ))}
    </PromptRail>
  );
}

function PromptSpecRenderer({
  spec,
  disabled,
  onSubmitPrompt,
  useTitleLabels = false,
}: {
  spec: GenerativePromptSpec;
  disabled: boolean;
  onSubmitPrompt: (prompt: string) => void;
  useTitleLabels?: boolean;
}) {
  const root = spec.elements[spec.root];
  if (!root || root.type !== 'SuggestionList') {
    return null;
  }

  return (
    <PromptRail>
      {root.children.map((childKey) => {
        const element = spec.elements[childKey];
        if (!element || element.type !== 'SuggestionLink') {
          return <span key={childKey} className="h-5" aria-hidden="true" />;
        }
        return (
          <SuggestionLink
            key={childKey}
            element={element}
            disabled={disabled}
            onSubmitPrompt={onSubmitPrompt}
            useTitleLabel={useTitleLabels}
          />
        );
      })}
    </PromptRail>
  );
}

export default function GenerativePrompts({
  enabled,
  disabled,
  onSubmitPrompt,
}: GenerativePromptsProps) {
  const localize = useLocalize();
  const { user, isAuthenticated } = useAuthContext();
  const { data: preferences } = usePreferencesQuery({ enabled: isAuthenticated });
  const abortRef = useRef<AbortController | null>(null);
  const [spec, setSpec] = useState<PartialPromptSpec>({});
  const [status, setStatus] = useState<PromptStatus>('idle');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const localDate = new Date().toLocaleDateString('en-CA');
  const cacheScope =
    user?.id && preferences?.updatedAt
      ? `${user.id}:${preferences.updatedAt}:${localDate}:${timezone}`
      : null;

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }
    if (!enabled || !cacheScope) {
      abortRef.current?.abort();
      setSpec({});
      setStatus('idle');
      return undefined;
    }
    const activeCacheScope = cacheScope;

    const controller = new AbortController();
    abortRef.current = controller;
    const compiler = createSpecStreamCompiler<PartialPromptSpec>();
    const cachedSpec = readPromptCache(activeCacheScope);
    let nextSpec: PartialPromptSpec = {};
    let mounted = true;
    const timeout = window.setTimeout(() => {
      nextSpec = compiler.getResult();
      if (!mounted || hasRenderableRoot(nextSpec)) {
        return;
      }
      setStatus(cachedSpec ? 'ready' : 'empty');
      controller.abort();
    }, promptStreamTimeoutMs);

    if (cachedSpec) {
      setSpec(cachedSpec);
      setStatus('ready');
    } else {
      setSpec({});
      setStatus('loading');
    }

    async function stream() {
      const response = await fetch(generativePrompts(), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(getTokenHeader() ? { Authorization: getTokenHeader() as string } : {}),
        },
        body: JSON.stringify({ environmental_context: environmentContext() }),
      });

      if (!response.ok || !response.body) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Generative prompts returned no stream.', response.status);
        }
        if (mounted) {
          setStatus(cachedSpec ? 'ready' : 'empty');
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const { result, newPatches } = compiler.push(decoder.decode(value, { stream: true }));
        if (newPatches.length > 0) {
          nextSpec = {
            ...result,
            elements: result.elements ? { ...result.elements } : undefined,
          };
          if (!mounted) {
            return;
          }
          if (!cachedSpec) {
            setSpec(nextSpec);
          }
          if (!cachedSpec && hasRenderableRoot(nextSpec)) {
            setStatus('ready');
          }
        }
      }
      if (!mounted || controller.signal.aborted) {
        return;
      }
      if (hasRenderableRoot(nextSpec)) {
        writePromptCache(activeCacheScope, nextSpec);
        setSpec(nextSpec);
        setStatus('ready');
      } else {
        setStatus(cachedSpec ? 'ready' : 'empty');
      }
    }

    stream().catch((error) => {
      if (!mounted) {
        return;
      }
      if (!controller.signal.aborted) {
        console.warn('Generative prompts failed.', error);
      }
      setStatus(cachedSpec ? 'ready' : 'empty');
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cacheScope, enabled, isAuthenticated]);

  const handleSubmitPrompt = useCallback(
    (prompt: string) => {
      abortRef.current?.abort();
      onSubmitPrompt(prompt);
    },
    [onSubmitPrompt],
  );

  if (!enabled) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <PromptSpecRenderer
        spec={guestPromptSpec(localize)}
        disabled={disabled}
        onSubmitPrompt={handleSubmitPrompt}
        useTitleLabels
      />
    );
  }

  if (status === 'loading') {
    return <PromptSkeleton />;
  }

  if (!hasRenderableRoot(spec)) {
    return null;
  }

  return <PromptSpecRenderer spec={spec} disabled={disabled} onSubmitPrompt={handleSubmitPrompt} />;
}
