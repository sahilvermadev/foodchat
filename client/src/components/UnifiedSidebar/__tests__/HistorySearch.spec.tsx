import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EModelEndpoint } from 'librechat-data-provider';
import type { ChatHistorySearchResponse } from 'librechat-data-provider';

const mockNavigateToConvo = jest.fn();
const mockUseChatHistorySearchQuery = jest.fn();

jest.mock('~/data-provider', () => ({
  useChatHistorySearchQuery: (query: string) => mockUseChatHistorySearchQuery(query),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: { count?: number }) =>
    values?.count == null ? key : `${values.count} matches`,
  useNavigateToConvo: () => ({ navigateToConvo: mockNavigateToConvo }),
}));

import HistorySearch from '../HistorySearch';

const searchResponse: ChatHistorySearchResponse = {
  query: 'butter chicken',
  results: [
    {
      conversationId: 'conversation-1',
      title: 'Delhi butter chicken',
      endpoint: EModelEndpoint.openAI,
      user: 'user-1',
      createdAt: '2026-06-10T10:00:00.000Z',
      updatedAt: '2026-06-11T10:00:00.000Z',
      score: 100,
      totalMatches: 2,
      matches: [
        {
          source: 'assistant',
          excerpt: 'Finish the butter chicken with cream.',
          messageId: 'message-1',
          createdAt: '2026-06-11T10:00:00.000Z',
        },
      ],
    },
  ],
};

function SearchHarness({ toggleNav }: { toggleNav: () => void }) {
  const [query, setQuery] = useState('');
  return <HistorySearch query={query} setQuery={setQuery} toggleNav={toggleNav} />;
}

describe('HistorySearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockUseChatHistorySearchQuery.mockReturnValue({
      data: searchResponse,
      isFetching: false,
      isError: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces the query and opens the matching message', () => {
    const toggleNav = jest.fn();
    render(
      <MemoryRouter
        initialEntries={['/cook/current-conversation']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/cook/:conversationId" element={<SearchHarness toggleNav={toggleNav} />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'butter chicken' } });
    act(() => jest.advanceTimersByTime(250));

    expect(mockUseChatHistorySearchQuery).toHaveBeenLastCalledWith('butter chicken');
    fireEvent.click(screen.getByRole('option'));

    expect(toggleNav).toHaveBeenCalledTimes(1);
    expect(mockNavigateToConvo).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conversation-1' }),
      {
        currentConvoId: 'current-conversation',
        resetLatestMessage: true,
        targetMessageId: 'message-1',
      },
    );
  });
});
