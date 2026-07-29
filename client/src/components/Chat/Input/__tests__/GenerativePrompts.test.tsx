import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import type { GenerativePromptSpec } from 'librechat-data-provider';
import GenerativePrompts from '../GenerativePrompts';
import store from '~/store';

const user = { id: 'user-1' };
const preferences = { updatedAt: '2026-06-07T10:00:00.000Z' };
let mockAuthContext: { user?: typeof user; isAuthenticated: boolean } = {
  user,
  isAuthenticated: true,
};

const guestTranslations = {
  com_cooking_guest_prompt_quick_title: '20-minute dinner',
  com_cooking_guest_prompt_quick_text:
    'Cook a complete one-pan dinner for two with common pantry staples.',
  com_cooking_guest_prompt_quick_prompt:
    'Create a complete 20-minute one-pan dinner for two using common pantry ingredients. Include exact quantities, numbered steps, and substitutions for anything less common.',
  com_cooking_guest_prompt_seasonal_title: '3-night dinner plan',
  com_cooking_guest_prompt_seasonal_text:
    'Plan three easy meals that share ingredients and reduce food waste.',
  com_cooking_guest_prompt_explore_title: 'Try a new cuisine',
  com_cooking_guest_prompt_explore_text:
    'Make an approachable global dinner with supermarket ingredients.',
} as const;

jest.mock('~/hooks', () => ({
  useAuthContext: () => mockAuthContext,
  useLocalize: () => (key: string) =>
    guestTranslations[key as keyof typeof guestTranslations] ?? key,
}));

jest.mock('~/data-provider', () => ({
  usePreferencesQuery: () => ({ data: preferences }),
}));

const promptSpec: GenerativePromptSpec = {
  root: 'suggestions',
  elements: {
    suggestions: {
      type: 'SuggestionList',
      props: {},
      children: ['quick', 'seasonal', 'explore'],
    },
    quick: {
      type: 'SuggestionLink',
      props: {
        text: 'Cook a quick lunch with what is ready in the kitchen',
        title: 'Quick lunch',
        slot: 'efficient',
      },
      children: [],
      on: {
        click: { action: 'SET_INPUT', params: { prompt_injection: 'Make a quick lunch' } },
      },
    },
    seasonal: {
      type: 'SuggestionLink',
      props: {
        text: 'Use seasonal fruit in a chilled breakfast',
        title: 'Seasonal fruit',
        slot: 'seasonal',
      },
      children: [],
      on: {
        click: { action: 'SET_INPUT', params: { prompt_injection: 'Use seasonal fruit' } },
      },
    },
    explore: {
      type: 'SuggestionLink',
      props: {
        text: 'Try a new technique with a pantry ingredient',
        title: 'Pantry technique',
        slot: 'experimental',
      },
      children: [],
      on: {
        click: { action: 'SET_INPUT', params: { prompt_injection: 'Try a new technique' } },
      },
    },
  },
};

function renderPrompts(sidebarExpanded = false) {
  return render(
    <RecoilRoot initializeState={({ set }) => set(store.sidebarExpanded, sidebarExpanded)}>
      <GenerativePrompts enabled disabled={false} onSubmitPrompt={jest.fn()} />
    </RecoilRoot>,
  );
}

describe('GenerativePrompts', () => {
  beforeEach(() => {
    mockAuthContext = { user, isAuthenticated: true };
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const localDate = new Date().toLocaleDateString('en-CA');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const cacheScope = `${user.id}:${preferences.updatedAt}:${localDate}:${timezone}`;
    localStorage.setItem(
      `rekky:generative-prompts:v5:${encodeURIComponent(cacheScope)}`,
      JSON.stringify({ expiresAt: Date.now() + 60_000, spec: promptSpec }),
    );
    global.fetch = Object.assign(
      jest.fn().mockResolvedValue({ ok: true, body: null, status: 204 }),
      {
        preconnect: jest.fn(),
      },
    ) as typeof fetch;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('keeps mobile suggestions in document flow and submits their action payload', async () => {
    const onSubmitPrompt = jest.fn();

    render(
      <RecoilRoot initializeState={({ set }) => set(store.sidebarExpanded, false)}>
        <GenerativePrompts enabled disabled={false} onSubmitPrompt={onSubmitPrompt} />
      </RecoilRoot>,
    );

    const rail = await screen.findByTestId('generative-prompts');
    expect(rail).toHaveClass('relative');
    expect(rail).toHaveClass('flex-wrap', 'justify-center', 'gap-1.5');
    expect(rail).not.toHaveClass('overflow-x-auto');
    expect(rail).not.toHaveClass('absolute');

    const quickPrompt = screen.getByRole('button', { name: /Quick lunch/i });
    expect(quickPrompt).toHaveClass('rounded-full', 'min-h-11', 'whitespace-nowrap');
    expect(screen.getByText('Quick lunch')).toHaveClass('min-[769px]:hidden');
    expect(screen.getByText(/Cook a quick lunch with what is ready/i)).toHaveClass(
      'hidden',
      'min-[769px]:block',
    );

    fireEvent.click(quickPrompt);
    expect(onSubmitPrompt).toHaveBeenCalledWith('Make a quick lunch');
  });

  it('keeps suggestions visible while the composer is focused', async () => {
    renderPrompts();

    const rail = await screen.findByTestId('generative-prompts');
    await waitFor(() => expect(rail).toBeVisible());
    expect(rail.parentElement).not.toHaveClass('max-[768px]:hidden');
    expect(screen.getByRole('button', { name: /Quick lunch/i })).toBeInTheDocument();
  });

  it('does not reuse another user cache entry', async () => {
    const localDate = new Date().toLocaleDateString('en-CA');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const currentScope = `${user.id}:${preferences.updatedAt}:${localDate}:${timezone}`;
    localStorage.removeItem(`rekky:generative-prompts:v5:${encodeURIComponent(currentScope)}`);
    localStorage.setItem(
      `rekky:generative-prompts:v5:${encodeURIComponent(
        `other-user:${preferences.updatedAt}:${localDate}:${timezone}`,
      )}`,
      JSON.stringify({ expiresAt: Date.now() + 60_000, spec: promptSpec }),
    );

    renderPrompts();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Quick lunch/i })).not.toBeInTheDocument();
    });
  });

  it('removes suggestions from interaction while the sidebar is expanded', async () => {
    renderPrompts(true);

    const rail = await screen.findByTestId('generative-prompts');
    expect(rail).toHaveClass('pointer-events-none', 'opacity-0');
    expect(rail).toHaveAttribute('aria-hidden', 'true');
    expect(rail).toHaveAttribute('inert');
  });

  it('renders deterministic local suggestions for guests without fetching', async () => {
    mockAuthContext = { user: undefined, isAuthenticated: false };
    const onSubmitPrompt = jest.fn();
    global.fetch = Object.assign(jest.fn(), { preconnect: jest.fn() }) as typeof fetch;

    render(
      <RecoilRoot initializeState={({ set }) => set(store.sidebarExpanded, false)}>
        <GenerativePrompts enabled disabled={false} onSubmitPrompt={onSubmitPrompt} />
      </RecoilRoot>,
    );

    const quickPrompt = await screen.findByRole('button', { name: /20-minute dinner/i });

    fireEvent.click(quickPrompt);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getAllByText('3-night dinner plan')[0]).toHaveClass(
      'hidden',
      'min-[769px]:block',
    );
    expect(screen.getAllByText('Try a new cuisine')[0]).toHaveClass('hidden', 'min-[769px]:block');
    expect(onSubmitPrompt).toHaveBeenCalledWith(
      guestTranslations.com_cooking_guest_prompt_quick_prompt,
    );
  });
});
