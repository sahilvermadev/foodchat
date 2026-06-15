import {
  getChatComposerClass,
  getChatFormLayoutClass,
  getChatStageClass,
  getPromptRailClass,
} from './landingLayout';

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

  test('stacks landing composer and suggestions instead of placing them side by side', () => {
    expect(getChatFormLayoutClass(true)).toContain('flex-col');
    expect(getChatFormLayoutClass(true)).toContain('gap-0');
    expect(getChatFormLayoutClass(true)).not.toContain('flex-row');
    expect(getChatFormLayoutClass(false)).toContain('flex-row');
    expect(getChatFormLayoutClass(false)).toContain('gap-3');
  });

  test('moves and disables the prompt rail when history is expanded', () => {
    const className = getPromptRailClass(true, false);
    expect(className).toContain('pointer-events-none');
    expect(className).toContain('opacity-0');
  });

  test('uses the side suggestion rail only on very wide screens', () => {
    const className = getPromptRailClass(false, false);
    expect(className).toContain('min-[1024px]:grid');
    expect(className).toContain('min-[1024px]:grid-cols-3');
    expect(className).not.toContain('xl:fixed');
    expect(className).toContain('min-[1680px]:fixed');
    expect(className).toContain('min-[1680px]:flex');
    expect(className).toContain('min-[1680px]:flex-col');
    expect(className).toContain('min-[1680px]:border-l');
  });
});
