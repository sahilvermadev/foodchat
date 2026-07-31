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
      ? 'min-h-0 flex-1 items-center justify-center overflow-hidden px-5 md:-translate-y-4 md:overflow-visible md:px-0 xl:-translate-y-6'
      : 'h-full overflow-y-auto',
    isLandingPage && isCookingChat && !sidebarExpanded && 'md:-translate-x-[36px]',
  );
}

export function getChatComposerClass(isLandingPage: boolean): string {
  return cn(
    'w-full',
    isLandingPage &&
      'fixed inset-x-0 bottom-0 z-30 mx-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] transition-all duration-200 md:static md:max-w-3xl md:px-0 md:pb-0 xl:max-w-4xl',
  );
}

export function getChatFormLayoutClass(isFreshLanding: boolean): string {
  return cn('mx-auto flex w-full transition-[max-width] duration-300', {
    'flex-col gap-0': isFreshLanding,
    'flex-row gap-3': !isFreshLanding,
  });
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
    'relative mx-auto mb-3 mt-3 flex w-full max-w-sm flex-row flex-wrap items-center justify-center gap-1.5 pb-0 transition-[opacity,transform] duration-200 ease-out md:mt-4 md:max-w-3xl md:flex-col md:items-start md:gap-3 md:px-1 md:pb-2 min-[1024px]:grid min-[1024px]:grid-cols-3 min-[1024px]:items-start min-[1024px]:gap-5 xl:max-w-4xl xl:px-0',
    'min-[1680px]:fixed min-[1680px]:left-auto min-[1680px]:right-20 min-[1680px]:top-1/2 min-[1680px]:z-20 min-[1680px]:mt-0 min-[1680px]:flex min-[1680px]:w-[300px] min-[1680px]:max-w-none min-[1680px]:-translate-y-1/2 min-[1680px]:flex-col min-[1680px]:items-stretch min-[1680px]:gap-6 min-[1680px]:border-l min-[1680px]:border-black/10 min-[1680px]:px-0 min-[1680px]:pl-5 dark:min-[1680px]:border-white/10',
    loading && !sidebarExpanded && 'opacity-70',
    sidebarExpanded && 'pointer-events-none translate-x-[calc(100%+7rem)] opacity-0',
  );
}
