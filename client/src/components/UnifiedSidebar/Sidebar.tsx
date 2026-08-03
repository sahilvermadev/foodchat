import { memo } from 'react';
import type { NavLink } from '~/common';
import SidePanelNav from '~/components/SidePanel/Nav';
import ExpandedPanel from './ExpandedPanel';
import { cn } from '~/utils';

function Sidebar({
  links,
  expanded,
  onCollapse,
  onExpand,
  onResizeStart,
  onResizeKeyboard,
  contentWidth,
  transparent = false,
}: {
  links: NavLink[];
  expanded: boolean;
  contentWidth: number;
  transparent?: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onResizeKeyboard: (direction: 'shrink' | 'grow') => void;
}) {
  return (
    <>
      <div
        data-testid="desktop-sidebar-content"
        className="flex h-full flex-none overflow-hidden"
        style={{ width: contentWidth }}
      >
        <ExpandedPanel
          links={links}
          expanded={expanded}
          transparent={transparent}
          onCollapse={onCollapse}
          onExpand={onExpand}
        />
        <nav
          className={cn(
            'rekky-ease-out min-h-0 flex-1 overflow-hidden bg-surface-primary-alt transition-opacity duration-200',
            expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          aria-hidden={!expanded}
        >
          <SidePanelNav links={links} />
        </nav>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={expanded ? 0 : -1}
        className={cn(
          'rekky-ease-out absolute right-0 top-0 z-raised h-full w-1 cursor-col-resize transition-[background-color,opacity] duration-150 hover:bg-border-medium active:bg-border-heavy',
          expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onMouseDown={onResizeStart}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            onResizeKeyboard('shrink');
          } else if (e.key === 'ArrowRight') {
            onResizeKeyboard('grow');
          }
        }}
      />
    </>
  );
}

export default memo(Sidebar);
