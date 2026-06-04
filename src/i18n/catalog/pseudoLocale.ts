import { GENERATED_RELEASE_LOCALE_MESSAGES_EN } from '../generated/localeRegistry.generated';
import { schemaShellMessagesEnglish } from '../generated/schemaMessages.generated';
import type { LocaleDefinition, LocaleStaticMessages } from '../localeDefinition';
import en from '../locales/en';
import type { Messages } from '../messages';
import {
  pseudoLocalizeMessages,
  pseudoLocalizeRecord,
  pseudoLocalizeStatic
} from '../pseudoLocalization';
import type { DynamicMessageTemplates } from './dynamicTemplates';

const ENGLISH_RUNTIME_MESSAGES = GENERATED_RELEASE_LOCALE_MESSAGES_EN as Messages;
const ENGLISH_SCHEMA_MESSAGES = schemaShellMessagesEnglish;
const ENGLISH_STATIC_MESSAGES = en.static;

export function buildPseudoRuntimeMessages(): Messages {
  return {
    ...pseudoLocalizeMessages(ENGLISH_RUNTIME_MESSAGES),
    ...pseudoLocalizeRecord(ENGLISH_SCHEMA_MESSAGES)
  };
}

export function buildPseudoStaticMessages(): LocaleStaticMessages {
  return pseudoLocalizeStatic(ENGLISH_STATIC_MESSAGES);
}

export function buildPseudoDynamicMessageTemplates(
  base: DynamicMessageTemplates
): DynamicMessageTemplates {
  return pseudoLocalizeRecord(base);
}

export function buildPseudoLocaleDefinition(): LocaleDefinition {
  return {
    runtime: buildPseudoRuntimeMessages(),
    static: buildPseudoStaticMessages()
  };
}
