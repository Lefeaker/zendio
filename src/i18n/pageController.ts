import type { Language, Messages } from './locales';
import { DEFAULT_RUNTIME_MESSAGES } from './locales';
import { getLanguageFallbackChain } from './config';
import { createI18nResource } from './resource';
import type { I18nBinder, I18nBindingAdapter, I18nBindingHandle, I18nResource } from './types';
import { updateDynamicMessages } from './dynamicMessages';

export interface PageI18nControllerDependencies {
  bindingAdapter: I18nBindingAdapter;
  defaultLanguage: Language;
  loadMessages(language: Language): Promise<Messages>;
  getCurrentLanguage(): Promise<Language>;
  setCurrentLanguage?(language: Language): Promise<void>;
}

export interface PageI18nController {
  load(languageOverride?: Language): Promise<void>;
  mount(root: ParentNode): void;
  registerDynamic(registrar: (binder: I18nBinder) => void): void;
  changeLanguage(language: Language): Promise<void>;
  dispose(): void;
  getCurrentResource(): I18nResource | null;
  getBinder(): I18nBinder;
}

function createBinder(bindingAdapter: I18nBindingAdapter): I18nBinder {
  return {
    bindText(element, key) {
      return bindingAdapter.bindText(element, key);
    },
    bindAttr(element, attribute, key) {
      return bindingAdapter.bindAttribute(element, attribute, key);
    },
    bindHtml(element, key) {
      return bindingAdapter.bindHtml(element, key);
    }
  };
}

function ensureResource(resource: I18nResource | null): asserts resource is I18nResource {
  if (!resource) {
    throw new Error(
      '[i18n] PageI18nController: resource not loaded. Call load() before mount/register.'
    );
  }
}

const defaultMessages = DEFAULT_RUNTIME_MESSAGES;

function isMessageKey(value: string | null): value is keyof Messages {
  return typeof value === 'string' && value in defaultMessages;
}

function scanStaticBindings(root: ParentNode, binder: I18nBinder): Array<I18nBindingHandle> {
  const handles: Array<I18nBindingHandle> = [];

  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (isMessageKey(key)) {
      handles.push(binder.bindText(element, key));
    }
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((element) => {
    const key = element.getAttribute('data-i18n-html');
    if (isMessageKey(key)) {
      handles.push(binder.bindHtml(element, key));
    }
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((element) => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (isMessageKey(key)) {
      handles.push(binder.bindAttr(element, 'placeholder', key));
    }
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    const key = element.getAttribute('data-i18n-title');
    if (isMessageKey(key)) {
      handles.push(binder.bindAttr(element, 'title', key));
    }
  });

  return handles;
}

export function createPageI18nController(deps: PageI18nControllerDependencies): PageI18nController {
  const { bindingAdapter, defaultLanguage } = deps;
  const loadMessages = (language: Language) => deps.loadMessages(language);
  const readCurrentLanguage = () => deps.getCurrentLanguage();
  const persistLanguage = deps.setCurrentLanguage
    ? (language: Language) => deps.setCurrentLanguage?.(language)
    : undefined;

  const binder = createBinder(bindingAdapter);
  let currentResource: I18nResource | null = null;
  let staticHandles: Array<I18nBindingHandle> = [];

  const refreshBindings = (): void => {
    if (currentResource) {
      bindingAdapter.refresh(currentResource);
    }
  };

  const loadResource = async (language: Language): Promise<Language> => {
    const chain = getLanguageFallbackChain(language);
    const resolvedLanguage = chain[0] ?? defaultLanguage;
    const resolvedMessages = await loadMessages(resolvedLanguage);
    const fallbackChain: Messages[] = [];

    for (const code of chain) {
      if (code === resolvedLanguage) {
        continue;
      }
      const fallbackMessages = await loadMessages(code);
      if (!fallbackChain.includes(fallbackMessages)) {
        fallbackChain.push(fallbackMessages);
      }
    }

    const defaultMessages = await loadMessages(defaultLanguage);
    if (!fallbackChain.includes(defaultMessages)) {
      fallbackChain.push(defaultMessages);
    }

    const resource = createI18nResource({
      language: resolvedLanguage,
      messages: resolvedMessages,
      fallbackChain
    });
    currentResource = resource;
    refreshBindings();
    return resolvedLanguage;
  };

  return {
    async load(languageOverride) {
      const language = languageOverride ?? (await readCurrentLanguage());
      await loadResource(language);
    },
    mount(root) {
      ensureResource(currentResource);
      if (staticHandles.length > 0) {
        staticHandles.forEach((handle) => handle.dispose());
        staticHandles = [];
      }
      staticHandles = scanStaticBindings(root, binder);
      refreshBindings();
      // Update dynamic messages after static bindings
      updateDynamicMessages(currentResource.language);
    },
    registerDynamic(registrar) {
      ensureResource(currentResource);
      registrar(binder);
      refreshBindings();
    },
    async changeLanguage(language) {
      ensureResource(currentResource);
      if (language === currentResource.language) {
        return;
      }
      const resolvedLanguage = await loadResource(language);
      if (persistLanguage) {
        await persistLanguage(resolvedLanguage);
      }
      // Update dynamic messages after language change
      updateDynamicMessages(resolvedLanguage);
    },
    dispose() {
      staticHandles.forEach((handle) => handle.dispose());
      staticHandles = [];
      bindingAdapter.clear();
      currentResource = null;
    },
    getCurrentResource() {
      return currentResource;
    },
    getBinder() {
      return binder;
    }
  };
}
