import type { Messages, Language } from './locales';
import type { I18nResource } from './types';

export interface I18nResourceFactoryOptions {
  language: Language;
  messages: Messages;
  fallbackChain: Messages[];
}

export function createI18nResource(options: I18nResourceFactoryOptions): I18nResource {
  const { language, messages, fallbackChain } = options;
  return {
    language,
    messages,
    get(key) {
      const value = messages[key];
      if (value !== undefined && value !== null) {
        return value;
      }
      for (const fallback of fallbackChain) {
        const fallbackValue = fallback[key];
        if (fallbackValue !== undefined && fallbackValue !== null) {
          return fallbackValue;
        }
      }
      return messages[key];
    }
  };
}
