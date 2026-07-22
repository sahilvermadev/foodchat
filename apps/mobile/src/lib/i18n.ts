import { getLocales } from 'expo-localization';

import { en } from '@/locales/en';

export type TranslationKey = keyof typeof en;
type TranslationValues = Record<string, string | number>;

const resources = { en } as const;
const locale = getLocales()[0]?.languageCode;
const active = locale === 'en' ? resources.en : resources.en;

export function translate(key: TranslationKey, values: TranslationValues = {}): string {
  let message: string = active[key];
  for (const [name, value] of Object.entries(values)) {
    message = message.replaceAll(`{{${name}}}`, String(value));
  }
  return message;
}

export function useTranslation() {
  return { t: translate };
}
