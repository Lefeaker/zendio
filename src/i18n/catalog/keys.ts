import { GENERATED_RELEASE_LOCALE_MESSAGES_EN } from '../generated/localeRegistry.generated';
import type { Messages } from '../messages';

export type RuntimeMessageKey = Extract<keyof Messages, string>;

export const RUNTIME_MESSAGE_KEYS = Object.freeze(
  Object.keys(GENERATED_RELEASE_LOCALE_MESSAGES_EN) as RuntimeMessageKey[]
);

const RUNTIME_MESSAGE_KEY_SET = new Set<string>(RUNTIME_MESSAGE_KEYS);

export function isRuntimeMessageKey(value: string): value is RuntimeMessageKey {
  return RUNTIME_MESSAGE_KEY_SET.has(value);
}
