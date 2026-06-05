import type { Messages } from '../locales';
import type { I18nBindingAdapter, I18nBindingHandle, I18nResource } from '../types';
import { isInputLikeElement } from '../../shared/guards';
import {
  resolveAdaptiveText,
  annotateBudgetMetadata,
  applyAdaptiveState
} from '../../shared/i18n/textAdaptation';

const RICH_HTML_ALLOWED_KEYS = new Set<keyof Messages>([
  'contactModalDescription',
  'schemaResourceContactDescription'
]);

const RICH_HTML_ALLOWED_TAGS = new Set(['a', 'br', 'strong', 'em', 'code']);
const RICH_HTML_DROP_TAGS = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed']);
const RICH_HTML_ALLOWED_PROTOCOLS = new Set(['https:', 'mailto:']);

function stripUnsafeHrefCharacters(rawHref: string): string {
  let result = '';

  for (const character of rawHref.trim()) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x20 || codePoint === 0x7f) {
      continue;
    }
    result += character;
  }

  return result;
}

function sanitizeRichHref(rawHref: string): string | null {
  const normalised = stripUnsafeHrefCharacters(rawHref);
  if (normalised.length === 0) {
    return null;
  }

  try {
    const url = new URL(normalised);
    return RICH_HTML_ALLOWED_PROTOCOLS.has(url.protocol) ? normalised : null;
  } catch {
    return null;
  }
}

function appendSanitizedChildren(source: Element, target: Node, ownerDocument: Document): void {
  Array.from(source.childNodes).forEach((child) => {
    const sanitized = sanitizeRichNode(child, ownerDocument);
    if (sanitized) {
      target.appendChild(sanitized);
    }
  });
}

function sanitizeAnchor(source: Element, ownerDocument: Document): Node {
  const href = source.getAttribute('href');
  const safeHref = href ? sanitizeRichHref(href) : null;

  if (!safeHref) {
    const fragment = ownerDocument.createDocumentFragment();
    appendSanitizedChildren(source, fragment, ownerDocument);
    return fragment;
  }

  const anchor = ownerDocument.createElement('a');
  anchor.setAttribute('href', safeHref);

  const target = source.getAttribute('target');
  if (target) {
    anchor.setAttribute('target', target);
  }

  const relTokens = new Set((source.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean));
  if ((target ?? '').toLowerCase() === '_blank') {
    relTokens.add('noopener');
    relTokens.add('noreferrer');
  }
  if (relTokens.size > 0) {
    anchor.setAttribute('rel', Array.from(relTokens).join(' '));
  }

  appendSanitizedChildren(source, anchor, ownerDocument);
  return anchor;
}

function sanitizeRichNode(node: Node, ownerDocument: Document): Node | null {
  if (node.nodeType === 3) {
    return ownerDocument.createTextNode(node.textContent ?? '');
  }

  if (node.nodeType !== 1) {
    return null;
  }

  const source = node as Element;
  const tagName = source.tagName.toLowerCase();

  if (RICH_HTML_DROP_TAGS.has(tagName)) {
    return null;
  }

  if (!RICH_HTML_ALLOWED_TAGS.has(tagName)) {
    const fragment = ownerDocument.createDocumentFragment();
    appendSanitizedChildren(source, fragment, ownerDocument);
    return fragment;
  }

  if (tagName === 'br') {
    return ownerDocument.createElement('br');
  }

  if (tagName === 'a') {
    return sanitizeAnchor(source, ownerDocument);
  }

  const element = ownerDocument.createElement(tagName);
  appendSanitizedChildren(source, element, ownerDocument);
  return element;
}

function renderRichHtml(element: HTMLElement, key: keyof Messages, value: string): void {
  if (!RICH_HTML_ALLOWED_KEYS.has(key)) {
    element.textContent = value;
    return;
  }

  const ownerDocument = element.ownerDocument ?? document;
  const template = ownerDocument.createElement('template');
  template.innerHTML = value;

  const fragment = ownerDocument.createDocumentFragment();
  Array.from(template.content.childNodes).forEach((child) => {
    const sanitized = sanitizeRichNode(child, ownerDocument);
    if (sanitized) {
      fragment.appendChild(sanitized);
    }
  });

  element.replaceChildren(fragment);
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
