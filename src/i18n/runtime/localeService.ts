import { DEFAULT_LANGUAGE, type LangCode } from '../config';
import type { LocaleDefinition, LocaleStaticMessages } from '../localeDefinition';
import type { Messages } from '../messages';
import en from '../locales/en';
import { getRuntimeLanguageFallbackChain } from './fallback';

export type LocaleLoader = () => Promise<LocaleDefinition>;
export type LocaleLoaderMap = Partial<Record<LangCode, LocaleLoader>>;

type LocaleCache = Partial<Record<LangCode, LocaleDefinition>>;

export interface LocaleService {
  readonly defaultLanguage: LangCode;
  readonly defaultRuntimeMessages: Messages;
  readonly defaultStaticMessages: LocaleStaticMessages;
  getLocaleCodes(): LangCode[];
  hasLocaleLoader(language: string): language is LangCode;
  getCachedLocaleDefinition(language: LangCode): LocaleDefinition | null;
  loadLocaleDefinition(language: LangCode): Promise<LocaleDefinition>;
  loadLocaleMessages(language: LangCode): Promise<Messages>;
  loadStaticMessages(language: LangCode): Promise<LocaleStaticMessages>;
  loadMessagesWithFallback(language: string): Promise<Messages>;
}

export interface LocaleServiceOptions {
  defaultLanguage?: LangCode;
  defaultDefinition: LocaleDefinition;
  loaders: LocaleLoaderMap;
  getLanguageFallbackChain?: (input?: string) => LangCode[];
}

export function createLocaleService(options: LocaleServiceOptions): LocaleService {
  const defaultLanguage = options.defaultLanguage ?? DEFAULT_LANGUAGE;
  const defaultDefinition = options.defaultDefinition;
  const defaultRuntimeMessages = defaultDefinition.runtime;
  const defaultStaticMessages = defaultDefinition.static;
  const loaders = options.loaders;
  const getLanguageFallbackChain =
    options.getLanguageFallbackChain ?? getRuntimeLanguageFallbackChain;
  const localeCache: LocaleCache = {
    [defaultLanguage]: defaultDefinition
  };
  const pendingLocaleLoads = new Map<LangCode, Promise<LocaleDefinition>>();

  const hasLocaleLoader = (language: string): language is LangCode =>
    Reflect.has(loaders, language);

  return {
    defaultLanguage,
    defaultRuntimeMessages,
    defaultStaticMessages,
    getLocaleCodes() {
      return Object.keys(loaders) as LangCode[];
    },
    hasLocaleLoader,
    getCachedLocaleDefinition(language) {
      return localeCache[language] ?? null;
    },
    async loadLocaleDefinition(language) {
      const cached = localeCache[language];
      if (cached) {
        return cached;
      }

      const loader = loaders[language];
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
    },
    async loadLocaleMessages(language) {
      const definition = await this.loadLocaleDefinition(language);
      return definition.runtime;
    },
    async loadStaticMessages(language) {
      const chain = getLanguageFallbackChain(language);
      for (const code of chain) {
        const definition = await this.loadLocaleDefinition(code);
        if (definition.static) {
          return definition.static;
        }
      }
      return defaultStaticMessages;
    },
    async loadMessagesWithFallback(language) {
      const chain = getLanguageFallbackChain(language);
      for (const code of chain) {
        if (!hasLocaleLoader(code)) {
          continue;
        }
        return this.loadLocaleMessages(code);
      }
      return defaultRuntimeMessages;
    }
  };
}

const localeLoaders: LocaleLoaderMap = {
  en: () => Promise.resolve(en),
  'zh-CN': async () => (await import('../locales/zh-CN')).default,
  ja: async () => (await import('../locales/ja')).default,
  de: async () => (await import('../locales/de')).default,
  fr: async () => (await import('../locales/fr')).default,
  'es-ES': async () => (await import('../locales/es-ES')).default,
  'es-419': async () => (await import('../locales/es-419')).default,
  it: async () => (await import('../locales/it')).default,
  ko: async () => (await import('../locales/ko')).default,
  'pt-BR': async () => (await import('../locales/pt-BR')).default,
  ru: async () => (await import('../locales/ru')).default,
  'zh-TW': async () => (await import('../locales/zh-TW')).default
};

if (process.env.NODE_ENV !== 'production') {
  localeLoaders['qps-ploc'] = async () => (await import('../locales/qps-ploc')).default;
}

export const defaultLocaleService = createLocaleService({
  defaultLanguage: DEFAULT_LANGUAGE,
  defaultDefinition: en,
  loaders: localeLoaders
});
