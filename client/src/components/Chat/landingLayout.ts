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
      ? 'min-h-0 flex-1 items-center justify-center overflow-hidden px-5 min-[769px]:-translate-y-4 min-[769px]:overflow-visible min-[769px]:px-0 xl:-translate-y-6'
      : 'h-full overflow-y-auto',
    isLandingPage && isCookingChat && !sidebarExpanded && 'min-[769px]:-translate-x-[36px]',
  );
}

export function getChatComposerClass(isLandingPage: boolean): string {
  return cn(
    'w-full',
    isLandingPage &&
      'fixed inset-x-0 bottom-0 z-30 mx-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] transition-all duration-200 min-[769px]:static min-[769px]:max-w-3xl min-[769px]:px-0 min-[769px]:pb-0 xl:max-w-4xl',
  );
}

export function getPromptRailClass(sidebarExpanded: boolean, loading: boolean): string {
  return cn(
    'relative mx-auto mb-3 mt-0 flex w-full max-w-sm flex-row flex-wrap items-center justify-center gap-1.5 pb-0 transition-[opacity,transform] duration-200 ease-out min-[769px]:mt-5 min-[769px]:max-w-3xl min-[769px]:flex-col min-[769px]:items-center min-[769px]:gap-2.5 min-[769px]:px-4 min-[769px]:pb-2',
    'xl:fixed xl:left-auto xl:right-12 xl:top-1/2 xl:z-20 xl:mt-0 xl:w-[300px] xl:max-w-none xl:-translate-y-1/2 xl:items-stretch xl:gap-6 xl:border-l xl:border-black/10 xl:px-0 xl:pl-5 dark:xl:border-white/10',
    '2xl:right-20',
    loading && !sidebarExpanded && 'opacity-70',
    sidebarExpanded && 'pointer-events-none translate-x-[calc(100%+7rem)] opacity-0',
  );
}
