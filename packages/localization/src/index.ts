import tr from './locales/tr.json';
import en from './locales/en.json';

export { withSuffix, possessive, forName } from './turkish-suffix';
export type { SuffixCase } from './turkish-suffix';

export const resources = {
  tr: { translation: tr },
  en: { translation: en },
} as const;

export const supportedLocales = ['tr', 'en'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export const defaultLocale: SupportedLocale = 'tr';

export { tr, en };
