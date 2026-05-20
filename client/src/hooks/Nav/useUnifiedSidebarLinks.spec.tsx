import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useUnifiedSidebarLinks from './useUnifiedSidebarLinks';

jest.mock('~/components/UnifiedSidebar/ConversationsSection', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/Skills', () => ({
  SkillsAccordion: () => null,
}));

describe('useUnifiedSidebarLinks', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );

  it('only exposes cooking-relevant sidebar panels', () => {
    const { result } = renderHook(() => useUnifiedSidebarLinks(), { wrapper });

    expect(result.current.map((link) => link.id)).toEqual(['conversations', 'skills', 'recipes']);
    expect(result.current.map((link) => link.title)).toEqual([
      'com_ui_chat_history',
      'com_ui_skills',
      'com_recipes_library',
    ]);
  });

  it('does not expose generic LibreChat workbench panels', () => {
    const { result } = renderHook(() => useUnifiedSidebarLinks(), { wrapper });
    const ids = result.current.map((link) => link.id);

    expect(ids).not.toEqual(expect.arrayContaining(['agents', 'prompts', 'search', 'mcp-builder']));
  });
});
