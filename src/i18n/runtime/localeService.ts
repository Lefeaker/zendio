import { DEFAULT_LANGUAGE, type LangCode } from '../config';
import { buildPseudoLocaleDefinition } from '../catalog/pseudoLocale';
import type { LocaleDefinition, LocaleStaticMessages, RuntimeMessages } from '../localeDefinition';
import de from '../generated/locales/de.generated';
import en from '../generated/locales/en.generated';
import es419 from '../generated/locales/es-419.generated';
import esES from '../generated/locales/es-ES.generated';
import fr from '../generated/locales/fr.generated';
import it from '../generated/locales/it.generated';
import ja from '../generated/locales/ja.generated';
import ko from '../generated/locales/ko.generated';
import ptBR from '../generated/locales/pt-BR.generated';
import ru from '../generated/locales/ru.generated';
import zhCN from '../generated/locales/zh-CN.generated';
import zhTW from '../generated/locales/zh-TW.generated';
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
  'zh-CN': () => Promise.resolve(zhCN),
  ja: () => Promise.resolve(ja),
  de: () => Promise.resolve(de),
  fr: () => Promise.resolve(fr),
  'es-ES': () => Promise.resolve(esES),
  'es-419': () => Promise.resolve(es419),
  it: () => Promise.resolve(it),
  ko: () => Promise.resolve(ko),
  'pt-BR': () => Promise.resolve(ptBR),
  ru: () => Promise.resolve(ru),
  'zh-TW': () => Promise.resolve(zhTW)
};

if (process.env.NODE_ENV !== 'production') {
  localeLoaders['qps-ploc'] = () => Promise.resolve(buildPseudoLocaleDefinition());
}

export const defaultLocaleService = createLocaleService({
  defaultLanguage: DEFAULT_LANGUAGE,
  defaultDefinition: en,
  loaders: localeLoaders
});
