import { useRef } from 'react';
import { Portal, Content } from '@radix-ui/react-popover';
import { Button, CrossIcon, useOnClickOutside } from '@librechat/client';
import type { ReactNode } from 'react';
import { cn, removeFocusOutlines } from '~/utils';

type TOptionsPopoverProps = {
  children: ReactNode;
  visible: boolean;
  closePopover: () => void;
  PopoverButtons: ReactNode;
};

export default function OptionsPopover({
  children,
  visible,
  closePopover,
  PopoverButtons,
}: TOptionsPopoverProps) {
  const popoverRef = useRef(null);
  useOnClickOutside(
    popoverRef,
    () => closePopover(),
    ['dialog-template-content', 'shadcn-button', 'advanced-settings'],
    (_target) => {
      const target = _target as Element;
      const tagName = target.tagName;
      return tagName === 'path' || tagName === 'svg' || tagName === 'circle';
    },
  );

  const cardStyle =
    'shadow-xl rounded-md min-w-[75px] font-normal bg-white border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  if (!visible) {
    return null;
  }

  return (
    <Portal>
      <Content sideOffset={8} align="start" ref={popoverRef} asChild>
        <div className="z-[70] flex w-screen flex-col items-center md:w-full md:px-4">
          <div
            className={cn(
              cardStyle,
              'dark:bg-gray-700',
              'border-d-0 flex w-full flex-col overflow-hidden rounded-none border-s-0 border-t bg-white px-0 pb-[10px] dark:border-white/10 md:rounded-md md:border lg:w-[736px]',
            )}
          >
            <div className="flex w-full items-center bg-gray-50 px-2 py-2 dark:bg-gray-700">
              {PopoverButtons}
              <Button
                type="button"
                className={cn(
                  'ml-auto h-auto bg-transparent px-3 py-2 text-xs font-normal text-black hover:bg-gray-100 hover:text-black dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white',
                  removeFocusOutlines,
                )}
                onClick={closePopover}
              >
                <CrossIcon />
              </Button>
            </div>
            <div>{children}</div>
          </div>
        </div>
      </Content>
    </Portal>
  );
}
