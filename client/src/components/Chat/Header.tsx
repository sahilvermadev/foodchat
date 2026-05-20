import { useMediaQuery } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import ModelSelector from './Menus/Endpoints/ModelSelector';
import { useGetStartupConfig } from '~/data-provider';
import BookmarkMenu from './Menus/BookmarkMenu';
import { TemporaryChat } from './TemporaryChat';
import { useCookingChat } from '~/components/Cooking/CookingChatContext';
import { useHasAccess } from '~/hooks';

function Header() {
  const { data: startupConfig } = useGetStartupConfig();
  const { isCookingChat } = useCookingChat();

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const hasAccessToTemporaryChat = useHasAccess({
    permissionType: PermissionTypes.TEMPORARY_CHAT,
    permission: Permissions.USE,
  });

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="via-presentation/70 md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 absolute top-0 z-10 flex h-[52px] w-full items-center justify-end bg-gradient-to-b from-presentation to-transparent p-2 font-semibold text-text-primary 2xl:via-transparent">
      <div className="hide-scrollbar flex min-w-0 items-center justify-end gap-2 overflow-x-auto">
        {hasAccessToBookmarks === true && <BookmarkMenu />}
        {hasAccessToTemporaryChat === true && !isSmallScreen && !isCookingChat ? (
          <TemporaryChat />
        ) : null}
        <ModelSelector startupConfig={startupConfig} />
      </div>
    </div>
  );
}

export default Header;
