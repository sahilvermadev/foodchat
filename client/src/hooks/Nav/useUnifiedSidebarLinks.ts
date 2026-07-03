import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Inbox, MessagesSquare, SlidersHorizontal } from 'lucide-react';
import type { NavLink } from '~/common';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';
import {
  GuestPreferencesPreviewPanel,
  GuestRecipesPreviewPanel,
} from '~/components/UnifiedSidebar/Guest';
import { useAuthContext } from '~/hooks/AuthContext';

export default function useUnifiedSidebarLinks() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthContext();

  return useMemo<NavLink[]>(
    () => [
      {
        title: 'com_ui_chat_history',
        label: '',
        icon: MessagesSquare,
        id: 'conversations',
        Component: ConversationsSection,
        isActive: (pathname) =>
          pathname === '/cook' || pathname.startsWith('/cook/') || pathname.startsWith('/c/'),
      },
      {
        title: 'com_recipes_library',
        label: '',
        icon: BookOpen,
        id: 'recipes',
        ...(isAuthenticated
          ? {
              onClick: () => {
                navigate('/recipes');
              },
            }
          : { Component: GuestRecipesPreviewPanel }),
        isActive: (pathname) => pathname === '/recipes' || pathname.startsWith('/recipes/'),
      },
      {
        title: 'com_social_imports_title',
        label: '',
        icon: Inbox,
        id: 'imports',
        ...(isAuthenticated
          ? {
              onClick: () => {
                navigate('/imports');
              },
            }
          : { Component: GuestRecipesPreviewPanel }),
        isActive: (pathname) => pathname === '/imports',
      },
      {
        title: 'com_nav_preferences',
        label: '',
        icon: SlidersHorizontal,
        id: 'preferences',
        ...(isAuthenticated
          ? {
              onClick: () => {
                navigate('/preferences');
              },
            }
          : { Component: GuestPreferencesPreviewPanel }),
        isActive: (pathname) => pathname === '/preferences',
      },
    ],
    [isAuthenticated, navigate],
  );
}
