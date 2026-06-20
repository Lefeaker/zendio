import { isReleaseLanguage, type ReleaseLangCode } from './catalog/languages';
import type { GeneratedMessages as GeneratedRuntimeMessages } from './generated/messages.generated';
import {
  GENERATED_RELEASE_SCHEMA_MESSAGES,
  type GeneratedSchemaMessages
} from './generated/schemaMessages.generated';
import { pseudoLocalizeRecord } from './pseudoLocalization';
import { getRuntimeLanguageFallbackChain } from './runtime/fallback';
import { defaultLocaleService } from './runtime/localeService';

export type RuntimeMessages = GeneratedRuntimeMessages;
export type SchemaMessages = GeneratedSchemaMessages;
export type Messages = RuntimeMessages & Partial<SchemaMessages>;

let pseudoSchemaMessages: SchemaMessages | null = null;
const schemaMessageCache = new Map<ReleaseLangCode, SchemaMessages>();

function importSchemaMessages(code: ReleaseLangCode): GeneratedSchemaMessages {
  return GENERATED_RELEASE_SCHEMA_MESSAGES[code];
}

function loadSchemaMessagesForReleaseLanguage(code: ReleaseLangCode): SchemaMessages {
  const cached = schemaMessageCache.get(code);
  if (cached) {
    return cached;
  }

  const messages = importSchemaMessages(code);
  schemaMessageCache.set(code, messages);
  return messages;
}

function getPseudoSchemaMessages(): SchemaMessages {
  pseudoSchemaMessages ??= pseudoLocalizeRecord(loadSchemaMessagesForReleaseLanguage('en'));
  return pseudoSchemaMessages;
}

function resolveSchemaMessages(language: string): SchemaMessages {
  const fallbackChain = getRuntimeLanguageFallbackChain(language);

  for (const code of fallbackChain) {
    if (process.env.NODE_ENV !== 'production' && code === 'qps-ploc') {
      return getPseudoSchemaMessages();
    }
    if (isReleaseLanguage(code)) {
      return loadSchemaMessagesForReleaseLanguage(code);
    }
  }

  return loadSchemaMessagesForReleaseLanguage('en');
}

export async function getMessagesForLanguage(language: string): Promise<Messages> {
  const runtimeMessages = await defaultLocaleService.loadMessagesWithFallback(language);
  const schemaMessages = resolveSchemaMessages(language);
  return {
    ...runtimeMessages,
    ...schemaMessages
  };
}
