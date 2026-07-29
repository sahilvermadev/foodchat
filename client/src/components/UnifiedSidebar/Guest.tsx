import { BookOpen, MessagesSquare, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';
import { GuestAuthActions } from '~/components/Auth/GuestAuth';

type GuestPreviewPanelProps = {
  icon: LucideIcon;
  titleKey: TranslationKeys;
  bodyKey: TranslationKeys;
};

function GuestPreviewPanel({ icon: Icon, titleKey, bodyKey }: GuestPreviewPanelProps) {
  const localize = useLocalize();

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-5 text-text-primary">
      <div className="flex min-h-0 flex-1 flex-col justify-center rounded-card border border-border-light bg-surface-primary p-5 text-center shadow-surface">
        <div className="bg-surface-submit/10 mx-auto flex size-12 items-center justify-center rounded-full text-surface-submit">
          <Icon className="size-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-base font-semibold leading-6">{localize(titleKey)}</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{localize(bodyKey)}</p>
        <div className="mt-5">
          <GuestAuthActions />
        </div>
      </div>
    </div>
  );
}

export function GuestHistoryEmptyState() {
  return (
    <GuestPreviewPanel
      icon={MessagesSquare}
      titleKey="com_cooking_guest_history_title"
      bodyKey="com_cooking_guest_history_body"
    />
  );
}

export function GuestRecipesPreviewPanel() {
  return (
    <GuestPreviewPanel
      icon={BookOpen}
      titleKey="com_cooking_guest_recipes_title"
      bodyKey="com_cooking_guest_recipes_body"
    />
  );
}

export function GuestPreferencesPreviewPanel() {
  return (
    <GuestPreviewPanel
      icon={SlidersHorizontal}
      titleKey="com_cooking_guest_preferences_title"
      bodyKey="com_cooking_guest_preferences_body"
    />
  );
}
