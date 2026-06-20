import type { StorageAreaService } from '../platform/interfaces/storage';
import type { RuntimeLanguageProvider } from '../platform/interfaces/runtime';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_RUNTIME_MESSAGES,
  Language,
  loadLocaleDefinition,
  loadMessagesWithFallback,
  Messages
} from './locales';
import { AVAILABLE_LANGUAGES } from './config';
import type { PageI18nController } from './pageController';
import type { I18nBindingAdapter } from './types';
import { errorHandler, i18nErrors } from '../shared/errors';
import { createLanguageService, LANGUAGE_STORAGE_KEY } from './runtime/languageService';
import { createPageRuntime } from './runtime/pageRuntime';
import { createStorageAdapter } from './runtime/storageAdapter';
import { getMessagesForLanguage as loadPageMessagesForLanguage } from './messages';

export { createPageI18nController } from './pageController';
export type { PageI18nController } from './pageController';
export type { I18nBinder, I18nBindingAdapter, I18nBindingHandle, I18nResource } from './types';
export type { Messages, Language } from './locales';
export { DEFAULT_LANGUAGE, DEFAULT_RUNTIME_MESSAGES };
export { resolveLanguage } from './config';
export { formatMessage } from './messageFormatter';
export { formatUserVisibleMessage } from './userVisibleMessageFormatter';

let languageStorage: StorageAreaService | null = null;
let runtimeLanguageProvider: RuntimeLanguageProvider | null = null;

function isExtensionI18nPage(): boolean {
  const protocol =
    typeof window !== 'undefined' && typeof window.location?.protocol === 'string'
      ? window.location.protocol
      : '';
  return protocol === 'chrome-extension:' || protocol === 'moz-extension:';
}

export async function getMessagesForLanguage(language: string): Promise<Messages> {
  return loadPageMessagesForLanguage(language);
}

export function configureI18nStorage(storage: StorageAreaService | null): void {
  languageStorage = storage;
}

export function configureI18nRuntimeLanguageProvider(
  provider: RuntimeLanguageProvider | null
): void {
  runtimeLanguageProvider = provider;
}

function getRuntimeLanguage(): string | undefined {
  return runtimeLanguageProvider?.();
}

function getRuntimeLanguageService() {
  return createLanguageService({
    storage: languageStorage ? createStorageAdapter(languageStorage) : null,
    getNavigator: () => (typeof navigator === 'undefined' ? undefined : navigator),
    getChromeI18nLanguage: getRuntimeLanguage,
    onReadError: async (cause) => {
      await errorHandler.handle(
        i18nErrors.languageLoadFailed(cause, { storageKey: LANGUAGE_STORAGE_KEY }),
        { suppressNotifications: false }
      );
    },
    onWriteError: async (language, cause) => {
      await errorHandler.handle(
        i18nErrors.languagePersistFailed(language, cause, { storageKey: LANGUAGE_STORAGE_KEY }),
        { suppressNotifications: false }
      );
    }
  });
}

export async function getCurrentLanguage(): Promise<Language> {
  return getRuntimeLanguageService().getCurrentLanguage();
}

/**
 * Set the current language
 */
export async function setCurrentLanguage(language: Language): Promise<void> {
  await getRuntimeLanguageService().setCurrentLanguage(language);
}

/**
 * Get messages for the current language
 */
export async function getMessages(): Promise<Messages> {
  const language = await getCurrentLanguage();
  return loadMessagesWithFallback(language);
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
let pageRuntime: ReturnType<typeof createPageRuntime> | null = null;

function getPageRuntime(): ReturnType<typeof createPageRuntime> {
  if (!pageRuntime) {
    pageRuntime = createPageRuntime({
      loadLocaleDefinition,
      defaultRuntimeMessages: DEFAULT_RUNTIME_MESSAGES,
      getMessagesForLanguage: (language) =>
        isExtensionI18nPage()
          ? getMessagesForLanguage(language)
          : loadMessagesWithFallback(language),
      getCurrentLanguage: () => getCurrentLanguage(),
      setCurrentLanguage: (language) => setCurrentLanguage(language)
    });
  }

  return pageRuntime;
}

export function loadLocale(language?: string): Promise<Messages> {
  return getPageRuntime().loadLocale(language);
}

export interface PageI18nControllerOptions {
  bindingAdapter?: I18nBindingAdapter;
}

export function createDefaultPageI18nController(
  options: PageI18nControllerOptions = {}
): PageI18nController {
  return getPageRuntime().createDefaultPageI18nController(options);
}
