import { useMediaQuery } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { TemporaryChat } from './TemporaryChat';
import { useCookingChat } from '~/components/Cooking/CookingChatContext';
import { useHasAccess } from '~/hooks';

function Header() {
  const { isCookingChat } = useCookingChat();

  const hasAccessToTemporaryChat = useHasAccess({
    permissionType: PermissionTypes.TEMPORARY_CHAT,
    permission: Permissions.USE,
  });

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="via-presentation/70 md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 absolute top-0 z-20 flex h-[calc(52px+env(safe-area-inset-top))] w-full items-end justify-between bg-gradient-to-b from-presentation to-transparent px-3 pb-1 font-semibold text-text-primary min-[769px]:items-center min-[769px]:justify-end min-[769px]:p-2 min-[769px]:pt-[env(safe-area-inset-top)] 2xl:via-transparent">
      <div className="hide-scrollbar flex min-w-0 items-center justify-end gap-2 overflow-x-auto">
        {hasAccessToTemporaryChat === true && !isSmallScreen && !isCookingChat ? (
          <TemporaryChat />
        ) : null}
      </div>
    </div>
  );
}

export default Header;
