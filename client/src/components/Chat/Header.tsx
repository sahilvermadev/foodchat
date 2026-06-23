import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useCookingChat } from '~/components/Cooking/CookingChatContext';
import { useAuthContext, useHasAccess, useLocalize } from '~/hooks';
import { GuestAuthDialog } from '~/components/Auth/GuestAuth';
import { TemporaryChat } from './TemporaryChat';

function GuestAuthControl() {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return createPortal(
    <>
      <button
        type="button"
        ref={triggerRef}
        data-guest-auth-login="true"
        data-testid="guest-auth-login"
        onClick={() => setOpen(true)}
        className="pointer-events-auto fixed right-16 top-[calc(0.5rem+env(safe-area-inset-top))] z-[100] rounded-full bg-[#c1121f] px-4 py-1.5 text-sm font-medium text-white shadow-sm shadow-[#c1121f]/20 transition-colors hover:bg-[#a30f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e63946]/50 sm:right-20"
      >
        {localize('com_auth_login')}
      </button>
      <GuestAuthDialog open={open} onOpenChange={setOpen} triggerRef={triggerRef} />
    </>,
    document.body,
  );
}

function Header() {
  const { isCookingChat } = useCookingChat();
  const { isAuthenticated } = useAuthContext();
  const isGuestCookingChat = !isAuthenticated && isCookingChat;

  const hasAccessToTemporaryChat = useHasAccess({
    permissionType: PermissionTypes.TEMPORARY_CHAT,
    permission: Permissions.USE,
  });

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="via-presentation/70 md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 pointer-events-none absolute top-0 z-40 flex h-[calc(52px+env(safe-area-inset-top))] w-full items-end justify-between bg-gradient-to-b from-presentation to-transparent px-3 pb-1 font-semibold text-text-primary min-[769px]:items-center min-[769px]:justify-end min-[769px]:p-2 min-[769px]:pt-[env(safe-area-inset-top)] 2xl:via-transparent">
      <div
        className={`hide-scrollbar pointer-events-auto flex min-w-0 items-center justify-end gap-2 overflow-x-auto ${
          isGuestCookingChat ? 'pr-16 sm:pr-20' : ''
        }`}
      >
        {isGuestCookingChat ? <GuestAuthControl /> : null}
        {hasAccessToTemporaryChat === true && !isSmallScreen && !isCookingChat ? (
          <TemporaryChat />
        ) : null}
      </div>
    </div>
  );
}

export default Header;
