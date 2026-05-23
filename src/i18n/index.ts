import type { StorageAreaService } from '../platform/interfaces/storage';
import {
  AVAILABLE_LANGUAGES,
  DEFAULT_LANGUAGE,
  DEFAULT_RUNTIME_MESSAGES,
  Language,
  loadLocaleDefinition,
  loadMessagesWithFallback,
  Messages
} from './locales';
import { LANGUAGE_CONFIG, resolveLanguage, getLanguageFallbackChain } from './config';
import { createDomBindingAdapter } from './adapters/domBindingAdapter';
import { createPageI18nController, type PageI18nController } from './pageController';
import type { I18nBindingAdapter } from './types';
import { errorHandler, i18nErrors } from '../shared/errors';
import { formatWithICU } from './messageFormatter';

export { createPageI18nController } from './pageController';
export type { PageI18nController } from './pageController';
export type { I18nBinder, I18nBindingAdapter, I18nBindingHandle, I18nResource } from './types';
export type { Messages, Language } from './locales';
export { DEFAULT_LANGUAGE };
export { resolveLanguage } from './config';

/**
 * Get the current language from storage
 */
const LANGUAGE_STORAGE_KEY = 'language';
let languageStorage: StorageAreaService | null = null;

export function configureI18nStorage(storage: StorageAreaService | null): void {
  languageStorage = storage;
}

function resolveFromNavigator(): Language {
  if (typeof navigator === 'undefined') {
    return DEFAULT_LANGUAGE;
  }
  return resolveLanguage(navigator.language);
}

export async function getCurrentLanguage(): Promise<Language> {
  if (!languageStorage) {
    return resolveFromNavigator();
  }

  try {
    const value = await languageStorage.get<string>(LANGUAGE_STORAGE_KEY);
    if (value) {
      return resolveLanguage(value);
    }
    return resolveFromNavigator();
  } catch (cause) {
    await errorHandler.handle(
      i18nErrors.languageLoadFailed(cause, { storageKey: LANGUAGE_STORAGE_KEY }),
      { suppressNotifications: false }
    );
    return resolveFromNavigator();
  }
}

/**
 * Set the current language
 */
export async function setCurrentLanguage(language: Language): Promise<void> {
  if (!languageStorage) {
    return;
  }

  try {
    await languageStorage.set(LANGUAGE_STORAGE_KEY, resolveLanguage(language));
  } catch (cause) {
    await errorHandler.handle(
      i18nErrors.languagePersistFailed(language, cause, { storageKey: LANGUAGE_STORAGE_KEY }),
      { suppressNotifications: false }
    );
  }
}

/**
 * Get messages for the current language
 */
export async function getMessages(): Promise<Messages> {
  const language = await getCurrentLanguage();
  return getMessagesForLanguage(language);
}

/**
 * Get a specific message by key
 */
export async function getMessage(key: keyof Messages): Promise<string> {
  const msgs = await getMessages();
  return msgs[key] ?? '';
}

/**
 * Get messages by language code with fallback to default language.
 */
export async function getMessagesForLanguage(language: string): Promise<Messages> {
  return loadMessagesWithFallback(language);
}

/**
 * Get all available languages
 */
export function getAvailableLanguages(): Array<{
  code: Language;
  name: string;
  nativeName: string;
  englishName: string;
  region: string;
  dir: 'ltr' | 'rtl';
  textExpansion: number;
}> {
  return AVAILABLE_LANGUAGES.map(
    ({ code, name, nativeName, englishName, region, dir, textExpansion }) => ({
      code,
      name,
      nativeName,
      englishName,
      region,
      dir,
      textExpansion
    })
  );
}

/**
 * Load locale module and update document metadata.
 */
export function loadLocale(language?: string): Promise<Messages> {
  const chain = getLanguageFallbackChain(language);
  const resolved = chain[0] ?? DEFAULT_LANGUAGE;

  if (typeof document !== 'undefined') {
    const dir = (LANGUAGE_CONFIG[resolved] ?? LANGUAGE_CONFIG[DEFAULT_LANGUAGE])?.dir ?? 'ltr';
    document.documentElement.setAttribute('lang', resolved);
    document.documentElement.setAttribute('dir', dir);
  }

  return loadLocaleDefinition(resolved)
    .then((locale) => locale.runtime)
    .catch(() => DEFAULT_RUNTIME_MESSAGES);
}

/**
 * Format a message with placeholders
 * Example: formatMessage("Hello {name}!", { name: "World" }) => "Hello World!"
 */
export function formatMessage(
  template: string,
  params: Record<string, string | number | boolean | Date | null | undefined> = {},
  language?: string
): string {
  return formatWithICU(template, {
    values: params,
    ...(language !== undefined && { language })
  });
}

export interface PageI18nControllerOptions {
  bindingAdapter?: I18nBindingAdapter;
}

export function createDefaultPageI18nController(
  options: PageI18nControllerOptions = {}
): PageI18nController {
  const bindingAdapter = options.bindingAdapter ?? createDomBindingAdapter();
  return createPageI18nController({
    bindingAdapter,
    defaultLanguage: DEFAULT_LANGUAGE,
    loadMessages: (language) => getMessagesForLanguage(language),
    getCurrentLanguage,
    setCurrentLanguage
  });
}
