import { getChatComposerClass, getChatStageClass, getPromptRailClass } from './landingLayout';

describe('landing layout', () => {
  test('compensates for the collapsed desktop sidebar on cooking landings', () => {
    expect(
      getChatStageClass({
        isLandingPage: true,
        isCookingChat: true,
        sidebarExpanded: false,
      }),
    ).toContain('min-[769px]:-translate-x-[36px]');
  });

  test('does not offset the stage while the sidebar is expanded', () => {
    expect(
      getChatStageClass({
        isLandingPage: true,
        isCookingChat: true,
        sidebarExpanded: true,
      }),
    ).not.toContain('min-[769px]:-translate-x-[36px]');
  });

  test('keeps landing-only composer positioning out of established conversations', () => {
    expect(getChatComposerClass(false)).toBe('w-full');
    expect(getChatComposerClass(true)).toContain('min-[769px]:max-w-3xl');
  });

  test('moves and disables the prompt rail when history is expanded', () => {
    const className = getPromptRailClass(true, false);
    expect(className).toContain('pointer-events-none');
    expect(className).toContain('opacity-0');
  });
});
