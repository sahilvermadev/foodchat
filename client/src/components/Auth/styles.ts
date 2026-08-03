/* Hallmark · component: authentication controls · genre: editorial · theme: Rekky mineral + ember
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: semantic token pairs
 */
/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */

export const authInputClass =
  'auth-input peer w-full rounded-control border border-border-medium bg-surface-primary-alt px-4 pb-3 pt-4 text-text-primary caret-surface-submit shadow-surface outline outline-2 outline-transparent outline-offset-1 transition-colors duration-200 hover:bg-surface-hover focus:border-border-medium focus:bg-surface-primary focus:outline-ring-primary aria-[invalid=true]:border-status-danger aria-[invalid=true]:outline-status-danger disabled:cursor-not-allowed disabled:opacity-55';

export const authLabelClass =
  'pointer-events-none absolute start-3 top-0 z-raised origin-[0] -translate-y-1/2 scale-75 transform rounded-md bg-surface-primary-alt px-2 text-sm text-text-secondary transition-colors duration-200 peer-focus:bg-surface-primary peer-focus:text-surface-submit';

export const authPrimaryButtonClass =
  'auth-primary-action h-12 w-full whitespace-nowrap rounded-control bg-surface-submit font-medium text-text-submit shadow-surface transition-colors hover:bg-surface-submit-hover active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-surface-secondary disabled:text-text-secondary disabled:opacity-55';

export const authInlineLinkClass =
  'inline-flex whitespace-nowrap rounded-sm p-1 text-sm font-medium text-surface-submit underline decoration-transparent transition-colors hover:text-surface-submit-hover hover:decoration-current active:text-surface-submit-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';
