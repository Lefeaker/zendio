import type { LocaleDefinition, LocaleStaticMessages, RuntimeMessages } from '../localeDefinition';
import en from '../generated/locales/en.generated';
import { pseudoLocalizeMessages, pseudoLocalizeStatic } from '../pseudoLocalization';

const ENGLISH_RUNTIME_MESSAGES = en.runtime;
const ENGLISH_STATIC_MESSAGES = en.static;

export function buildPseudoRuntimeMessages(): RuntimeMessages {
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
