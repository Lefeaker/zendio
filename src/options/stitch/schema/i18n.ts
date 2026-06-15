import { DEFAULT_RUNTIME_MESSAGES, formatMessage, type Messages } from '@i18n';
import { schemaShellMessagesEnglish } from '@i18n/generated/schemaMessages.generated';

export type SchemaMessageKey = keyof Messages;

export type SchemaMessageValues = Record<string, string | number | boolean>;

export type SchemaTranslator = (
  key: SchemaMessageKey,
  fallback: string,
  values?: SchemaMessageValues
) => string;

export function createSchemaTranslator(messages: Messages | null): SchemaTranslator {
  return (key, fallback, values = {}) => {
    const raw = messages?.[key];
    const template = typeof raw === 'string' && raw.length > 0 ? raw : fallback;
    return Object.keys(values).length > 0 ? formatMessage(template, values) : template;
  };
}

export const DEFAULT_PRODUCTION_ENGLISH_MESSAGES: Messages = {
  ...DEFAULT_RUNTIME_MESSAGES,
  ...schemaShellMessagesEnglish
};
