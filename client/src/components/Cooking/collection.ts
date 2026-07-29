import { rekkyPrimaryAction, rekkySecondaryAction } from '../Rekky/styles';

export const collectionPageScroll =
  'min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6 lg:px-14';

export const collectionPageContent =
  'mx-auto flex max-w-[1400px] flex-col gap-5 pt-3 sm:gap-7 sm:pt-0';

export const collectionPageTitle =
  'hidden text-[1.9rem] font-medium leading-none text-text-primary min-[380px]:text-[2rem] sm:block sm:text-[2.5rem]';

export const collectionPrimaryAction = rekkyPrimaryAction;

export const collectionSecondaryAction = rekkySecondaryAction;

export const collectionGrid = 'grid gap-x-5 gap-y-7 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

export const collectionCard = 'group relative flex h-full min-w-0 flex-col';

export const collectionCardMedia =
  'relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-card bg-surface-hover';

export const collectionCardBody = 'relative flex flex-1 flex-col px-1 pb-2 pt-3';

export const collectionCardTitle =
  'line-clamp-2 min-h-[2.75rem] text-base font-semibold leading-snug text-text-primary sm:text-[1.05rem]';
