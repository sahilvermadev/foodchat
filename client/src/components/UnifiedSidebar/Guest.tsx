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
      <div className="flex min-h-0 flex-1 flex-col justify-center rounded-2xl border border-black/10 bg-white/40 p-5 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#c1121f]/10 text-[#c1121f] dark:bg-[#e63946]/15 dark:text-[#e63946]">
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
