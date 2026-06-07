import React from 'react';
import { TooltipAnchor } from '@librechat/client';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const CollapseChat = ({
  isScrollable,
  isCollapsed,
  setIsCollapsed,
}: {
  isScrollable: boolean;
  isCollapsed: boolean;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const localize = useLocalize();
  if (!isScrollable) {
    return null;
  }

  const description = isCollapsed
    ? localize('com_ui_expand_chat')
    : localize('com_ui_collapse_chat');

  return (
    <div className="relative ml-auto items-end justify-end">
      <TooltipAnchor
        description={description}
        render={
          <button
            aria-label={description}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsCollapsed((prev) => !prev);
            }}
            className={cn(
              'z-10 flex size-11 items-center justify-center rounded-full transition-colors hover:bg-surface-hover',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            )}
          >
            {isCollapsed ? (
              <ChevronUp className="size-5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-5" aria-hidden="true" />
            )}
          </button>
        }
      />
    </div>
  );
};

export default React.memo(CollapseChat);
