import { OGDialog, OGDialogContent, OGDialogTitle } from '@librechat/client';
import { Link, useLocation } from 'react-router-dom';
import type { RefObject } from 'react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

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
  const location = useLocation();
  const currentPath = encodeURIComponent(`${location.pathname}${location.search}`);
  const actions = {
    login: {
      label: localize('com_auth_login'),
      to: `/login?redirect_to=${currentPath}`,
    },
    register: {
      label: localize('com_auth_sign_up'),
      to: `/register?redirect_to=${currentPath}`,
    },
  };
  const orderedActions =
    primaryAction === 'login'
      ? [actions.login, actions.register]
      : [actions.register, actions.login];

  return (
    <div className={cn('flex gap-2', compact ? 'flex-wrap' : 'flex-col')}>
      {orderedActions.map((action, index) => (
        <Link
          key={action.to}
          to={action.to}
          onClick={onNavigate}
          className={cn(
            'inline-flex items-center justify-center rounded-full px-4 text-sm font-medium transition-colors',
            compact ? 'h-9' : 'h-10',
            index === 0
              ? 'bg-[#c1121f] text-white hover:bg-[#a30f1a]'
              : 'border border-border-medium text-text-primary hover:bg-surface-hover',
          )}
        >
          {action.label}
        </Link>
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
        className="w-[calc(100vw-2rem)] max-w-sm gap-0 rounded-2xl border border-border-light bg-surface-primary p-6 text-text-primary shadow-2xl"
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
