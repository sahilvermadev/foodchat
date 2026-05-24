import { memo } from 'react';
import { cn } from '~/utils';

interface SidePanelProps {
  children: React.ReactNode;
  transparentBackground?: boolean;
}

const SidePanelGroup = memo(({ children, transparentBackground }: SidePanelProps) => {
  return (
    <div
      className={cn(
        'relative flex flex-1 overflow-hidden',
        transparentBackground ? 'bg-transparent' : 'bg-presentation',
      )}
    >
      {children}
    </div>
  );
});

SidePanelGroup.displayName = 'SidePanelGroup';

export default SidePanelGroup;
