import { getLanguageFallbackChain } from './config';
import type { LangCode } from './config';
import type { LocaleDefinition, LocaleStaticMessages } from './localeDefinition';
import en from './locales/en';

export type Language = LangCode;

export type { Messages } from './messages';
export { DEFAULT_LANGUAGE, AVAILABLE_LANGUAGES } from './config';

type LocaleLoader = () => Promise<LocaleDefinition>;
type LocaleCache = Partial<Record<Language, LocaleDefinition>>;
type LocaleLoaderMap = Partial<Record<Language, LocaleLoader>>;

const localeLoaders: LocaleLoaderMap = {
  en: async () => en,
  'zh-CN': async () => (await import('./locales/zh-CN')).default,
  ja: async () => (await import('./locales/ja')).default,
  de: async () => (await import('./locales/de')).default,
  fr: async () => (await import('./locales/fr')).default,
  'es-ES': async () => (await import('./locales/es-ES')).default,
  'es-419': async () => (await import('./locales/es-419')).default,
  it: async () => (await import('./locales/it')).default,
  ko: async () => (await import('./locales/ko')).default,
  'pt-BR': async () => (await import('./locales/pt-BR')).default,
  ru: async () => (await import('./locales/ru')).default,
  'zh-TW': async () => (await import('./locales/zh-TW')).default
};

if (process.env.NODE_ENV !== 'production') {
  localeLoaders['qps-ploc'] = async () => (await import('./locales/qps-ploc')).default;
}

const localeCache: LocaleCache = {
  en
};

const pendingLocaleLoads = new Map<Language, Promise<LocaleDefinition>>();

export const DEFAULT_RUNTIME_MESSAGES = en.runtime;
export const DEFAULT_STATIC_MESSAGES = en.static;

export function getLocaleCodes(): Language[] {
  return Object.keys(localeLoaders) as Language[];
}

export function hasLocaleLoader(language: string): language is Language {
  return Reflect.has(localeLoaders, language);
}

export function getCachedLocaleDefinition(language: Language): LocaleDefinition | null {
  return localeCache[language] ?? null;
}

export async function loadLocaleDefinition(language: Language): Promise<LocaleDefinition> {
  const cached = localeCache[language];
  if (cached) {
    return cached;
  }

  const loader = localeLoaders[language];
  if (!loader) {
    throw new Error(`Locale loader not registered: ${language}`);
  }

  const pending = pendingLocaleLoads.get(language);
  if (pending) {
    return pending;
  }

  const loadPromise = loader()
    .then((definition) => {
      localeCache[language] = definition;
      pendingLocaleLoads.delete(language);
      return definition;
    })
    .catch((error) => {
      pendingLocaleLoads.delete(language);
      throw error;
    });

  pendingLocaleLoads.set(language, loadPromise);
  return loadPromise;
}

export async function loadLocaleMessages(language: Language) {
  const definition = await loadLocaleDefinition(language);
  return definition.runtime;
}

export async function loadStaticMessages(language: Language): Promise<LocaleStaticMessages> {
  const chain = getLanguageFallbackChain(language);
  for (const code of chain) {
    const definition = await loadLocaleDefinition(code);
    if (definition.static) {
      return definition.static;
    }
  }
  return DEFAULT_STATIC_MESSAGES;
}

export async function getStaticMessages(language: Language): Promise<LocaleStaticMessages> {
  return loadStaticMessages(language);
}

export async function loadMessagesWithFallback(language: string) {
  const chain = getLanguageFallbackChain(language);
  for (const code of chain) {
    if (!hasLocaleLoader(code)) {
      continue;
    }
    return loadLocaleMessages(code);
  }
  return DEFAULT_RUNTIME_MESSAGES;
}
