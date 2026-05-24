import { memo, useCallback, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilValue } from 'recoil';
import { SquarePen } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { Skeleton, Button, TooltipAnchor, ThemeSelector } from '@librechat/client';
import type { NavLink } from '~/common';
import { useActivePanel, resolveActivePanel, DEFAULT_PANEL } from '~/Providers';
import { useLocalize, useNewConvo } from '~/hooks';
import { clearMessagesCache, cn } from '~/utils';
import store from '~/store';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

const NewChatButton = memo(function NewChatButton({
  setActive,
}: {
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
      }
    },
    [queryClient, conversation?.conversationId, newConversation, switchToHistory, setActive],
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
}: {
  link: NavLink;
  isActive: boolean;
  expanded: boolean;
  setActive: (id: string) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  const localize = useLocalize();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (link.onClick) {
        link.onClick(e);
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
    [link, isActive, setActive, expanded, onExpand, onCollapse],
  );

  return (
    <TooltipAnchor
      description={localize(link.title)}
      side="right"
      render={
        <Button
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
  onCollapse,
  onExpand,
}: {
  links: NavLink[];
  expanded?: boolean;
  transparent?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}) {
  const localize = useLocalize();
  const { active, setActive } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);

  return (
    <div
      className={cn(
        'flex h-full flex-shrink-0 flex-col border-r px-2 py-2',
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
              className="flex h-12 w-12 items-center justify-center rounded-lg"
              aria-label={localize('com_ui_app_name')}
            >
              <span className="select-none text-[0.92rem] font-bold uppercase leading-none tracking-[0.1em] text-text-primary">
                {localize('com_ui_app_name')}
              </span>
            </div>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-3">
        <div className="flex max-h-full flex-col items-center gap-2 overflow-y-auto">
          <NewChatButton setActive={setActive} />
          <div className="my-1 h-px w-7 bg-border-light" />
          {links.map((link) => (
            <NavIconButton
              key={link.id}
              link={link}
              isActive={link.id === effectiveActive}
              expanded={expanded ?? true}
              setActive={setActive}
              onExpand={onExpand}
              onCollapse={onCollapse}
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
