import {
  getChatComposerClass,
  getChatFormLayoutClass,
  getChatInputLayoutClass,
  getChatLandingIntroClass,
  getChatStageClass,
  getPromptRailClass,
} from './landingLayout';

describe('landing layout', () => {
  test('compensates for the collapsed desktop sidebar on cooking landings', () => {
    const className = getChatStageClass({
      isLandingPage: true,
      isCookingChat: true,
      sidebarExpanded: false,
    });

    expect(className).toContain('md:-translate-x-[36px]');
    expect(className).not.toContain('md:-translate-y-4');
    expect(className).not.toContain('xl:-translate-y-6');
  });

  test('does not offset the stage while the sidebar is expanded', () => {
    expect(
      getChatStageClass({
        isLandingPage: true,
        isCookingChat: true,
        sidebarExpanded: true,
      }),
    ).not.toContain('md:-translate-x-[36px]');
  });

  test('keeps landing-only composer positioning out of established conversations', () => {
    expect(getChatComposerClass(false, true)).toBe('w-full');
    expect(getChatComposerClass(true, true)).toContain('md:max-w-3xl');
  });

  test('anchors the centered composer to the viewport midpoint', () => {
    const centeredClass = getChatComposerClass(true, true);
    expect(centeredClass).toContain('md:top-[calc(50%_-_3.5rem)]');
    expect(centeredClass).toContain('md:inset-x-0');
    expect(centeredClass).not.toContain('md:-translate-x-1/2');
    expect(centeredClass).not.toContain('md:-translate-y-1/2');

    const bottomComposerClass = getChatComposerClass(true, false);
    expect(bottomComposerClass).toContain('md:static');
    expect(bottomComposerClass).not.toContain('md:top-[calc(50%_-_3.5rem)]');
  });

  test('stacks landing composer and suggestions instead of placing them side by side', () => {
    expect(getChatFormLayoutClass(true)).toContain('flex-col');
    expect(getChatFormLayoutClass(true)).toContain('gap-0');
    expect(getChatFormLayoutClass(true)).not.toContain('md:mb-28');
    expect(getChatFormLayoutClass(true)).not.toContain('flex-row');
    expect(getChatFormLayoutClass(false)).toContain('flex-row');
    expect(getChatFormLayoutClass(false)).toContain('gap-3');
  });

  test('positions the landing intro above the composer centerline', () => {
    const centeredClass = getChatLandingIntroClass(true);
    expect(centeredClass).toContain('md:bottom-[calc(50%+5.5rem)]');
    expect(centeredClass).toContain('md:absolute');

    const bottomComposerClass = getChatLandingIntroClass(false);
    expect(bottomComposerClass).toContain('md:flex-1');
  });

  test('stacks the locked guest CTA below the composer', () => {
    const lockedClass = getChatInputLayoutClass(false, true);
    expect(lockedClass).toContain('flex-col');
    expect(lockedClass).toContain('items-stretch');
    expect(lockedClass).not.toContain('flex-row-reverse');

    expect(getChatInputLayoutClass(true, false)).toContain('flex-row-reverse');
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
    expect(className).toContain('min-[769px]:absolute');
    expect(className).toContain('min-[769px]:top-full');
    expect(className).toContain('min-[769px]:mt-7');
    expect(className).not.toContain('xl:fixed');
    expect(className).toContain('min-[1680px]:fixed');
    expect(className).toContain('min-[1680px]:flex');
    expect(className).toContain('min-[1680px]:flex-col');
    expect(className).toContain('min-[1680px]:border-l');
  });
});
