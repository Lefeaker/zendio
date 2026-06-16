import { isReleaseLanguage, type ReleaseLangCode } from './catalog/languages';
import type { GeneratedMessages as GeneratedRuntimeMessages } from './generated/messages.generated';
import type { GeneratedSchemaMessages } from './generated/schemaMessages.generated';
import { pseudoLocalizeRecord } from './pseudoLocalization';
import { getRuntimeLanguageFallbackChain } from './runtime/fallback';
import { defaultLocaleService } from './runtime/localeService';

export type RuntimeMessages = GeneratedRuntimeMessages;
export type SchemaMessages = GeneratedSchemaMessages;
export type Messages = RuntimeMessages & Partial<SchemaMessages>;

let pseudoSchemaMessages: SchemaMessages | null = null;
const schemaMessageCache = new Map<ReleaseLangCode, SchemaMessages>();

async function importSchemaMessages(code: ReleaseLangCode): Promise<GeneratedSchemaMessages> {
  switch (code) {
    case 'en':
      return (await import('./generated/schema/en.generated')).GENERATED_RELEASE_SCHEMA_MESSAGES_EN;
    case 'zh-CN':
      return (await import('./generated/schema/zh-CN.generated'))
        .GENERATED_RELEASE_SCHEMA_MESSAGES_ZH_CN;
    case 'ja':
      return (await import('./generated/schema/ja.generated')).GENERATED_RELEASE_SCHEMA_MESSAGES_JA;
    case 'de':
      return (await import('./generated/schema/de.generated')).GENERATED_RELEASE_SCHEMA_MESSAGES_DE;
    case 'fr':
      return (await import('./generated/schema/fr.generated')).GENERATED_RELEASE_SCHEMA_MESSAGES_FR;
    case 'es-ES':
      return (await import('./generated/schema/es-ES.generated'))
        .GENERATED_RELEASE_SCHEMA_MESSAGES_ES_ES;
    case 'es-419':
      return (await import('./generated/schema/es-419.generated'))
        .GENERATED_RELEASE_SCHEMA_MESSAGES_ES_419;
    case 'it':
      return (await import('./generated/schema/it.generated')).GENERATED_RELEASE_SCHEMA_MESSAGES_IT;
    case 'ko':
      return (await import('./generated/schema/ko.generated')).GENERATED_RELEASE_SCHEMA_MESSAGES_KO;
    case 'pt-BR':
      return (await import('./generated/schema/pt-BR.generated'))
        .GENERATED_RELEASE_SCHEMA_MESSAGES_PT_BR;
    case 'ru':
      return (await import('./generated/schema/ru.generated')).GENERATED_RELEASE_SCHEMA_MESSAGES_RU;
    case 'zh-TW':
      return (await import('./generated/schema/zh-TW.generated'))
        .GENERATED_RELEASE_SCHEMA_MESSAGES_ZH_TW;
  }
}

async function loadSchemaMessagesForReleaseLanguage(
  code: ReleaseLangCode
): Promise<SchemaMessages> {
  const cached = schemaMessageCache.get(code);
  if (cached) {
    return cached;
  }

  const messages = await importSchemaMessages(code);
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
      return loadSchemaMessagesForReleaseLanguage(code);
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
