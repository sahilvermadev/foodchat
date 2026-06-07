import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GenerativePromptSpec } from 'librechat-data-provider';
import GenerativePrompts from '../GenerativePrompts';

const user = { id: 'user-1' };
const preferences = { updatedAt: '2026-06-07T10:00:00.000Z' };

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user }),
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

describe('GenerativePrompts', () => {
  beforeEach(() => {
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

    render(<GenerativePrompts enabled disabled={false} onSubmitPrompt={onSubmitPrompt} />);

    const rail = await screen.findByTestId('generative-prompts');
    expect(rail).toHaveClass('relative');
    expect(rail).toHaveClass('flex-wrap', 'justify-center', 'gap-1.5');
    expect(rail).not.toHaveClass('overflow-x-auto');
    expect(rail).not.toHaveClass('absolute');

    const quickPrompt = screen.getByRole('button', { name: /Quick lunch/i });
    expect(quickPrompt).toHaveClass('rounded-full', 'min-h-8', 'whitespace-nowrap');
    expect(screen.getByText('Quick lunch')).toHaveClass('min-[769px]:hidden');
    expect(screen.getByText(/Cook a quick lunch with what is ready/i)).toHaveClass(
      'hidden',
      'min-[769px]:block',
    );

    fireEvent.click(quickPrompt);
    expect(onSubmitPrompt).toHaveBeenCalledWith('Make a quick lunch');
  });

  it('keeps suggestions visible while the composer is focused', async () => {
    render(<GenerativePrompts enabled disabled={false} onSubmitPrompt={jest.fn()} />);

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

    render(<GenerativePrompts enabled disabled={false} onSubmitPrompt={jest.fn()} />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Quick lunch/i })).not.toBeInTheDocument();
    });
  });
});
