import React from 'react';
import { RecoilRoot } from 'recoil';
import '@testing-library/jest-dom/extend-expect';
import { MessagesSquare, NotebookPen } from 'lucide-react';
import { act, render, fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { MutableSnapshot } from 'recoil';
import type { NavLink } from '~/common';
import { ActivePanelProvider, DEFAULT_PANEL } from '~/Providers/ActivePanelContext';

const mockStartCookingConversation = jest.fn();

jest.mock('~/store', () => {
  const { atom } = jest.requireActual('recoil');
  let counter = 0;
  const switchAtom = atom({
    key: 'mock-newChatSwitchToHistory',
    default: true,
  });
  return {
    __esModule: true,
    default: {
      conversationByIndex: () =>
        atom({ key: `mock-conversationByIndex-${counter++}`, default: null }),
      newChatSwitchToHistory: switchAtom,
    },
  };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/hooks/Chat/useStartCookingConversation', () => ({
  __esModule: true,
  default: () => mockStartCookingConversation,
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  CLOSE_SIDEBAR_ID: 'close-sidebar',
}));

jest.mock('~/components/Nav/AccountSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="account-settings" />,
}));

import ExpandedPanel from '../ExpandedPanel';
import store from '~/store';

const createLinks = (): NavLink[] => [
  {
    title: 'com_ui_chat_history' as const,
    icon: MessagesSquare,
    id: DEFAULT_PANEL,
    Component: () => null,
  },
  {
    title: 'com_ui_prompts' as const,
    icon: NotebookPen,
    id: 'prompts',
    Component: () => null,
  },
];
const createRouteLink = (onClick: jest.Mock): NavLink => ({
  title: 'com_ui_bookmarks' as const,
  icon: NotebookPen,
  id: 'recipes',
  onClick,
  isActive: (pathname) => pathname === '/recipes',
});

const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

async function renderPanel({
  collapseOnNavigate = false,
  expanded = true,
  onCollapse = jest.fn(),
  onExpand = jest.fn(),
  initialPanel = DEFAULT_PANEL,
  initializeState,
  links = createLinks(),
  initialEntry = '/',
}: {
  collapseOnNavigate?: boolean;
  expanded?: boolean;
  onCollapse?: jest.Mock;
  onExpand?: jest.Mock;
  initialPanel?: string;
  initializeState?: (snapshot: MutableSnapshot) => void;
  links?: NavLink[];
  initialEntry?: string;
} = {}) {
  if (initialPanel !== DEFAULT_PANEL) {
    localStorage.setItem('side:active-panel', initialPanel);
  }

  await act(async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter
          initialEntries={[initialEntry]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <RecoilRoot initializeState={initializeState}>
            <ActivePanelProvider>
              <ExpandedPanel
                links={links}
                collapseOnNavigate={collapseOnNavigate}
                expanded={expanded}
                onCollapse={onCollapse}
                onExpand={onExpand}
              />
            </ActivePanelProvider>
          </RecoilRoot>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });

  return { onCollapse, onExpand };
}

describe('ExpandedPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('NavIconButton collapse toggle', () => {
    it('collapses sidebar when clicking the active icon while expanded', async () => {
      const { onCollapse } = await renderPanel({ expanded: true });
      const activeButton = screen.getByRole('button', { name: 'com_ui_chat_history' });
      fireEvent.click(activeButton);
      expect(onCollapse).toHaveBeenCalledTimes(1);
    });

    it('switches panel when clicking an inactive icon while expanded', async () => {
      const { onCollapse } = await renderPanel({ expanded: true });
      const inactiveButton = screen.getByRole('button', { name: 'com_ui_prompts' });
      fireEvent.click(inactiveButton);
      expect(onCollapse).not.toHaveBeenCalled();
      expect(localStorage.getItem('side:active-panel')).toBe('prompts');
    });

    it('expands sidebar when clicking any icon while collapsed', async () => {
      const { onExpand } = await renderPanel({ expanded: false });
      const activeButton = screen.getByRole('button', { name: 'com_ui_chat_history' });
      fireEvent.click(activeButton);
      expect(onExpand).toHaveBeenCalledTimes(1);
    });

    it('sets active panel and expands when clicking an inactive icon while collapsed', async () => {
      const { onExpand } = await renderPanel({ expanded: false });
      const inactiveButton = screen.getByRole('button', { name: 'com_ui_prompts' });
      fireEvent.click(inactiveButton);
      expect(onExpand).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('side:active-panel')).toBe('prompts');
    });

    it('does not store route destinations as content panels', async () => {
      const navigate = jest.fn();
      const { onCollapse } = await renderPanel({
        links: [...createLinks(), createRouteLink(navigate)],
      });

      fireEvent.click(screen.getByRole('button', { name: 'com_ui_bookmarks' }));

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(onCollapse).not.toHaveBeenCalled();
      expect(localStorage.getItem('side:active-panel')).not.toBe('recipes');
    });

    it('collapses route destinations after navigation when configured for mobile drawers', async () => {
      const navigate = jest.fn();
      const { onCollapse } = await renderPanel({
        collapseOnNavigate: true,
        links: [...createLinks(), createRouteLink(navigate)],
      });

      fireEvent.click(screen.getByRole('button', { name: 'com_ui_bookmarks' }));

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(onCollapse).toHaveBeenCalledTimes(1);
    });

    it('collapses the rendered history panel while a route destination is active', async () => {
      const navigate = jest.fn();
      const { onCollapse } = await renderPanel({
        expanded: true,
        initialEntry: '/recipes',
        links: [...createLinks(), createRouteLink(navigate)],
      });

      fireEvent.click(screen.getByRole('button', { name: 'com_ui_chat_history' }));

      expect(onCollapse).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('NewChatButton panel switch', () => {
    it('switches to chat history panel on new chat click when setting is enabled', async () => {
      const { onCollapse } = await renderPanel({ expanded: true, initialPanel: 'prompts' });

      const newChatLink = screen.getByTestId('new-chat-button');
      fireEvent.click(newChatLink);

      expect(mockStartCookingConversation).toHaveBeenCalledTimes(1);
      expect(onCollapse).not.toHaveBeenCalled();
      expect(localStorage.getItem('side:active-panel')).toBe(DEFAULT_PANEL);
    });

    it('collapses mobile drawer on new chat click when configured', async () => {
      const { onCollapse } = await renderPanel({
        collapseOnNavigate: true,
        expanded: true,
        initialPanel: 'prompts',
      });

      fireEvent.click(screen.getByTestId('new-chat-button'));

      expect(mockStartCookingConversation).toHaveBeenCalledTimes(1);
      expect(onCollapse).toHaveBeenCalledTimes(1);
    });

    it('does not switch panel on new chat click when setting is disabled', async () => {
      await renderPanel({
        expanded: true,
        initialPanel: 'prompts',
        initializeState: ({ set }: MutableSnapshot) => {
          set(store.newChatSwitchToHistory, false);
        },
      });

      const newChatLink = screen.getByTestId('new-chat-button');
      fireEvent.click(newChatLink);

      expect(mockStartCookingConversation).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('side:active-panel')).toBe('prompts');
    });

    it('uses the same conversation-start operation from the brand link', async () => {
      await renderPanel();

      fireEvent.click(screen.getByRole('link', { name: 'com_ui_app_name' }));

      expect(mockStartCookingConversation).toHaveBeenCalledTimes(1);
    });
  });
});
