import { OGDialog, OGDialogContent, OGDialogTitle } from '@librechat/client';
import type { RefObject } from 'react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { ContextualAuthLink } from './flow';

type GuestAuthActionsProps = {
  onNavigate?: () => void;
  primaryAction?: 'login' | 'register';
  compact?: boolean;
};

export function GuestAuthActions({
  onNavigate,
  primaryAction = 'login',
  compact = false,
}: GuestAuthActionsProps) {
  const localize = useLocalize();
  const actions = {
    login: {
      mode: 'login' as const,
      label: localize('com_auth_login'),
    },
    register: {
      mode: 'register' as const,
      label: localize('com_auth_sign_up'),
    },
  };
  const orderedActions =
    primaryAction === 'login'
      ? [actions.login, actions.register]
      : [actions.register, actions.login];

  return (
    <div className={cn('flex gap-2', compact ? 'flex-wrap' : 'flex-col')}>
      {orderedActions.map((action, index) => (
        <ContextualAuthLink
          key={action.mode}
          mode={action.mode}
          onClick={onNavigate}
          className={cn(
            'inline-flex items-center justify-center rounded-full px-4 text-sm font-medium transition-colors',
            compact ? 'h-9' : 'h-10',
            index === 0
              ? 'bg-surface-submit text-text-submit hover:bg-surface-submit-hover'
              : 'border border-border-medium text-text-primary hover:bg-surface-hover',
          )}
        >
          {action.label}
        </ContextualAuthLink>
      ))}
    </div>
  );
}

export function GuestAuthDialog({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement>;
}) {
  const localize = useLocalize();

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      <OGDialogContent
        overlayClassName="bg-black/70"
        className="w-[calc(100vw-2rem)] max-w-sm gap-0 rounded-dialog border border-border-light bg-surface-primary p-6 text-text-primary shadow-dialog"
      >
        <OGDialogTitle className="pr-8 text-lg font-semibold leading-6">
          {localize('com_cooking_guest_auth_title')}
        </OGDialogTitle>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          {localize('com_cooking_guest_auth_body')}
        </p>
        <div className="mt-6">
          <GuestAuthActions onNavigate={() => onOpenChange(false)} />
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
