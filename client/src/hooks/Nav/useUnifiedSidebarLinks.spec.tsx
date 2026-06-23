import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useUnifiedSidebarLinks from './useUnifiedSidebarLinks';

jest.mock('~/components/UnifiedSidebar/ConversationsSection', () => ({
  __esModule: true,
  default: () => null,
}));

let mockIsAuthenticated = true;

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

describe('useUnifiedSidebarLinks', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {children}
    </MemoryRouter>
  );

  it('only exposes cooking-relevant sidebar panels', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useUnifiedSidebarLinks(), { wrapper });

    expect(result.current.map((link) => link.id)).toEqual([
      'conversations',
      'recipes',
      'preferences',
    ]);
    expect(result.current.map((link) => link.title)).toEqual([
      'com_ui_chat_history',
      'com_recipes_library',
      'com_nav_preferences',
    ]);
  });

  it('does not expose generic LibreChat workbench panels', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useUnifiedSidebarLinks(), { wrapper });
    const ids = result.current.map((link) => link.id);

    expect(ids).not.toEqual(expect.arrayContaining(['agents', 'prompts', 'search', 'mcp-builder']));
  });

  it('marks only route-matching sidebar links active', () => {
    mockIsAuthenticated = true;
    const { result } = renderHook(() => useUnifiedSidebarLinks(), { wrapper });
    const links = Object.fromEntries(result.current.map((link) => [link.id, link]));

    expect(links.conversations.isActive?.('/cook')).toBe(true);
    expect(links.conversations.isActive?.('/cook/abc123')).toBe(true);
    expect(links.conversations.isActive?.('/c/abc123')).toBe(true);
    expect(links.conversations.isActive?.('/recipes')).toBe(false);
    expect(links.conversations.isActive?.('/preferences')).toBe(false);
    expect(links.recipes.isActive?.('/recipes')).toBe(true);
    expect(links.recipes.isActive?.('/recipes/recipe-1')).toBe(true);
    expect(links.preferences.isActive?.('/preferences')).toBe(true);
  });

  it('uses preview panels instead of protected navigation for guests', () => {
    mockIsAuthenticated = false;
    const { result } = renderHook(() => useUnifiedSidebarLinks(), { wrapper });
    const links = Object.fromEntries(result.current.map((link) => [link.id, link]));

    expect(links.recipes.Component).toBeDefined();
    expect(links.recipes.onClick).toBeUndefined();
    expect(links.preferences.Component).toBeDefined();
    expect(links.preferences.onClick).toBeUndefined();
  });
});
