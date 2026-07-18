import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '~/utils';

type RecipeHeaderActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  children: ReactNode;
};

export default function RecipeHeaderAction({
  icon,
  children,
  className,
  ...props
}: RecipeHeaderActionProps) {
  return (
    <button
      {...props}
      className={cn(
        'border-border-light/45 bg-surface-primary-alt/60 hover:border-border-light/80 inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
