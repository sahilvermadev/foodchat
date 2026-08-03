import React from 'react';
import { cn } from '~/utils';

interface ConvoLinkProps {
  isActiveConvo: boolean;
  isPopoverActive: boolean;
  title: string | null;
  onRename: () => void;
  isSmallScreen: boolean;
  localize: (key: any, options?: any) => string;
  children: React.ReactNode;
}

const ConvoLink: React.FC<ConvoLinkProps> = ({
  isActiveConvo,
  isPopoverActive,
  title,
  onRename,
  isSmallScreen,
  localize,
  children,
}) => {
  return (
    <div
      className={cn(
        'flex grow items-center gap-2.5 overflow-hidden rounded-md px-2 text-[13px] leading-8',
        isActiveConvo || isPopoverActive ? 'text-surface-submit' : 'text-text-primary',
      )}
      title={title ?? undefined}
      aria-current={isActiveConvo ? 'page' : undefined}
      style={{ width: '100%' }}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center text-text-tertiary transition-colors',
          isActiveConvo || isPopoverActive
            ? 'text-surface-submit'
            : 'group-hover:text-text-secondary',
        )}
      >
        {children}
      </span>
      <div
        className="relative flex-1 grow overflow-hidden whitespace-nowrap"
        style={{ textOverflow: 'clip' }}
        onDoubleClick={(e) => {
          if (isSmallScreen) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          onRename();
        }}
        aria-label={title || localize('com_ui_untitled')}
      >
        {title || localize('com_ui_untitled')}
      </div>
      <div
        className={cn(
          'pointer-events-none absolute bottom-0.5 right-0.5 top-0.5 w-20 rounded-r-md bg-gradient-to-l',
          isActiveConvo || isPopoverActive
            ? 'from-surface-active'
            : 'from-surface-primary-alt from-0% to-transparent group-hover:from-surface-hover group-hover:from-40%',
        )}
        aria-hidden="true"
      />
    </div>
  );
};

export default ConvoLink;
