import { memo, useCallback, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import { SquarePen } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { Skeleton, Button, TooltipAnchor, ThemeSelector } from '@librechat/client';
import type { NavLink } from '~/common';
import { useActivePanel, DEFAULT_PANEL } from '~/Providers/ActivePanelContext';
import { useLocalize, useNewConvo } from '~/hooks';
import { clearMessagesCache, cn } from '~/utils';
import store from '~/store';
import { resolveRenderedPanel } from '~/components/SidePanel/panelSelection';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

const NewChatButton = memo(function NewChatButton({
  collapseOnNavigate,
  onCollapse,
  setActive,
}: {
  collapseOnNavigate?: boolean;
  onCollapse?: () => void;
  setActive: (id: string) => void;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const switchToHistory = useRecoilValue(store.newChatSwitchToHistory);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        clearMessagesCache(queryClient, conversation?.conversationId);
        queryClient.invalidateQueries([QueryKeys.messages]);
        newConversation({ routeBase: '/cook' });
        if (switchToHistory) {
          setActive(DEFAULT_PANEL);
        }
        if (collapseOnNavigate) {
          onCollapse?.();
        }
      }
    },
    [
      collapseOnNavigate,
      conversation?.conversationId,
      newConversation,
      onCollapse,
      queryClient,
      setActive,
      switchToHistory,
    ],
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
            isActive ? 'bg-surface-active-alt text-surface-submit' : 'text-text-secondary',
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
  const localize = useLocalize();
  const location = useLocation();
  const { active, setActive } = useActivePanel();
  const renderedPanel = resolveRenderedPanel(active, links, location.pathname);

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
        <TooltipAnchor
          side="right"
          description={localize('com_ui_app_name')}
          render={
            <div
              className="flex h-12 w-14 items-center justify-center rounded-lg"
              aria-label={localize('com_ui_app_name')}
            >
              <span className="rekky-sidebar-wordmark select-none text-text-primary">
                {localize('com_ui_app_name')}
              </span>
            </div>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-3">
        <div className="flex max-h-full flex-col items-center gap-2 overflow-y-auto">
          <NewChatButton
            collapseOnNavigate={collapseOnNavigate}
            onCollapse={onCollapse}
            setActive={setActive}
          />
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
