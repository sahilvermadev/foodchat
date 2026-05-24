import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, MessagesSquare, SlidersHorizontal } from 'lucide-react';
import type { NavLink } from '~/common';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';

export default function useUnifiedSidebarLinks() {
  const navigate = useNavigate();

  return useMemo<NavLink[]>(
    () => [
      {
        title: 'com_ui_chat_history',
        label: '',
        icon: MessagesSquare,
        id: 'conversations',
        Component: ConversationsSection,
      },
      {
        title: 'com_recipes_library',
        label: '',
        icon: BookOpen,
        id: 'recipes',
        onClick: () => {
          navigate('/recipes');
        },
      },
      {
        title: 'com_nav_preferences',
        label: '',
        icon: SlidersHorizontal,
        id: 'preferences',
        onClick: () => {
          navigate('/preferences');
        },
      },
    ],
    [navigate],
  );
}
