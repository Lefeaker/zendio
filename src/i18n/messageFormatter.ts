import IntlMessageFormat from 'intl-messageformat';
import { DEFAULT_LANGUAGE } from './config';

type FormatterCache = Map<string, IntlMessageFormat>;

type MessageValue = string | number | boolean | Date | null | undefined;
type MessageValues = Record<string, MessageValue>;

const formatterCache = new Map<string, FormatterCache>();

function normalizeLanguage(language?: string): string {
  if (!language) {
    return DEFAULT_LANGUAGE;
  }
  return language;
}

function getFormatter(language: string, template: string): IntlMessageFormat {
  const normalizedLanguage = normalizeLanguage(language);
  let languageCache = formatterCache.get(normalizedLanguage);
  if (!languageCache) {
    languageCache = new Map<string, IntlMessageFormat>();
    formatterCache.set(normalizedLanguage, languageCache);
  }

  let formatter = languageCache.get(template);
  if (!formatter) {
    formatter = new IntlMessageFormat(template, normalizedLanguage);
    languageCache.set(template, formatter);
  }
  return formatter;
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

interface FormatOptions {
  language?: string;
  values?: MessageValues;
}

export function formatWithICU(template: string, options: FormatOptions = {}): string {
  const { language, values } = options;
  const selectedValues: MessageValues = values ?? {};
  if (!template) {
    return '';
  }

  try {
    const formatter = getFormatter(language ?? DEFAULT_LANGUAGE, template);
    const result = formatter.format(selectedValues);
    if (typeof result === 'string') {
      return result;
    }
    return Array.isArray(result) ? result.join('') : String(result);
  } catch (error) {
    // 兼容：若 ICU 解析失败，退回原有的简单插值逻辑，避免因单个文案阻断流程
    return legacyInterpolate(template, selectedValues);
  }
}
