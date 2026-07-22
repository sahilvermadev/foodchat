import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import type { AuthUser } from '@/lib/auth/token-vault';
import type { StructuredRecipe } from '@/features/recipes/types';

export type RecentConversation = {
  conversationId: string;
  title?: string;
  updatedAt?: string;
};

export type ActiveCookingSession = {
  _id: string;
  status: 'active' | 'completed';
  currentStepIndex: number;
  recipeSnapshot: StructuredRecipe;
  updatedAt: string;
};

export function useCurrentUser() {
  return useQuery({
    queryKey: ['user', 'current'],
    queryFn: () => apiFetch<AuthUser>('/api/user'),
  });
}

export function useUpdatePublicProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (publicProfile: boolean) =>
      apiFetch<{ publicProfile: boolean }>('/api/user/profile', {
        method: 'PATCH',
        body: { publicProfile },
      }),
    onSuccess: ({ publicProfile }) => {
      queryClient.setQueryData<AuthUser>(['user', 'current'], (user) =>
        user ? { ...user, publicProfile } : user,
      );
      void queryClient.invalidateQueries({ queryKey: ['recipes', 'public'] });
    },
  });
}

export function useRecentConversations(limit = 4) {
  return useQuery({
    queryKey: ['conversations', 'recent', limit],
    queryFn: () =>
      apiFetch<{ conversations: RecentConversation[]; nextCursor: string | null }>(
        `/api/convos?limit=${limit}&sortBy=updatedAt&sortDirection=desc`,
      ),
  });
}

export function useActiveCookingSession() {
  return useQuery({
    queryKey: ['cooking-sessions', 'active'],
    queryFn: () =>
      apiFetch<{ sessions: ActiveCookingSession[] }>('/api/cooking/sessions?status=active&limit=1'),
  });
}
