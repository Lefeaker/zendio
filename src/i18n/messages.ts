import { isReleaseLanguage, type ReleaseLangCode } from './catalog/languages';
import type { GeneratedMessages as GeneratedRuntimeMessages } from './generated/messages.generated';
import type { GeneratedSchemaMessages } from './generated/schemaMessages.generated';
import { pseudoLocalizeRecord } from './pseudoLocalization';
import { loadSchemaMessagesAsset } from './runtime/assets';
import { getRuntimeLanguageFallbackChain } from './runtime/fallback';
import { defaultLocaleService } from './runtime/localeService';

export type RuntimeMessages = GeneratedRuntimeMessages;
export type SchemaMessages = GeneratedSchemaMessages;
export type Messages = RuntimeMessages & Partial<SchemaMessages>;

let pseudoSchemaMessages: SchemaMessages | null = null;
const schemaMessageCache = new Map<ReleaseLangCode, SchemaMessages>();

async function loadSchemaMessagesForReleaseLanguage(
  code: ReleaseLangCode
): Promise<SchemaMessages> {
  const cached = schemaMessageCache.get(code);
  if (cached) {
    return cached;
  }

  const messages: GeneratedSchemaMessages = await loadSchemaMessagesAsset(code);
  schemaMessageCache.set(code, messages);
  return messages;
}

async function getPseudoSchemaMessages(): Promise<SchemaMessages> {
  pseudoSchemaMessages ??= pseudoLocalizeRecord(await loadSchemaMessagesForReleaseLanguage('en'));
  return pseudoSchemaMessages;
}

async function resolveSchemaMessages(language: string): Promise<SchemaMessages> {
  const fallbackChain = getRuntimeLanguageFallbackChain(language);

  for (const code of fallbackChain) {
    if (process.env.NODE_ENV !== 'production' && code === 'qps-ploc') {
      return getPseudoSchemaMessages();
    }
    if (isReleaseLanguage(code)) {
      try {
        return await loadSchemaMessagesForReleaseLanguage(code);
      } catch {
        continue;
      }
    }
  }

  return loadSchemaMessagesForReleaseLanguage('en');
}

export async function getMessagesForLanguage(language: string): Promise<Messages> {
  const [runtimeMessages, schemaMessages] = await Promise.all([
    defaultLocaleService.loadMessagesWithFallback(language),
    resolveSchemaMessages(language)
  ]);
  return {
    ...runtimeMessages,
    ...schemaMessages
  };
}
