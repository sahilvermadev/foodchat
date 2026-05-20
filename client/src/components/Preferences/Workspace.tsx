import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pencil, Save, SendHorizontal, SlidersHorizontal, X } from 'lucide-react';
import { Spinner } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import type { DeviceLocationContext, PreferencesChatHistoryMessage } from 'librechat-data-provider';
import {
  usePreferencesChatMutation,
  usePreferencesQuery,
  useUpdatePreferencesMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import {
  preferenceSections,
  renderEditablePreferencesMarkdown,
  renderPreferencesMarkdown,
} from './artifact';

type ThreadMessage = PreferencesChatHistoryMessage & {
  id: string;
};

function messageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const imperialRegions = new Set(['US', 'LR', 'MM']);

function regionFromLocale(locale?: string): string | undefined {
  const parts = locale?.split('-') ?? [];
  return parts.length > 1 ? parts[parts.length - 1]?.toUpperCase() : undefined;
}

function measurementSystem(locale?: string): DeviceLocationContext['measurementSystem'] {
  return imperialRegions.has(regionFromLocale(locale) ?? '') ? 'imperial' : 'metric';
}

function baseDeviceContext(): DeviceLocationContext {
  const locale = navigator.language;
  const languages = Array.from(navigator.languages ?? []).slice(0, 5);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    ...(locale ? { locale } : {}),
    ...(languages.length ? { languages } : {}),
    ...(timeZone ? { timeZone } : {}),
    measurementSystem: measurementSystem(locale),
  };
}

function useDeviceLocationContext(): { context: DeviceLocationContext; ready: boolean } {
  const [state, setState] = useState<{ context: DeviceLocationContext; ready: boolean }>(() => ({
    context: baseDeviceContext(),
    ready: false,
  }));

  useEffect(() => {
    let active = true;
    const finish = (context: DeviceLocationContext) => {
      if (active) {
        setState({ context, ready: true });
      }
    };
    const fallbackTimer = window.setTimeout(() => finish(baseDeviceContext()), 1800);

    if (!navigator.geolocation) {
      window.clearTimeout(fallbackTimer);
      finish(baseDeviceContext());
      return () => {
        active = false;
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(fallbackTimer);
        finish({
          ...baseDeviceContext(),
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            source: 'browser_geolocation',
            permission: 'granted',
          },
        });
      },
      () => {
        window.clearTimeout(fallbackTimer);
        finish(baseDeviceContext());
      },
      { enableHighAccuracy: false, maximumAge: 60 * 60 * 1000, timeout: 1500 },
    );

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  return state;
}

export default function PreferencesWorkspace() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const preferencesQuery = usePreferencesQuery();
  const chatMutation = usePreferencesChatMutation();
  const updatePreferencesMutation = useUpdatePreferencesMutation();
  const markdown = preferencesQuery.data?.markdown ?? '';
  const sections = useMemo(() => preferenceSections(markdown), [markdown]);
  const [draft, setDraft] = useState('');
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [lastChangedHeadings, setLastChangedHeadings] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editMarkdown, setEditMarkdown] = useState(markdown);
  const [editError, setEditError] = useState('');
  const startedRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const deviceLocationContext = useDeviceLocationContext();

  const sendToAgent = useCallback(
    (message: string, visible = true) => {
      const clean = message.trim();
      const nextThread = visible
        ? [...thread, { id: messageId(), role: 'user' as const, content: clean }]
        : thread;

      if (visible) {
        setThread(nextThread);
      }
      setDraft('');

      chatMutation.mutate(
        {
          message: clean,
          history: thread.map(({ role, content }) => ({ role, content })),
          deviceContext: deviceLocationContext.context,
        },
        {
          onSuccess: (response) => {
            setLastChangedHeadings(response.changedHeadings ?? []);
            setThread((current) => [
              ...current,
              { id: messageId(), role: 'assistant', content: response.text },
            ]);
          },
          onError: () => {
            setLastChangedHeadings([]);
            setThread((current) => [
              ...current,
              {
                id: messageId(),
                role: 'assistant',
                content: 'I could not update preferences right now. Try again in a moment.',
              },
            ]);
          },
        },
      );
    },
    [chatMutation, deviceLocationContext.context, thread],
  );

  useEffect(() => {
    if (startedRef.current || preferencesQuery.isLoading || !deviceLocationContext.ready) {
      return;
    }
    startedRef.current = true;
    sendToAgent('', false);
  }, [deviceLocationContext.ready, preferencesQuery.isLoading, sendToAgent]);

  useEffect(() => {
    if (!isEditing) {
      setEditMarkdown(renderEditablePreferencesMarkdown(markdown));
    }
  }, [isEditing, markdown]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread, chatMutation.isLoading]);

  const submit = () => {
    if (!draft.trim() || chatMutation.isLoading) {
      return;
    }
    sendToAgent(draft);
  };

  const startEditing = () => {
    setEditMarkdown(renderEditablePreferencesMarkdown(markdown));
    setEditError('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditMarkdown(renderEditablePreferencesMarkdown(markdown));
    setEditError('');
    setIsEditing(false);
  };

  const saveEditedPreferences = () => {
    if (updatePreferencesMutation.isLoading) {
      return;
    }
    setEditError('');
    updatePreferencesMutation.mutate(
      { markdown: renderPreferencesMarkdown(editMarkdown) },
      {
        onSuccess: () => {
          setIsEditing(false);
          setLastChangedHeadings([localize('com_preferences_saved_title')]);
        },
        onError: () => {
          setEditError(localize('com_ui_error_updating_preferences'));
        },
      },
    );
  };

  const hasAnyPreferences = sections.some((section) => section.lines.length > 0);

  return (
    <main className="flex h-full min-h-0 flex-col bg-background text-text-primary">
      <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border-light px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={localize('com_ui_back')}
            className="flex size-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            onClick={() => navigate('/cook')}
          >
            <ArrowLeft className="icon-md" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">{localize('com_nav_preferences')}</h1>
            <p className="text-sm text-text-secondary">{localize('com_preferences_privacy')}</p>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(22rem,0.9fr)_minmax(28rem,1.1fr)]">
        <section
          aria-label={localize('com_preferences_document')}
          className="min-h-0 overflow-y-auto border-b border-border-light px-4 py-5 lg:border-b-0 lg:border-r lg:px-6"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="icon-md text-text-secondary" aria-hidden="true" />
              <h2 className="text-base font-semibold">{localize('com_preferences_saved_title')}</h2>
            </div>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={localize('com_ui_cancel')}
                  className="flex size-9 items-center justify-center rounded-lg border border-border-light text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  disabled={updatePreferencesMutation.isLoading}
                  onClick={cancelEditing}
                >
                  <X className="icon-sm" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={localize('com_ui_save')}
                  className="flex size-9 items-center justify-center rounded-lg bg-green-700 text-white hover:bg-green-800 disabled:opacity-50"
                  disabled={updatePreferencesMutation.isLoading}
                  onClick={saveEditedPreferences}
                >
                  {updatePreferencesMutation.isLoading ? (
                    <Spinner className="icon-sm" />
                  ) : (
                    <Save className="icon-sm" aria-hidden="true" />
                  )}
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label={localize('com_preferences_edit')}
                className="flex size-9 items-center justify-center rounded-lg border border-border-light text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                disabled={preferencesQuery.isLoading}
                onClick={startEditing}
              >
                <Pencil className="icon-sm" aria-hidden="true" />
              </button>
            )}
          </div>
          {lastChangedHeadings.length > 0 && (
            <div className="mb-4 rounded-lg border border-green-700/30 bg-green-700/10 px-3 py-2 text-sm text-green-700 dark:text-green-300">
              {localize('com_preferences_saved_just_now')} {lastChangedHeadings.join(', ')}
            </div>
          )}
          {editError && (
            <div className="mb-4 rounded-lg border border-red-700/30 bg-red-700/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {editError}
            </div>
          )}

          {preferencesQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner className="text-text-primary" />
            </div>
          ) : isEditing ? (
            <div className="flex min-h-[calc(100vh-13rem)] flex-col rounded-lg border border-border-light bg-surface-secondary">
              <label htmlFor="preferences-markdown-editor" className="sr-only">
                {localize('com_preferences_edit')}
              </label>
              <textarea
                id="preferences-markdown-editor"
                value={editMarkdown}
                className="min-h-[calc(100vh-13rem)] flex-1 resize-none overflow-y-auto border-0 bg-transparent px-4 py-3 font-mono text-sm leading-6 text-text-primary outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                placeholder={localize('com_preferences_edit_placeholder')}
                onChange={(event) => setEditMarkdown(event.target.value)}
              />
            </div>
          ) : !hasAnyPreferences ? (
            <div className="rounded-xl border border-dashed border-border-medium px-5 py-8 text-sm text-text-secondary">
              <p className="font-medium text-text-primary">{localize('com_preferences_empty')}</p>
              <p className="mt-2">{localize('com_preferences_agent_empty')}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {sections.map((section) => (
                <section
                  key={section.heading}
                  className="rounded-lg border border-border-light bg-surface-secondary px-4 py-3"
                >
                  <h3 className="mb-2 text-sm font-semibold">{section.heading}</h3>
                  <ul className="space-y-1 text-sm leading-6 text-text-secondary">
                    {section.lines.length > 0 ? (
                      section.lines.map((line) => (
                        <li key={`${section.heading}:${line}`}>{line.replace(/^-\s*/, '')}</li>
                      ))
                    ) : (
                      <li className="italic">{localize('com_preferences_not_set')}</li>
                    )}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="border-b border-border-light px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">{localize('com_preferences_agent_title')}</h2>
            <p className="text-sm text-text-secondary">{localize('com_preferences_agent_hint')}</p>
            <p className="mt-1 text-xs text-text-secondary">
              {localize('com_preferences_device_location_hint')}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {thread.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[85%] rounded-xl px-4 py-3 text-sm leading-6',
                    message.role === 'user'
                      ? 'ml-auto bg-surface-active-alt text-text-primary'
                      : 'mr-auto bg-surface-secondary text-text-primary',
                  )}
                >
                  {message.content}
                </div>
              ))}
              {chatMutation.isLoading && (
                <div className="mr-auto flex items-center gap-2 rounded-xl bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
                  <Spinner className="icon-sm" />
                  {localize('com_preferences_agent_thinking')}
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-border-light px-4 py-4 md:px-6">
            <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-border-light bg-surface-secondary p-2">
              <label htmlFor="preferences-agent-message" className="sr-only">
                {localize('com_preferences_message_label')}
              </label>
              <textarea
                id="preferences-agent-message"
                value={draft}
                rows={2}
                className="max-h-36 min-h-12 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                placeholder={localize('com_preferences_message_placeholder')}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <button
                type="button"
                aria-label={localize('com_ui_submit')}
                className="flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-green-700 text-white hover:bg-green-800 disabled:opacity-50"
                disabled={!draft.trim() || chatMutation.isLoading}
                onClick={submit}
              >
                <SendHorizontal className="icon-sm" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
