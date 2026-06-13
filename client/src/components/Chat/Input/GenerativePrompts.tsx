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
import { useAuthContext } from '~/hooks';
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
}: {
  element: Extract<GenerativePromptElement, { type: 'SuggestionLink' }>;
  disabled: boolean;
  onSubmitPrompt: (prompt: string) => void;
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
      aria-label={`${slotLabels[element.props.slot]}: ${title}`}
      disabled={disabled || !prompt}
      onClick={() => {
        if (prompt) {
          onSubmitPrompt(prompt);
        }
      }}
      className={cn(
        'group inline-flex min-h-8 shrink-0 items-center whitespace-nowrap rounded-full border border-black/10 bg-black/[0.02] px-2.5 py-1.5 text-left transition-colors duration-150 dark:border-white/10 dark:bg-white/[0.025]',
        'min-[769px]:mx-auto min-[769px]:block min-[769px]:min-h-0 min-[769px]:w-full min-[769px]:max-w-xl min-[769px]:whitespace-normal min-[769px]:rounded-none min-[769px]:border-0 min-[769px]:bg-transparent min-[769px]:px-0 min-[769px]:py-0 dark:min-[769px]:bg-transparent',
        'hover:border-[#c1121f]/20 hover:bg-[#c1121f]/[0.04] hover:text-text-primary dark:hover:border-[#c1121f]/25 dark:hover:bg-[#c1121f]/[0.07] dark:hover:text-gray-50 min-[769px]:hover:bg-transparent min-[769px]:hover:underline min-[769px]:hover:decoration-[#c1121f]/35 min-[769px]:hover:underline-offset-4 dark:min-[769px]:hover:bg-transparent dark:min-[769px]:hover:decoration-[#c1121f]/45',
        'focus-visible:border-[#c1121f]/25 focus-visible:bg-[#c1121f]/[0.05] focus-visible:text-text-primary focus-visible:outline-none dark:focus-visible:border-[#c1121f]/35 dark:focus-visible:bg-[#c1121f]/[0.08] dark:focus-visible:text-gray-50 min-[769px]:focus-visible:bg-transparent min-[769px]:focus-visible:underline min-[769px]:focus-visible:decoration-[#c1121f]/40 min-[769px]:focus-visible:underline-offset-4 dark:min-[769px]:focus-visible:bg-transparent',
        disabled && 'cursor-not-allowed opacity-50 hover:no-underline',
      )}
    >
      <span className="hidden text-[10px] font-semibold uppercase tracking-[0.24em] text-text-tertiary transition-colors duration-150 group-hover:text-[#c1121f] dark:text-gray-500 dark:group-hover:text-[#e63946] min-[769px]:mb-1 min-[769px]:block">
        {slotLabels[element.props.slot]}
      </span>
      <span className="block text-[11px] font-medium leading-4 text-text-secondary transition-colors duration-150 group-hover:text-text-primary dark:text-gray-200/90 dark:group-hover:text-gray-50 min-[769px]:hidden">
        {title}
      </span>
      <span className="mt-1 hidden min-w-0 text-[14px] leading-6 text-text-secondary transition-colors duration-150 group-hover:text-text-primary dark:text-gray-300/75 dark:group-hover:text-gray-50 min-[769px]:block">
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
}: {
  spec: GenerativePromptSpec;
  disabled: boolean;
  onSubmitPrompt: (prompt: string) => void;
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
  const { user } = useAuthContext();
  const { data: preferences } = usePreferencesQuery();
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
  }, [cacheScope, enabled]);

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

  if (status === 'loading') {
    return <PromptSkeleton />;
  }

  if (!hasRenderableRoot(spec)) {
    return null;
  }

  return <PromptSpecRenderer spec={spec} disabled={disabled} onSubmitPrompt={handleSubmitPrompt} />;
}
