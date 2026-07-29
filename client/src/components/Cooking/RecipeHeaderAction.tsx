import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '~/utils';

type RecipeHeaderActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  children: ReactNode;
  labelClassName?: string;
  variant?: 'primary' | 'secondary';
};

export default function RecipeHeaderAction({
  icon,
  children,
  labelClassName,
  className,
  variant = 'secondary',
  ...props
}: RecipeHeaderActionProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-control border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55',
        variant === 'primary'
          ? 'border-transparent bg-surface-submit text-text-submit hover:bg-surface-submit-hover'
          : 'border-border-light bg-transparent text-text-secondary hover:border-border-medium hover:bg-surface-hover hover:text-text-primary',
        className,
      )}
    >
      {icon}
      <span className={labelClassName}>{children}</span>
    </button>
  );
}
