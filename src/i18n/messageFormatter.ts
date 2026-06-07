import IntlMessageFormat from 'intl-messageformat';
import { DEFAULT_LANGUAGE } from './config';

type MessageValue = string | number | boolean | Date | null | undefined;
type MessageValues = Record<string, MessageValue>;

interface FormatOptions {
  language?: string;
  values?: MessageValues;
}

const FORMATTER_CACHE_LIMIT = 64;
const formatterCache = new Map<string, IntlMessageFormat>();

function normalizeLanguage(language?: string): string {
  if (!language) {
    return DEFAULT_LANGUAGE;
  }
  return language;
}

function legacyInterpolate(template: string, values: MessageValues): string {
  const valueMap = new Map<string, MessageValue>(Object.entries(values));
  return template.replace(/\{(\w+)\}/g, (match: string, token: string) => {
    if (!valueMap.has(token)) {
      return match;
    }
    const value = valueMap.get(token);
    return value === undefined || value === null ? match : String(value);
  });
}

function getFormatterCacheKey(language: string, template: string): string {
  return `${language}\u0000${template}`;
}

function getCachedFormatter(template: string, language: string): IntlMessageFormat {
  const cacheKey = getFormatterCacheKey(language, template);
  const cached = formatterCache.get(cacheKey);

  if (cached) {
    formatterCache.delete(cacheKey);
    formatterCache.set(cacheKey, cached);
    return cached;
  }

  const formatter = new IntlMessageFormat(template, language);
  formatterCache.set(cacheKey, formatter);

  if (formatterCache.size > FORMATTER_CACHE_LIMIT) {
    const oldestKey = formatterCache.keys().next().value;
    if (oldestKey) {
      formatterCache.delete(oldestKey);
    }
  }

  return formatter;
}

function stringifyFormattedMessage(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => (entry == null ? '' : String(entry))).join('');
  }

  if (value == null) {
    return '';
  }
  return String(value);
}

export function getMessageFormatterCacheSize(): number {
  return formatterCache.size;
}

export function __resetMessageFormatterCacheForTests(): void {
  formatterCache.clear();
}

export function formatMessage(
  template: string,
  params: Record<string, MessageValue> = {},
  language?: string
): string {
  return formatWithICU(template, {
    values: params,
    ...(language !== undefined && { language })
  });
}

export function formatWithICU(template: string, options: FormatOptions = {}): string {
  const { language, values } = options;
  const selectedValues: MessageValues = values ?? {};
  if (!template) {
    return '';
  }

  try {
    const formatter = getCachedFormatter(template, normalizeLanguage(language));
    return stringifyFormattedMessage(formatter.format(selectedValues));
  } catch {
    // Preserve the historical public behavior for invalid ICU or missing placeholders.
    return legacyInterpolate(template, selectedValues);
  }
}
