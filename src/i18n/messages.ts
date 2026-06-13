import { isReleaseLanguage } from './catalog/languages';
import type { GeneratedMessages as GeneratedRuntimeMessages } from './generated/messages.generated';
import {
  GENERATED_RELEASE_SCHEMA_MESSAGES,
  GENERATED_RELEASE_SCHEMA_MESSAGES_EN,
  type GeneratedSchemaMessages
} from './generated/schemaMessages.generated';
import { pseudoLocalizeRecord } from './pseudoLocalization';
import { getRuntimeLanguageFallbackChain } from './runtime/fallback';
import { defaultLocaleService } from './runtime/localeService';

export type RuntimeMessages = GeneratedRuntimeMessages;
export type SchemaMessages = GeneratedSchemaMessages;
export type Messages = RuntimeMessages & Partial<SchemaMessages>;

let pseudoSchemaMessages: SchemaMessages | null = null;

function getPseudoSchemaMessages(): SchemaMessages {
  pseudoSchemaMessages ??= pseudoLocalizeRecord(GENERATED_RELEASE_SCHEMA_MESSAGES_EN);
  return pseudoSchemaMessages;
}

function resolveSchemaMessages(language: string): SchemaMessages {
  const fallbackChain = getRuntimeLanguageFallbackChain(language);

  for (const code of fallbackChain) {
    if (process.env.NODE_ENV !== 'production' && code === 'qps-ploc') {
      return getPseudoSchemaMessages();
    }
    if (isReleaseLanguage(code)) {
      return GENERATED_RELEASE_SCHEMA_MESSAGES[code];
    }
  }

  return GENERATED_RELEASE_SCHEMA_MESSAGES_EN;
}

export async function getMessagesForLanguage(language: string): Promise<Messages> {
  const runtimeMessages = await defaultLocaleService.loadMessagesWithFallback(language);
  return {
    ...runtimeMessages,
    ...resolveSchemaMessages(language)
  };
}
