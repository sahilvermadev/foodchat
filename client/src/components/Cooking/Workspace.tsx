import ChatView from '~/components/Chat/ChatView';
import RecipeCanvas from './RecipeCanvas';
import type { CookingDraft } from 'librechat-data-provider';

type CookingWorkspaceProps = {
  conversationId: string;
  draft?: CookingDraft;
  markdown: string;
  isPreparingDraft: boolean;
  index?: number;
};

export default function CookingWorkspace({
  conversationId,
  draft,
  markdown,
  isPreparingDraft,
  index = 0,
}: CookingWorkspaceProps) {
  const hasRecipeCanvas = Boolean(draft || markdown.trim());

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-presentation lg:flex-row">
      <aside
        className={
          hasRecipeCanvas
            ? 'order-2 min-h-[24rem] shrink-0 border-t border-border-light bg-surface-primary-alt lg:h-full lg:w-[30rem] lg:border-l lg:border-t-0 xl:w-[32rem]'
            : 'order-1 min-w-0 flex-1'
        }
      >
        <ChatView index={index} conversationId={conversationId} collapseRecipeMessages />
      </aside>
      {hasRecipeCanvas && (
        <div className="order-1 min-h-0 min-w-0 flex-1">
          <RecipeCanvas
            draft={draft}
            markdown={markdown}
            conversationId={conversationId}
            isPreparingDraft={isPreparingDraft}
          />
        </div>
      )}
    </div>
  );
}
