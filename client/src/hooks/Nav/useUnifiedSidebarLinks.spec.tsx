import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useUnifiedSidebarLinks from './useUnifiedSidebarLinks';

jest.mock('~/components/UnifiedSidebar/ConversationsSection', () => ({
  __esModule: true,
  default: () => null,
}));

describe('useUnifiedSidebarLinks', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );

  it('only exposes cooking-relevant sidebar panels', () => {
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
    const { result } = renderHook(() => useUnifiedSidebarLinks(), { wrapper });
    const ids = result.current.map((link) => link.id);

    expect(ids).not.toEqual(expect.arrayContaining(['agents', 'prompts', 'search', 'mcp-builder']));
  });
});
