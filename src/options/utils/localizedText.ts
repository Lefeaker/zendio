import type { I18nBinder, I18nBindingHandle, Messages } from '../../i18n';
import {
  getOptionsI18nBinder,
  getOptionsI18nResource,
  getOptionsMessages
} from '../app/i18nContext';

export interface LocalizedContent {
  key: keyof Messages;
  fallback?: string;
  text?: string;
}

type LocalizableContent = string | LocalizedContent;

interface BindingInternals {
  handle: I18nBindingHandle | null;
  dispose(): void;
}

export interface BoundElement<T extends HTMLElement> {
  element: T;
  dispose(): void;
}

export function bindLocalizedText<T extends HTMLElement>(
  element: T,
  content: LocalizableContent,
  binder?: I18nBinder | null
): BoundElement<T> {
  const previousDataset = element.dataset.i18n;
  const hadDataset = 'i18n' in element.dataset;
  const resolvedBinder = binder ?? getOptionsI18nBinder();
  let pending: { cancel(): void } | null = null;

  const internals = applyLocalizedContent(element, content, {
    applyValue(value) {
      element.textContent = value;
    },
    applyLocalizedValue(key) {
      element.dataset.i18n = key;
    },
    clearLocalizationMetadata() {
      if (hadDataset) {
        if (previousDataset !== undefined) {
          element.dataset.i18n = previousDataset;
        } else {
          delete element.dataset.i18n;
        }
      } else if (element.dataset.i18n) {
        delete element.dataset.i18n;
      }
    },
    createBinding(key) {
      return resolvedBinder ? resolvedBinder.bindText(element, key) : null;
    },
    onAsyncUpdate(handler) {
      pending = handler;
    },
    logLabel: 'bindLocalizedText'
  });

  return {
    element,
    dispose() {
      internals.dispose();
      if (pending) {
        pending.cancel();
        pending = null;
      }
    }
  };
}

export function bindLocalizedAttr<T extends HTMLElement>(
  element: T,
  attribute: string,
  content: LocalizableContent,
  binder?: I18nBinder | null
): BoundElement<T> {
  const hadAttribute = element.hasAttribute(attribute);
  const previousAttribute = element.getAttribute(attribute);
  const hasProperty = attribute in element;
  const elementWithProp = element as Record<string, unknown>;
  const previousPropertyValue = hasProperty ? elementWithProp[attribute] : undefined;
  const resolvedBinder = binder ?? getOptionsI18nBinder();
  let pending: { cancel(): void } | null = null;

  const internals = applyLocalizedContent(element, content, {
    applyValue(value) {
      element.setAttribute(attribute, value);
      if (hasProperty) {
        elementWithProp[attribute] = value;
      }
    },
    clearLocalizationMetadata() {
      if (hadAttribute) {
        if (previousAttribute !== null) {
          element.setAttribute(attribute, previousAttribute);
          if (hasProperty) {
            elementWithProp[attribute] = previousPropertyValue;
          }
        } else {
          element.removeAttribute(attribute);
          if (hasProperty) {
            elementWithProp[attribute] = previousPropertyValue;
          }
        }
      } else {
        element.removeAttribute(attribute);
        if (hasProperty) {
          elementWithProp[attribute] = previousPropertyValue;
        }
      }
    },
    createBinding(key) {
      return resolvedBinder ? resolvedBinder.bindAttr(element, attribute, key) : null;
    },
    onAsyncUpdate(handler) {
      pending = handler;
    },
    logLabel: `bindLocalizedAttr(${attribute})`
  });

  return {
    element,
    dispose() {
      internals.dispose();
      if (pending) {
        pending.cancel();
        pending = null;
      }
    }
  };
}

export function unbindLocalizedContent(
  binding: BoundElement<HTMLElement> | null | undefined
): void {
  binding?.dispose();
}

function applyLocalizedContent<T extends HTMLElement>(
  element: T,
  content: LocalizableContent,
  hooks: {
    applyValue(value: string): void;
    applyLocalizedValue?(key: string): void;
    clearLocalizationMetadata(): void;
    createBinding(key: keyof Messages): I18nBindingHandle | null;
    onAsyncUpdate?(handler: { cancel(): void }): void;
    logLabel: string;
  }
): BindingInternals {
  let handle: I18nBindingHandle | null = null;
  let disposed = false;

  const cancelAsync = hooks.onAsyncUpdate
    ? (update: Promise<void>): void => {
        let cancelled = false;
        if (hooks.onAsyncUpdate) {
          hooks.onAsyncUpdate({
            cancel() {
              cancelled = true;
            }
          });
        }

        void update.catch((error) => {
          if (!cancelled) {
            console.warn(`[${hooks.logLabel}] Failed to resolve localized content:`, error);
          }
        });
      }
    : null;

  const setValue = (value: string) => {
    hooks.applyValue(value);
  };

  if (isLocalizedContent(content)) {
    const { key, fallback, text } = content;
    const initial = text ?? fallback ?? key;
    setValue(initial);
    hooks.applyLocalizedValue?.(key);

    const bindHandle = hooks.createBinding(key);
    if (bindHandle) {
      handle = bindHandle;
      return {
        handle,
        dispose: () => {
          if (disposed) {
            return;
          }
          disposed = true;
          if (handle) {
            handle.dispose();
            handle = null;
          }
          hooks.clearLocalizationMetadata();
        }
      };
    }

    const resource = getOptionsI18nResource();
    if (resource) {
      setValue(resource.messages[key] ?? initial);
      return {
        handle: null,
        dispose: () => {
          if (disposed) {
            return;
          }
          disposed = true;
          hooks.clearLocalizationMetadata();
        }
      };
    }

    if (!text) {
      const update = getOptionsMessages().then((msgs) => {
        if (disposed) {
          return;
        }
        if (hooks.applyLocalizedValue && element.dataset.i18n !== key) {
          return;
        }
        setValue(msgs[key] ?? initial);
      });
      if (cancelAsync) {
        cancelAsync(update);
      }
    }

    return {
      handle: null,
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        hooks.clearLocalizationMetadata();
      }
    };
  }

  setValue(content);
  return {
    handle: null,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      hooks.clearLocalizationMetadata();
    }
  };
}

function isLocalizedContent(content: LocalizableContent): content is LocalizedContent {
  return typeof content !== 'string';
}
