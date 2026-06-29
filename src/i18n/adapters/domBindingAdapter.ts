import type { Messages } from '../locales';
import type { I18nBindingAdapter, I18nBindingHandle, I18nResource } from '../types';
import { isInputLikeElement } from '../../shared/guards';
import {
  resolveAdaptiveText,
  annotateBudgetMetadata,
  applyAdaptiveState
} from '../../shared/i18n/textAdaptation';
import { replaceChildrenWithSafeRichText } from '../../shared/i18n/richTextDom';

const RICH_HTML_ALLOWED_KEYS = new Set<keyof Messages>([
  'contactModalDescription',
  'schemaResourceContactDescription'
]);

function renderRichHtml(element: HTMLElement, key: keyof Messages, value: string): void {
  if (!RICH_HTML_ALLOWED_KEYS.has(key)) {
    element.textContent = value;
    return;
  }

  replaceChildrenWithSafeRichText(element, value);
}

type TextBinding = {
  type: 'text';
  element: HTMLElement;
  key: keyof Messages;
};

type HtmlBinding = {
  type: 'html';
  element: HTMLElement;
  key: keyof Messages;
};

type AttrBinding = {
  type: 'attribute';
  element: HTMLElement;
  attribute: string;
  key: keyof Messages;
};

type Binding = TextBinding | HtmlBinding | AttrBinding;

function normaliseAttr(attribute: string): string {
  return attribute
    .replace(/([A-Z])/g, '-$1')
    .replace(/^-/, '')
    .toLowerCase();
}

function applyBinding(binding: Binding, resource: I18nResource): void {
  if (binding.type === 'text') {
    const adaptation = resolveAdaptiveText(binding.key, resource);
    annotateBudgetMetadata(binding.element, binding.key as string, adaptation.budget);
    binding.element.textContent = adaptation.value;
    applyAdaptiveState(binding.element, adaptation);
    return;
  }

  const value = resource.get(binding.key);
  if (value === undefined) {
    return;
  }
  if (binding.type === 'html') {
    renderRichHtml(binding.element, binding.key, value);
    return;
  }

  const element = binding.element;
  const attr = binding.attribute;
  if (attr === 'placeholder' && isInputLikeElement(element)) {
    element.placeholder = value;
  }
  if (attr === 'value' && isInputLikeElement(element)) {
    element.value = value;
  }
  element.setAttribute(attr, value);
}

export function createDomBindingAdapter(): I18nBindingAdapter {
  const bindings = new Set<Binding>();
  let currentResource: I18nResource | null = null;

  const dispose = (binding: Binding) => {
    bindings.delete(binding);
  };

  const registerBinding = (binding: Binding): I18nBindingHandle => {
    bindings.add(binding);
    if (currentResource) {
      applyBinding(binding, currentResource);
    }
    return {
      dispose: () => dispose(binding)
    };
  };

  return {
    bindText(element, key) {
      element.setAttribute('data-i18n', key as string);
      return registerBinding({
        type: 'text',
        element,
        key
      });
    },
    bindAttribute(element, attribute, key) {
      const dataAttr = `data-i18n-${normaliseAttr(attribute)}`;
      element.setAttribute(dataAttr, key as string);
      return registerBinding({
        type: 'attribute',
        element,
        attribute,
        key
      });
    },
    bindHtml(element, key) {
      element.setAttribute('data-i18n-html', key as string);
      return registerBinding({
        type: 'html',
        element,
        key
      });
    },
    refresh(resource) {
      currentResource = resource;
      bindings.forEach((binding) => {
        applyBinding(binding, resource);
      });
    },
    clear() {
      bindings.clear();
      currentResource = null;
    }
  };
}
