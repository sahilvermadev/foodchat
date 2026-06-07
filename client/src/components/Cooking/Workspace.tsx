import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import type { CookingDocumentType, CookingDraft } from 'librechat-data-provider';
import ChatView from '~/components/Chat/ChatView';
import {
  useDeleteCookingDocumentMutation,
  useSelectCookingDocumentMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import RecipeCanvas from './RecipeCanvas';

function documentTypeKey(type: CookingDocumentType) {
  if (type === 'guide') {
    return 'com_cooking_document_type_guide' as const;
  }
  if (type === 'prep_plan') {
    return 'com_cooking_document_type_prep_plan' as const;
  }
  return 'com_cooking_document_type_recipe' as const;
}

type CookingWorkspaceProps = {
  conversationId: string;
  chatConversationId?: string;
  draft?: CookingDraft;
  documents?: CookingDraft[];
  documentsLoaded?: boolean;
  selectedDocumentId?: string;
  markdown: string;
  isPreparingDraft: boolean;
  index?: number;
};

type RetainedDocumentState = {
  conversationId?: string;
  documents: CookingDraft[];
  selectedDocumentId?: string;
};

function resolveWorkspaceDocuments({
  conversationId,
  documents,
  documentsLoaded,
  draft,
  markdown,
  retained,
  selectedDocumentId,
}: {
  conversationId: string;
  documents: CookingDraft[];
  documentsLoaded: boolean;
  draft?: CookingDraft;
  markdown: string;
  retained: RetainedDocumentState;
  selectedDocumentId?: string;
}) {
  let visibleDocuments = documents;
  if (!visibleDocuments.length && draft) {
    visibleDocuments = [draft];
  }
  if (!visibleDocuments.length && !documentsLoaded && retained.conversationId === conversationId) {
    visibleDocuments = retained.documents;
  }

  const resolvedSelectedDocumentId =
    selectedDocumentId ??
    draft?._id ??
    (retained.conversationId === conversationId ? retained.selectedDocumentId : undefined);
  const selectedDocument =
    visibleDocuments.find((document) => document._id === resolvedSelectedDocumentId) ??
    draft ??
    visibleDocuments.find((document) => document.selected) ??
    visibleDocuments[0];
  const selectedMarkdown = selectedDocument?.documentMarkdown?.trim() || markdown;

  return {
    visibleDocuments,
    selectedDocument,
    selectedMarkdown,
    hasRecipeCanvas: Boolean(selectedDocument || selectedMarkdown.trim()),
  };
}

export default function CookingWorkspace({
  conversationId,
  chatConversationId,
  draft,
  documents = [],
  documentsLoaded = false,
  selectedDocumentId,
  markdown,
  isPreparingDraft,
  index = 0,
}: CookingWorkspaceProps) {
  const localize = useLocalize();
  const selectDocument = useSelectCookingDocumentMutation(conversationId);
  const deleteDocument = useDeleteCookingDocumentMutation(conversationId);
  const [documentToDelete, setDocumentToDelete] = useState<CookingDraft>();
  const [mobileTab, setMobileTab] = useState<'recipe' | 'chat'>('recipe');
  const retainedDocumentStateRef = useRef<RetainedDocumentState>({ documents: [] });

  useEffect(() => {
    if (documents.length > 0) {
      retainedDocumentStateRef.current = { conversationId, documents, selectedDocumentId };
      return;
    }
    if (draft) {
      retainedDocumentStateRef.current = {
        conversationId,
        documents: [draft],
        selectedDocumentId: draft._id,
      };
      return;
    }
    if (documentsLoaded) {
      retainedDocumentStateRef.current = { conversationId, documents: [] };
    }
  }, [conversationId, documents, documentsLoaded, draft, selectedDocumentId]);

  const { visibleDocuments, selectedDocument, selectedMarkdown, hasRecipeCanvas } =
    resolveWorkspaceDocuments({
      conversationId,
      documents,
      documentsLoaded,
      draft,
      markdown,
      retained: retainedDocumentStateRef.current,
      selectedDocumentId,
    });

  const confirmDelete = () => {
    if (!documentToDelete || deleteDocument.isLoading) {
      return;
    }

    deleteDocument.mutate(documentToDelete._id, {
      onSuccess: () => setDocumentToDelete(undefined),
    });
  };

  return (
    <div className="rekky-ui flex h-full min-h-0 w-full flex-col overflow-hidden bg-presentation lg:flex-row">
      {hasRecipeCanvas ? (
        <div className="flex h-12 shrink-0 items-stretch border-b border-border-light bg-surface-primary-alt pl-12 pr-14 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileTab('recipe')}
            className={`flex-1 border-b-2 text-center text-sm font-semibold transition-colors ${
              mobileTab === 'recipe'
                ? 'border-surface-submit bg-surface-primary text-text-primary'
                : 'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            {localize('com_cooking_document_type_recipe')}
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('chat')}
            className={`flex-1 border-b-2 text-center text-sm font-semibold transition-colors ${
              mobileTab === 'chat'
                ? 'border-surface-submit bg-surface-primary text-text-primary'
                : 'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            {localize('com_ui_chat') || 'Assistant'}
          </button>
        </div>
      ) : null}
      <aside
        className={
          hasRecipeCanvas
            ? `order-2 ${
                mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'
              } min-h-0 flex-1 flex-col overflow-hidden bg-surface-primary-alt lg:h-full lg:min-h-0 lg:w-[30rem] lg:flex-none lg:border-l lg:border-t-0 lg:border-border-light xl:w-[32rem]`
            : 'order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-primary-alt'
        }
      >
        <div className="flex h-full min-h-0 w-full flex-1 bg-surface-primary-alt">
          <ChatView
            index={index}
            conversationId={chatConversationId ?? conversationId}
            collapseRecipeMessages
          />
        </div>
      </aside>
      {hasRecipeCanvas && (
        <div
          className={`order-1 ${
            mobileTab === 'recipe' ? 'flex' : 'hidden lg:flex'
          } min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}
        >
          {visibleDocuments.length > 0 ? (
            <nav
              aria-label={localize('com_cooking_documents')}
              className="flex h-11 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border-light bg-surface-primary-alt px-3 sm:h-12 sm:px-5"
            >
              {visibleDocuments.map((document) => {
                const isSelected = document._id === selectedDocument?._id;
                return (
                  <div key={document._id} className="relative flex shrink-0 items-center">
                    <button
                      type="button"
                      aria-current={isSelected ? 'page' : undefined}
                      onClick={() => !isSelected && selectDocument.mutate(document._id)}
                      className={`relative h-full max-w-52 truncate px-2.5 pr-1 font-sans text-sm transition-colors after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:content-[''] sm:max-w-64 sm:px-3 sm:pr-1 sm:after:inset-x-3 ${
                        isSelected
                          ? 'text-text-primary after:bg-surface-submit'
                          : 'text-text-secondary after:bg-transparent hover:text-text-primary'
                      }`}
                    >
                      {document.recipe.title}
                      <span className="sr-only">
                        {' '}
                        {localize(documentTypeKey(document.documentType))}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={localize('com_cooking_delete_document', {
                        0: document.recipe.title,
                      })}
                      onClick={() => setDocumentToDelete(document)}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy sm:size-8 sm:rounded-md"
                    >
                      <Trash2 className="size-4 sm:size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </nav>
          ) : null}
          <RecipeCanvas
            draft={selectedDocument}
            markdown={selectedMarkdown}
            conversationId={conversationId}
            isPreparingDraft={isPreparingDraft}
          />
        </div>
      )}
      <OGDialog
        open={documentToDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleteDocument.isLoading) {
            setDocumentToDelete(undefined);
          }
        }}
      >
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_cooking_delete_document_title')}
          className="max-w-[450px]"
          main={
            <p className="text-left text-sm text-text-primary">
              {localize('com_cooking_delete_document_confirm', {
                0: documentToDelete?.recipe.title ?? '',
              })}
            </p>
          }
          selection={
            <button
              type="button"
              disabled={deleteDocument.isLoading}
              className="flex h-10 items-center justify-center gap-2 rounded-lg border-none bg-surface-destructive px-4 py-2 text-sm text-white transition-colors hover:bg-surface-destructive-hover disabled:cursor-not-allowed disabled:opacity-70"
              onClick={confirmDelete}
            >
              {deleteDocument.isLoading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {localize('com_ui_delete')}
            </button>
          }
        />
      </OGDialog>
    </div>
  );
}
