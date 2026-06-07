import type { LocaleDefinition, LocaleStaticMessages } from '../localeDefinition';
import type { Messages } from '../messages';
import { DEFAULT_RUNTIME_MESSAGES, DEFAULT_STATIC_MESSAGES } from '../locales';
import { pseudoLocalizeMessages, pseudoLocalizeStatic } from '../pseudoLocalization';

const ENGLISH_RUNTIME_MESSAGES = DEFAULT_RUNTIME_MESSAGES;
const ENGLISH_STATIC_MESSAGES = DEFAULT_STATIC_MESSAGES;

export function buildPseudoRuntimeMessages(): Messages {
  return pseudoLocalizeMessages(ENGLISH_RUNTIME_MESSAGES);
}

export function buildPseudoStaticMessages(): LocaleStaticMessages {
  return pseudoLocalizeStatic(ENGLISH_STATIC_MESSAGES);
}

export function buildPseudoLocaleDefinition(): LocaleDefinition {
  return {
    runtime: buildPseudoRuntimeMessages(),
    static: buildPseudoStaticMessages()
  };
}
