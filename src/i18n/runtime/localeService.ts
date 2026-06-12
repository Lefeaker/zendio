import { DEFAULT_LANGUAGE, type LangCode } from '../config';
import { buildPseudoLocaleDefinition } from '../catalog/pseudoLocale';
import type { LocaleDefinition, LocaleStaticMessages } from '../localeDefinition';
import type { RuntimeMessages } from '../messages';
import en from '../generated/locales/en.generated';
import { getRuntimeLanguageFallbackChain } from './fallback';

export type LocaleLoader = () => Promise<LocaleDefinition>;
export type LocaleLoaderMap = Partial<Record<LangCode, LocaleLoader>>;

type LocaleCache = Partial<Record<LangCode, LocaleDefinition>>;

export interface LocaleService {
  readonly defaultLanguage: LangCode;
  readonly defaultRuntimeMessages: RuntimeMessages;
  readonly defaultStaticMessages: LocaleStaticMessages;
  getLocaleCodes(): LangCode[];
  hasLocaleLoader(language: string): language is LangCode;
  getCachedLocaleDefinition(language: LangCode): LocaleDefinition | null;
  loadLocaleDefinition(language: LangCode): Promise<LocaleDefinition>;
  loadLocaleMessages(language: LangCode): Promise<RuntimeMessages>;
  loadStaticMessages(language: LangCode): Promise<LocaleStaticMessages>;
  loadMessagesWithFallback(language: string): Promise<RuntimeMessages>;
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
  'zh-CN': async () => (await import('../generated/locales/zh-CN.generated')).default,
  ja: async () => (await import('../generated/locales/ja.generated')).default,
  de: async () => (await import('../generated/locales/de.generated')).default,
  fr: async () => (await import('../generated/locales/fr.generated')).default,
  'es-ES': async () => (await import('../generated/locales/es-ES.generated')).default,
  'es-419': async () => (await import('../generated/locales/es-419.generated')).default,
  it: async () => (await import('../generated/locales/it.generated')).default,
  ko: async () => (await import('../generated/locales/ko.generated')).default,
  'pt-BR': async () => (await import('../generated/locales/pt-BR.generated')).default,
  ru: async () => (await import('../generated/locales/ru.generated')).default,
  'zh-TW': async () => (await import('../generated/locales/zh-TW.generated')).default
};

if (process.env.NODE_ENV !== 'production') {
  localeLoaders['qps-ploc'] = () => Promise.resolve(buildPseudoLocaleDefinition());
}

export const defaultLocaleService = createLocaleService({
  defaultLanguage: DEFAULT_LANGUAGE,
  defaultDefinition: en,
  loaders: localeLoaders
});
