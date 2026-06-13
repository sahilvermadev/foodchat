import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useParams } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import { useToastContext, useMediaQuery } from '@librechat/client';
import type { CookingChatCategory, TConversation } from 'librechat-data-provider';
import { useUpdateConversationMutation } from '~/data-provider';
import { useNavigateToConvo, useLocalize, useShiftKey } from '~/hooks';
import type { TranslationKeys } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { ConvoOptions } from './ConvoOptions';
import RenameForm from './RenameForm';
import { cn, logger } from '~/utils';
import ConvoLink from './ConvoLink';
import store from '~/store';

interface ConversationProps {
  conversation: TConversation;
  retainView: () => void;
  toggleNav: () => void;
  isGenerating?: boolean;
}

const categoryDotClasses: Record<CookingChatCategory, string> = {
  ideas: 'bg-[#d97706] dark:bg-[#f59e0b]',
  recipes: 'bg-[#c1121f] dark:bg-[#e63946]',
  saved_recipe: 'bg-[#7c3aed] dark:bg-[#a78bfa]',
  adjustments: 'bg-[#2563eb] dark:bg-[#60a5fa]',
  cooking_help: 'bg-[#15803d] dark:bg-[#4ade80]',
};

const categoryLabelKeys: Record<CookingChatCategory, TranslationKeys> = {
  ideas: 'com_cooking_chat_category_ideas',
  recipes: 'com_cooking_chat_category_recipes',
  saved_recipe: 'com_cooking_chat_category_saved_recipe',
  adjustments: 'com_cooking_chat_category_adjustments',
  cooking_help: 'com_cooking_chat_category_cooking_help',
};

function CategoryDot({
  category,
  isGenerating,
}: {
  category?: CookingChatCategory;
  isGenerating: boolean;
}) {
  const localize = useLocalize();
  const label = category
    ? localize(categoryLabelKeys[category])
    : localize('com_cooking_chat_category_uncategorized');

  return (
    <span
      className="relative flex size-5 shrink-0 items-center justify-center"
      role="img"
      aria-label={label}
      title={label}
    >
      {isGenerating ? (
        <span
          className={cn(
            'absolute size-4 animate-ping rounded-full opacity-20',
            category ? categoryDotClasses[category] : 'bg-gray-400 dark:bg-gray-500',
          )}
          aria-hidden="true"
        />
      ) : null}
      <span
        className={cn(
          'relative size-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/15',
          category ? categoryDotClasses[category] : 'bg-gray-400 dark:bg-gray-500',
        )}
        aria-hidden="true"
      />
    </span>
  );
}

export default function Conversation({
  conversation,
  retainView,
  toggleNav,
  isGenerating = false,
}: ConversationProps) {
  const params = useParams();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const currentConvoId = useMemo(() => params.conversationId, [params.conversationId]);
  const updateConvoMutation = useUpdateConversationMutation(currentConvoId ?? '');
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const isShiftHeld = useShiftKey();
  const { conversationId, title = '' } = conversation;

  const [titleInput, setTitleInput] = useState(title || '');
  const [renaming, setRenaming] = useState(false);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  // Lazy-load ConvoOptions to avoid running heavy hooks for all conversations
  const [hasInteracted, setHasInteracted] = useState(false);

  const previousTitle = useRef(title);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (title !== previousTitle.current) {
      setTitleInput(title as string);
      previousTitle.current = title;
    }
  }, [title]);

  const isActiveConvo = useMemo(() => {
    if (conversationId === Constants.NEW_CONVO) {
      return currentConvoId === Constants.NEW_CONVO;
    }

    if (currentConvoId !== Constants.NEW_CONVO) {
      return currentConvoId === conversationId;
    } else {
      const latestConvo = activeConvos?.[0];
      return latestConvo === conversationId;
    }
  }, [currentConvoId, conversationId, activeConvos]);

  const handleRename = () => {
    setIsPopoverActive(false);
    setTitleInput(title as string);
    setRenaming(true);
  };

  const handleRenameSubmit = async (newTitle: string) => {
    if (!conversationId || newTitle === title) {
      setRenaming(false);
      return;
    }

    try {
      await updateConvoMutation.mutateAsync({
        conversationId,
        title: newTitle.trim() || localize('com_ui_untitled'),
      });
      setRenaming(false);
    } catch (error) {
      logger.error('Error renaming conversation', error);
      setTitleInput(title as string);
      showToast({
        message: localize('com_ui_rename_failed'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
      setRenaming(false);
    }
  };

  const handleCancelRename = () => {
    setTitleInput(title as string);
    setRenaming(false);
  };

  const handleMouseEnter = useCallback(() => {
    if (!hasInteracted) {
      setHasInteracted(true);
    }
  }, [hasInteracted]);

  const handleMouseLeave = useCallback(() => {
    if (!isPopoverActive) {
      setHasInteracted(false);
    }
  }, [isPopoverActive]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      // Don't reset if focus is moving to a child element within this container
      if (e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
      }
      if (!isPopoverActive) {
        setHasInteracted(false);
      }
    },
    [isPopoverActive],
  );

  const handlePopoverOpenChange = useCallback((open: boolean) => {
    setIsPopoverActive(open);
    if (!open) {
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container && !container.contains(document.activeElement)) {
          setHasInteracted(false);
        }
      });
    }
  }, []);

  const handleNavigation = (ctrlOrMetaKey: boolean) => {
    if (ctrlOrMetaKey) {
      toggleNav();
      const baseUrl = window.location.origin;
      const path = `/cook/${conversationId}`;
      window.open(baseUrl + path, '_blank');
      return;
    }

    if (currentConvoId === conversationId || isPopoverActive) {
      if (isSmallScreen && !isPopoverActive) {
        setSidebarExpanded(false);
      }
      return;
    }

    toggleNav();
    if (isSmallScreen) {
      setSidebarExpanded(false);
    }

    if (typeof title === 'string' && title.length > 0) {
      document.title = title;
    }

    navigateToConvo(conversation, {
      currentConvoId,
      resetLatestMessage: !(conversationId ?? '') || conversationId === Constants.NEW_CONVO,
    });
  };

  const convoOptionsProps = {
    title,
    retainView,
    renameHandler: handleRename,
    isActiveConvo,
    conversationId,
    isPopoverActive,
    setIsPopoverActive: handlePopoverOpenChange,
    isShiftHeld: isActiveConvo ? isShiftHeld : false,
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative flex h-11 w-full items-center rounded-md outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary md:h-8',
        isActiveConvo || isPopoverActive
          ? 'bg-[#c1121f]/[0.08] text-[#c1121f] before:absolute before:bottom-1 before:left-0 before:top-1 before:w-0.5 before:rounded-full before:bg-[#c1121f] dark:bg-[#c1121f]/10 dark:text-[#e63946]'
          : 'hover:bg-black/[0.035] dark:hover:bg-surface-active-alt',
      )}
      role="button"
      tabIndex={renaming ? -1 : 0}
      aria-label={localize('com_ui_conversation_label', {
        title: title || localize('com_ui_untitled'),
      })}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleBlur}
      onClick={(e) => {
        if (renaming) {
          return;
        }
        if (e.button === 0) {
          handleNavigation(e.ctrlKey || e.metaKey);
        }
      }}
      onKeyDown={(e) => {
        if (renaming) {
          return;
        }
        if (e.target !== e.currentTarget) {
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleNavigation(false);
        }
      }}
      style={{ cursor: renaming ? 'default' : 'pointer' }}
      data-testid="convo-item"
    >
      {renaming ? (
        <RenameForm
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          onSubmit={handleRenameSubmit}
          onCancel={handleCancelRename}
          localize={localize}
        />
      ) : (
        <ConvoLink
          isActiveConvo={isActiveConvo}
          isPopoverActive={isPopoverActive}
          title={title}
          onRename={handleRename}
          isSmallScreen={isSmallScreen}
          localize={localize}
        >
          <CategoryDot category={conversation.cookingCategory} isGenerating={isGenerating} />
        </ConvoLink>
      )}
      <div
        className={cn(
          'mr-2 flex origin-left',
          isPopoverActive || isActiveConvo
            ? 'pointer-events-auto scale-x-100 opacity-100'
            : 'pointer-events-none max-w-0 scale-x-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:max-w-[60px] group-focus-within:scale-x-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:max-w-[60px] group-hover:scale-x-100 group-hover:opacity-100',
          !isPopoverActive && isActiveConvo && isShiftHeld ? 'max-w-[60px]' : 'max-w-[28px]',
        )}
        // Removing aria-hidden to fix accessibility issue: ARIA hidden element must not be focusable or contain focusable elements
        // but not sure what its original purpose was, so leaving the property commented out until it can be cleared safe to delete.
        // aria-hidden={!(isPopoverActive || isActiveConvo)}
      >
        {/* Only render ConvoOptions when user interacts (hover/focus) or for active conversation */}
        {!renaming && (hasInteracted || isActiveConvo) && <ConvoOptions {...convoOptionsProps} />}
      </div>
    </div>
  );
}
