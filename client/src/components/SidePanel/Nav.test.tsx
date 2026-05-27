import React from 'react';
import { BookOpen, MessagesSquare } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NavLink } from '~/common';
import { ActivePanelProvider } from '~/Providers';
import Nav from './Nav';

const links: NavLink[] = [
  {
    title: 'com_ui_chat_history',
    icon: MessagesSquare,
    id: 'conversations',
    Component: () => <div>Chat history content</div>,
    isActive: (pathname) => pathname === '/cook',
  },
  {
    title: 'com_recipes_library',
    icon: BookOpen,
    id: 'recipes',
    isActive: (pathname) => pathname === '/recipes',
  },
];

describe('SidePanel Nav', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a content panel on a route-only destination', () => {
    localStorage.setItem('side:active-panel', 'recipes');

    render(
      <MemoryRouter
        initialEntries={['/recipes']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ActivePanelProvider>
          <Nav links={links} />
        </ActivePanelProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Chat history content')).toBeInTheDocument();
  });
});
