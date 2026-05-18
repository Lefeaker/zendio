/**
 * DOM type guards for safe element type checking.
 *
 * These guards replace unsafe type assertions (as HTMLElement) with
 * runtime type checking to ensure type safety.
 */

// HTML Element Guards
export function isHTMLElement(node: Node | Element | null): node is HTMLElement {
  return node instanceof HTMLElement;
}

export function isHTMLInputElement(element: Element | null): element is HTMLInputElement {
  return element instanceof HTMLInputElement;
}

export function isHTMLTextAreaElement(element: Element | null): element is HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement;
}

export function isHTMLSelectElement(element: Element | null): element is HTMLSelectElement {
  return element instanceof HTMLSelectElement;
}

export function isHTMLButtonElement(element: Element | null): element is HTMLButtonElement {
  return element instanceof HTMLButtonElement;
}

export function isHTMLFormElement(element: Element | null): element is HTMLFormElement {
  return element instanceof HTMLFormElement;
}

export function isHTMLImageElement(element: Element | null): element is HTMLImageElement {
  return element instanceof HTMLImageElement;
}

export function isHTMLAnchorElement(element: Element | null): element is HTMLAnchorElement {
  return element instanceof HTMLAnchorElement;
}

export function isHTMLDivElement(element: Element | null): element is HTMLDivElement {
  return element instanceof HTMLDivElement;
}

export function isHTMLSpanElement(element: Element | null): element is HTMLSpanElement {
  return element instanceof HTMLSpanElement;
}

// SVG Element Guards
export function isSVGElement(element: Element | null): element is SVGElement {
  return element instanceof SVGElement;
}

export function isSVGSVGElement(element: Element | null): element is SVGSVGElement {
  return element instanceof SVGSVGElement;
}

export function isSVGCircleElement(element: Element | null): element is SVGCircleElement {
  return element instanceof SVGCircleElement;
}

export function isSVGPathElement(element: Element | null): element is SVGPathElement {
  return element instanceof SVGPathElement;
}

// Input-like element guards (for form handling)
export function isInputLikeElement(
  element: Element | null
): element is HTMLInputElement | HTMLTextAreaElement {
  return isHTMLInputElement(element) || isHTMLTextAreaElement(element);
}

export function isFormControlElement(
  element: Element | null
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    isHTMLInputElement(element) || isHTMLTextAreaElement(element) || isHTMLSelectElement(element)
  );
}

// Safe querySelector with type guard
export function querySelector<T extends Element>(
  parent: ParentNode,
  selector: string,
  guard: (element: Element | null) => element is T
): T | null {
  const element = parent.querySelector(selector);
  return guard(element) ? element : null;
}

// Safe querySelectorAll with type guard
export function querySelectorAll<T extends Element>(
  parent: ParentNode,
  selector: string,
  guard: (element: Element) => element is T
): T[] {
  const elements = Array.from(parent.querySelectorAll(selector));
  return elements.filter(guard);
}

// Convenience functions for common patterns
export function safeQuerySelector<T extends Element>(
  parent: ParentNode,
  selector: string,
  guard: (element: Element | null) => element is T
): T | null {
  return querySelector(parent, selector, guard);
}

export function safeQuerySelectorAll<T extends Element>(
  parent: ParentNode,
  selector: string,
  guard: (element: Element) => element is T
): T[] {
  return querySelectorAll(parent, selector, guard);
}

// Specific convenience functions for common use cases
export function queryHTMLElement(parent: ParentNode, selector: string): HTMLElement | null {
  return querySelector(parent, selector, isHTMLElement);
}

export function queryHTMLInputElement(
  parent: ParentNode,
  selector: string
): HTMLInputElement | null {
  return querySelector(parent, selector, isHTMLInputElement);
}

export function queryHTMLTextAreaElement(
  parent: ParentNode,
  selector: string
): HTMLTextAreaElement | null {
  return querySelector(parent, selector, isHTMLTextAreaElement);
}

export function queryHTMLSelectElement(
  parent: ParentNode,
  selector: string
): HTMLSelectElement | null {
  return querySelector(parent, selector, isHTMLSelectElement);
}

export function queryHTMLButtonElement(
  parent: ParentNode,
  selector: string
): HTMLButtonElement | null {
  return querySelector(parent, selector, isHTMLButtonElement);
}

export function queryFormControlElement(
  parent: ParentNode,
  selector: string
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  return querySelector(parent, selector, isFormControlElement);
}

// Array-based queries
export function queryAllHTMLElements(parent: ParentNode, selector: string): HTMLElement[] {
  return querySelectorAll(parent, selector, isHTMLElement);
}

export function queryAllFormControlElements(
  parent: ParentNode,
  selector: string
): (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[] {
  return querySelectorAll(parent, selector, isFormControlElement);
}

// Node type guards
export function isTextNode(node: Node | null): node is Text {
  return node?.nodeType === Node.TEXT_NODE;
}

export function isElementNode(node: Node | null): node is Element {
  return node?.nodeType === Node.ELEMENT_NODE;
}

export function isDocumentNode(node: Node | null): node is Document {
  return node?.nodeType === Node.DOCUMENT_NODE;
}

// Safe cloning with type preservation
export function safeCloneNode<T extends Node>(node: T, deep?: boolean): T {
  return node.cloneNode(deep) as T;
}

// Active element guard
export function getActiveHTMLElement(document: Document): HTMLElement | null {
  const active = document.activeElement;
  if (!isHTMLElement(active)) {
    return null;
  }

  if (isDocumentSurfaceElement(document, active) && !hasCustomFocusBehavior(active)) {
    return findFallbackActiveElement(document);
  }

  return active;
}

// Focus management helpers
export function getFocusableElements(container: Element): HTMLElement[] {
  const focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  return queryAllHTMLElements(container, focusableSelectors).filter(
    (el) => !el.hasAttribute('disabled')
  );
}

// Event target guards
export function isHTMLElementEventTarget(target: unknown): target is HTMLElement {
  return target instanceof HTMLElement;
}

export function isElementEventTarget(target: unknown): target is Element {
  return target instanceof Element;
}

function isDocumentSurfaceElement(document: Document, element: HTMLElement): boolean {
  return element === document.body || element === document.documentElement;
}

function findFallbackActiveElement(document: Document): HTMLElement | null {
  const root = document.body ?? document.documentElement;
  if (!root) {
    return null;
  }

  const focusableElements = getFocusableElements(root);
  if (focusableElements.length === 1) {
    return focusableElements[0];
  }

  const autofocusTarget = root.querySelector<HTMLElement>('[autofocus]');
  return autofocusTarget ?? null;
}

function hasCustomFocusBehavior(element: HTMLElement): boolean {
  if (element.hasAttribute('contenteditable')) {
    return true;
  }
  if (element.hasAttribute('tabindex')) {
    const value = Number(element.getAttribute('tabindex'));
    return !Number.isNaN(value);
  }
  return element.tabIndex >= 0;
}
