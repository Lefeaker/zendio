import { DEFAULT_RUNTIME_MESSAGES, formatMessage, type Messages } from '@i18n';
import { GENERATED_RELEASE_SCHEMA_MESSAGES_EN } from '@i18n/generated/schema/en.generated';

export type SchemaMessageKey = keyof Messages;

export type SchemaMessageValues = Record<string, string | number | boolean>;

export type SchemaTranslator = (
  key: SchemaMessageKey,
  fallback: string,
  values?: SchemaMessageValues
) => string;

export function getDefaultProductionEnglishMessage(
  key: SchemaMessageKey,
  values: SchemaMessageValues = {}
): string {
  const raw = DEFAULT_PRODUCTION_ENGLISH_MESSAGES[key];
  const template = typeof raw === 'string' && raw.length > 0 ? raw : key;
  return Object.keys(values).length > 0 ? formatMessage(template, values) : template;
}

export function resolveSchemaMessage(
  messages: Messages | null | undefined,
  key: SchemaMessageKey,
  values: SchemaMessageValues = {}
): string {
  const raw = messages?.[key];
  const template =
    typeof raw === 'string' && raw.length > 0 ? raw : getDefaultProductionEnglishMessage(key);
  return Object.keys(values).length > 0 ? formatMessage(template, values) : template;
}

export function translateSchemaMessage(
  translate: SchemaTranslator | undefined,
  key: SchemaMessageKey,
  values: SchemaMessageValues = {}
): string {
  const fallback = getDefaultProductionEnglishMessage(key, values);
  return translate?.(key, fallback, values) ?? fallback;
}

export function createSchemaTranslator(messages: Messages | null): SchemaTranslator {
  const resolvedMessages = messages ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES;
  return (key, fallback, values = {}) => {
    const raw = resolvedMessages[key];
    const template = typeof raw === 'string' && raw.length > 0 ? raw : fallback;
    return Object.keys(values).length > 0 ? formatMessage(template, values) : template;
  };
}

export const DEFAULT_PRODUCTION_ENGLISH_MESSAGES: Messages = {
  ...DEFAULT_RUNTIME_MESSAGES,
  ...GENERATED_RELEASE_SCHEMA_MESSAGES_EN
};
