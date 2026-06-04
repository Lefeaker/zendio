import en from '../locales/en';
import type { Messages } from '../messages';

export type RuntimeMessageKey = Extract<keyof Messages, string>;

export const RUNTIME_MESSAGE_KEYS = Object.freeze(Object.keys(en.runtime) as RuntimeMessageKey[]);

const RUNTIME_MESSAGE_KEY_SET = new Set<string>(RUNTIME_MESSAGE_KEYS);

export function isRuntimeMessageKey(value: string): value is RuntimeMessageKey {
  return RUNTIME_MESSAGE_KEY_SET.has(value);
}
