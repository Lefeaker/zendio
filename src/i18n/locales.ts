import type { LangCode } from './config';
import type { LocaleDefinition, LocaleStaticMessages } from './localeDefinition';
import { defaultLocaleService } from './runtime/localeService';

export type Language = LangCode;

export type { Messages } from './messages';
export { DEFAULT_LANGUAGE, AVAILABLE_LANGUAGES } from './config';
export const DEFAULT_RUNTIME_MESSAGES = defaultLocaleService.defaultRuntimeMessages;
export const DEFAULT_STATIC_MESSAGES = defaultLocaleService.defaultStaticMessages;

export function getLocaleCodes(): Language[] {
  return defaultLocaleService.getLocaleCodes();
}

export function hasLocaleLoader(language: string): language is Language {
  return defaultLocaleService.hasLocaleLoader(language);
}

export function getCachedLocaleDefinition(language: Language): LocaleDefinition | null {
  return defaultLocaleService.getCachedLocaleDefinition(language);
}

export async function loadLocaleDefinition(language: Language): Promise<LocaleDefinition> {
  return defaultLocaleService.loadLocaleDefinition(language);
}

export async function loadLocaleMessages(language: Language) {
  return defaultLocaleService.loadLocaleMessages(language);
}

export async function loadStaticMessages(language: Language): Promise<LocaleStaticMessages> {
  return defaultLocaleService.loadStaticMessages(language);
}

export async function getStaticMessages(language: Language): Promise<LocaleStaticMessages> {
  return loadStaticMessages(language);
}

export async function loadMessagesWithFallback(language: string) {
  return defaultLocaleService.loadMessagesWithFallback(language);
}
