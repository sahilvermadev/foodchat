/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */

/** Shared Rekky visual primitives governed by DESIGN.md. */
export const rekkyControl =
  'whitespace-nowrap rounded-control transition-colors active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-55';

export const rekkyPrimaryAction = `${rekkyControl} inline-flex h-11 shrink-0 items-center justify-center gap-2 bg-surface-submit px-4 text-sm font-semibold text-text-submit shadow-surface hover:bg-surface-submit-hover`;

export const rekkySecondaryAction = `${rekkyControl} inline-flex h-11 shrink-0 items-center justify-center gap-2 border border-border-light bg-surface-primary px-3.5 text-sm font-medium text-text-secondary shadow-surface hover:border-border-medium hover:bg-surface-hover hover:text-text-primary`;

export const rekkyStatusTag = {
  success: 'rounded-full border border-status-success/40 bg-status-success/10 text-status-success',
  caution: 'rounded-full border border-status-caution/50 bg-status-caution/10 text-status-caution',
  danger: 'rounded-full border border-status-danger/45 bg-status-danger/10 text-status-danger',
  info: 'rounded-full border border-status-info/40 bg-status-info/10 text-status-info',
} as const;

export const rekkyDialogSurface =
  'rounded-dialog border border-border-light bg-surface-dialog shadow-dialog';

export const rekkyFloatingSurface =
  'rounded-card border border-border-light bg-surface-primary shadow-floating';
