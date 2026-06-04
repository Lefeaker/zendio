import { createDomBindingAdapter } from '../adapters/domBindingAdapter';
import { DEFAULT_LANGUAGE, LANGUAGE_CONFIG, type LangCode } from '../config';
import type { LocaleDefinition } from '../localeDefinition';
import type { Messages } from '../messages';
import { createPageI18nController, type PageI18nController } from '../pageController';
import type { I18nBindingAdapter } from '../types';
import { getRuntimeLanguageFallbackChain } from './fallback';

export interface RuntimeDocumentLike {
  documentElement: {
    setAttribute(name: string, value: string): void;
  };
}

export interface PageRuntimeOptions {
  defaultLanguage?: LangCode;
  loadLocaleDefinition(language: LangCode): Promise<LocaleDefinition>;
  defaultRuntimeMessages: Messages;
  getMessagesForLanguage(language: string): Promise<Messages>;
  getCurrentLanguage(): Promise<LangCode>;
  setCurrentLanguage(language: LangCode): Promise<void>;
  getLanguageFallbackChain?: (input?: string) => LangCode[];
  getDocument?: () => RuntimeDocumentLike | null | undefined;
  createBindingAdapter?: () => I18nBindingAdapter;
  createPageController?: typeof createPageI18nController;
}

export interface PageRuntimeControllerOptions {
  bindingAdapter?: I18nBindingAdapter;
}

export interface PageRuntime {
  loadLocale(language?: string): Promise<Messages>;
  createDefaultPageI18nController(options?: PageRuntimeControllerOptions): PageI18nController;
}

export function createPageRuntime(options: PageRuntimeOptions): PageRuntime {
  const defaultLanguage = options.defaultLanguage ?? DEFAULT_LANGUAGE;
  const getLanguageFallbackChain =
    options.getLanguageFallbackChain ?? getRuntimeLanguageFallbackChain;
  const getDocument =
    options.getDocument ?? (() => (typeof document === 'undefined' ? undefined : document));
  const createBindingAdapter = options.createBindingAdapter ?? createDomBindingAdapter;
  const createPageController = options.createPageController ?? createPageI18nController;

  return {
    async loadLocale(language) {
      const chain = getLanguageFallbackChain(language);
      const resolved = chain[0] ?? defaultLanguage;
      const documentLike = getDocument();

      if (documentLike) {
        const dir = (LANGUAGE_CONFIG[resolved] ?? LANGUAGE_CONFIG[defaultLanguage])?.dir ?? 'ltr';
        documentLike.documentElement.setAttribute('lang', resolved);
        documentLike.documentElement.setAttribute('dir', dir);
      }

      return options
        .loadLocaleDefinition(resolved)
        .then((locale) => locale.runtime)
        .catch(() => options.defaultRuntimeMessages);
    },
    createDefaultPageI18nController(runtimeOptions = {}) {
      const bindingAdapter = runtimeOptions.bindingAdapter ?? createBindingAdapter();
      return createPageController({
        bindingAdapter,
        defaultLanguage,
        loadMessages: (language) => options.getMessagesForLanguage(language),
        getCurrentLanguage: options.getCurrentLanguage,
        setCurrentLanguage: options.setCurrentLanguage
      });
    }
  };
}
