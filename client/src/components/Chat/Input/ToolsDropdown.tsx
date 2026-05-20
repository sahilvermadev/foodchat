import React, { useCallback, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { TooltipAnchor, DropdownPopup, PinIcon } from '@librechat/client';
import { ScrollText, Settings2 } from 'lucide-react';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import { useHasAccess, useLocalize } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { cn } from '~/utils';

interface ToolsDropdownProps {
  disabled?: boolean;
}

const ToolsDropdown = ({ disabled }: ToolsDropdownProps) => {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const canUseSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const { skills } = context ?? {};
  const { isPinned: isSkillsPinned, setIsPinned: setIsSkillsPinned } = skills ?? {};

  const handleSkillsToggle = useCallback(() => {
    skills?.debouncedChange({ value: !skills?.toggleState });
  }, [skills]);

  const dropdownItems: MenuItemProps[] = canUseSkills
    ? [
        {
          onClick: handleSkillsToggle,
          hideOnClick: false,
          render: (props) => (
            <div {...props}>
              <div className="flex items-center gap-2">
                <ScrollText className="icon-md" aria-hidden="true" />
                <span>{localize('com_ui_skills')}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSkillsPinned?.(!isSkillsPinned);
                }}
                className={cn(
                  'rounded p-1 transition-all duration-200',
                  'hover:bg-surface-secondary hover:shadow-sm',
                  !isSkillsPinned && 'text-text-secondary hover:text-text-primary',
                )}
                aria-label={isSkillsPinned ? localize('com_ui_unpin') : localize('com_ui_pin')}
              >
                <div className="h-4 w-4">
                  <PinIcon unpin={isSkillsPinned} />
                </div>
              </button>
            </div>
          ),
        },
      ]
    : [];

  if (dropdownItems.length === 0) {
    return null;
  }

  return (
    <DropdownPopup
      itemClassName="flex w-full cursor-pointer rounded-lg items-center justify-between hover:bg-surface-hover gap-5"
      menuId="tools-dropdown-menu"
      isOpen={isPopoverActive}
      setIsOpen={setIsPopoverActive}
      modal={true}
      unmountOnHide={true}
      trigger={
        <TooltipAnchor
          render={
            <Ariakit.MenuButton
              disabled={disabled ?? false}
              id="tools-dropdown-button"
              aria-label="Tools Options"
              className={cn(
                'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
                isPopoverActive && 'bg-surface-hover',
              )}
            >
              <Settings2 className="size-5" aria-hidden="true" />
            </Ariakit.MenuButton>
          }
          id="tools-dropdown-button"
          description={localize('com_ui_tools')}
          disabled={disabled ?? false}
        />
      }
      items={dropdownItems}
      iconClassName="mr-0"
    />
  );
};

export default React.memo(ToolsDropdown);
