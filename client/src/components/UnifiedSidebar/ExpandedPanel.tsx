import { memo, useCallback, lazy, Suspense } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import { SquarePen } from 'lucide-react';
import { Skeleton, Button, TooltipAnchor, ThemeSelector } from '@librechat/client';
import type { NavLink } from '~/common';
import { useActivePanel, DEFAULT_PANEL } from '~/Providers/ActivePanelContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';
import { resolveRenderedPanel } from '~/components/SidePanel/panelSelection';
import useStartCookingConversation from '~/hooks/Chat/useStartCookingConversation';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

const BrandButton = memo(function BrandButton({
  onStartConversation,
}: {
  onStartConversation: () => void;
}) {
  const localize = useLocalize();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onStartConversation();
      }
    },
    [onStartConversation],
  );

  return (
    <TooltipAnchor
      side="right"
      description={localize('com_ui_app_name')}
      render={
        <a
          href="/cook"
          className="flex h-12 w-14 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          aria-label={localize('com_ui_app_name')}
          onClick={handleClick}
        >
          <span className="rekky-sidebar-wordmark select-none text-[#c1121f] transition-colors hover:text-[#e63946]">
            {localize('com_ui_app_name')}
          </span>
        </a>
      }
    />
  );
});

const NewChatButton = memo(function NewChatButton({
  onStartConversation,
}: {
  onStartConversation: () => void;
}) {
  const localize = useLocalize();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onStartConversation();
      }
    },
    [onStartConversation],
  );

  return (
    <TooltipAnchor
      side="right"
      description={localize('com_ui_new_chat')}
      render={
        <a
          href="/cook"
          data-testid="new-chat-button"
          aria-label={localize('com_ui_new_chat')}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
          onClick={handleClick}
        >
          <SquarePen className="h-6 w-6 text-text-primary" />
        </a>
      }
    />
  );
});

const NavIconButton = memo(function NavIconButton({
  link,
  isActive,
  expanded,
  setActive,
  onExpand,
  onCollapse,
  collapseOnNavigate,
}: {
  link: NavLink;
  isActive: boolean;
  expanded: boolean;
  setActive: (id: string) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  collapseOnNavigate?: boolean;
}) {
  const localize = useLocalize();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (link.onClick) {
        link.onClick(e);
        if (collapseOnNavigate) {
          onCollapse?.();
        }
        return;
      }
      if (isActive && expanded) {
        onCollapse?.();
        return;
      }
      if (!isActive) {
        setActive(link.id);
      }
      if (!expanded) {
        onExpand?.();
      }
    },
    [collapseOnNavigate, expanded, isActive, link, onCollapse, onExpand, setActive],
  );

  return (
    <TooltipAnchor
      description={localize(link.title)}
      side="right"
      render={
        <Button
          id={`side-nav-${link.id}`}
          data-testid={`side-nav-${link.id}`}
          size="icon"
          variant="ghost"
          aria-label={localize(link.title)}
          aria-pressed={isActive}
          className={cn(
            'h-11 w-11 rounded-lg',
            isActive
              ? 'bg-[#c1121f]/10 text-[#c1121f] hover:bg-[#c1121f]/15 dark:bg-[#c1121f]/[0.12] dark:text-[#e63946]'
              : 'text-text-secondary hover:text-text-primary',
          )}
          onClick={handleClick}
        >
          <link.icon className="h-6 w-6" aria-hidden="true" />
        </Button>
      }
    />
  );
});

function ExpandedPanel({
  links,
  expanded = true,
  transparent = false,
  collapseOnNavigate = false,
  onCollapse,
  onExpand,
}: {
  links: NavLink[];
  expanded?: boolean;
  transparent?: boolean;
  collapseOnNavigate?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}) {
  const location = useLocation();
  const { active, setActive } = useActivePanel();
  const renderedPanel = resolveRenderedPanel(active, links, location.pathname);
  const switchToHistory = useRecoilValue(store.newChatSwitchToHistory);
  const startConversation = useStartCookingConversation();
  const handleStartConversation = useCallback(() => {
    startConversation();
    if (switchToHistory) {
      setActive(DEFAULT_PANEL);
    }
    if (collapseOnNavigate) {
      onCollapse?.();
    }
  }, [collapseOnNavigate, onCollapse, setActive, startConversation, switchToHistory]);

  return (
    <div
      className={cn(
        'flex h-full w-[4.5rem] flex-shrink-0 flex-col border-r px-2 py-2',
        transparent
          ? 'border-transparent bg-transparent'
          : 'border-border-light bg-surface-primary-alt',
      )}
    >
      <div className="flex h-14 items-center justify-center">
        <BrandButton onStartConversation={handleStartConversation} />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-3">
        <div className="flex max-h-full flex-col items-center gap-2 overflow-y-auto">
          <NewChatButton onStartConversation={handleStartConversation} />
          <div className="my-1 h-px w-7 bg-border-light" />
          {links.map((link) => (
            <NavIconButton
              key={link.id}
              link={link}
              isActive={
                link.Component
                  ? expanded && link.id === renderedPanel
                  : Boolean(link.isActive?.(location.pathname))
              }
              expanded={expanded ?? true}
              setActive={setActive}
              onExpand={onExpand}
              onCollapse={onCollapse}
              collapseOnNavigate={collapseOnNavigate}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 pb-1">
        <ThemeSelector returnThemeOnly />
        <Suspense fallback={<Skeleton className="h-12 w-12 rounded-lg" />}>
          <AccountSettings collapsed />
        </Suspense>
      </div>
    </div>
  );
}

export default memo(ExpandedPanel);
