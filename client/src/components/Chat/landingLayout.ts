/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · design-system: DESIGN.md */
import { cn } from '~/utils';

type LandingLayoutState = {
  isLandingPage: boolean;
  isCookingChat: boolean;
  sidebarExpanded: boolean;
};

export function getChatStageClass({
  isLandingPage,
  isCookingChat,
  sidebarExpanded,
}: LandingLayoutState): string {
  return cn(
    'relative z-10 flex flex-col',
    isLandingPage
      ? 'min-h-0 flex-1 items-center justify-center overflow-hidden px-5 py-6 md:overflow-visible md:px-0 md:py-10'
      : 'h-full overflow-y-auto',
    isLandingPage && isCookingChat && !sidebarExpanded && 'md:-translate-x-[36px]',
  );
}

export function getChatLandingIntroClass(centerFormOnLanding: boolean): string {
  return cn(
    'flex max-h-full shrink-0 flex-col items-center justify-center pb-0',
    centerFormOnLanding
      ? 'md:absolute md:inset-x-0 md:bottom-[calc(50%+5.5rem)]'
      : 'md:min-h-0 md:flex-1 md:pb-16',
  );
}

export function getChatComposerClass(isLandingPage: boolean, centerFormOnLanding: boolean): string {
  return cn(
    'w-full',
    isLandingPage &&
      'fixed inset-x-0 bottom-0 z-30 mx-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] transition-[transform,opacity] duration-200 md:max-w-3xl md:px-0 md:pb-0 xl:max-w-4xl',
    isLandingPage &&
      (centerFormOnLanding
        ? 'md:absolute md:inset-x-0 md:bottom-auto md:top-[calc(50%_-_3.5rem)] md:mx-auto'
        : 'md:static'),
  );
}

export function getChatFormLayoutClass(isFreshLanding: boolean): string {
  return cn(
    'mx-auto flex w-full',
    isFreshLanding ? 'flex-col gap-0 md:px-2' : 'flex-row gap-3 sm:mb-10 sm:px-2',
  );
}

export function getChatInputLayoutClass(isRTL: boolean, guestComposerLocked: boolean): string {
  return cn(
    'order-2 flex w-full md:order-1',
    guestComposerLocked ? 'flex-col items-stretch' : 'items-center',
    isRTL && !guestComposerLocked && 'flex-row-reverse',
  );
}

export function getPromptRailClass(sidebarExpanded: boolean, loading: boolean): string {
  return cn(
    'relative mx-auto mb-3 mt-3 flex w-full max-w-sm flex-row flex-wrap items-center justify-center gap-1.5 pb-0 transition-[opacity,transform] duration-200 ease-out min-[769px]:absolute min-[769px]:top-full min-[769px]:mt-7 min-[769px]:max-w-3xl min-[769px]:flex-col min-[769px]:items-start min-[769px]:gap-3 min-[769px]:px-1 min-[769px]:pb-2 min-[1024px]:grid min-[1024px]:grid-cols-3 min-[1024px]:items-start min-[1024px]:gap-5 xl:max-w-4xl xl:px-0',
    'min-[1680px]:fixed min-[1680px]:left-auto min-[1680px]:right-20 min-[1680px]:top-1/2 min-[1680px]:z-20 min-[1680px]:mt-0 min-[1680px]:flex min-[1680px]:w-[300px] min-[1680px]:max-w-none min-[1680px]:-translate-y-1/2 min-[1680px]:flex-col min-[1680px]:items-stretch min-[1680px]:gap-0 min-[1680px]:border-l min-[1680px]:border-border-light min-[1680px]:px-0 min-[1680px]:pl-5',
    loading && !sidebarExpanded && 'opacity-70',
    sidebarExpanded && 'pointer-events-none translate-x-[calc(100%+7rem)] opacity-0',
  );
}
