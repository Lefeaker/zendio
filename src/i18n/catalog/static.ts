import type { LocaleStaticMessages } from '../localeDefinition';

export const CHROME_STATIC_KEYS = [
  'extName',
  'extDescription'
] as const satisfies readonly (keyof LocaleStaticMessages)[];

export type ChromeStaticKey = (typeof CHROME_STATIC_KEYS)[number];
export type ChromeStaticCatalog = Record<ChromeStaticKey, string>;

const CHROME_STATIC_KEY_SET = new Set<string>(CHROME_STATIC_KEYS);

export function isChromeStaticKey(value: string): value is ChromeStaticKey {
  return CHROME_STATIC_KEY_SET.has(value);
}
