import type { Messages } from '@i18n/messages';

export type RuntimeTranslationValues = Record<string, string | number | boolean>;

export type RuntimeTranslator = (
  key: keyof Messages,
  fallback: string,
  values?: RuntimeTranslationValues
) => string;
