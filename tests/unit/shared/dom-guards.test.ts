/* @vitest-environment jsdom */

/**
 * Type tests for DOM guards.
 *
 * These tests verify that DOM type guards work correctly at compile time
 * and runtime, ensuring type safety for DOM operations.
 */

import { describe, it, expect } from 'vitest';
import {
  isHTMLElement,
  isHTMLInputElement,
  isHTMLTextAreaElement,
  isHTMLSelectElement,
  isHTMLButtonElement,
  isHTMLFormElement,
  isHTMLImageElement,
  isHTMLAnchorElement,
  isHTMLDivElement,
  isHTMLSpanElement,
  isSVGElement,
  isSVGSVGElement,
  isSVGCircleElement,
  isSVGPathElement,
  isInputLikeElement,
  isFormControlElement,
  querySelector,
  querySelectorAll,
  safeQuerySelector,
  safeQuerySelectorAll,
  queryHTMLElement,
  queryHTMLInputElement,
  queryHTMLTextAreaElement,
  queryHTMLSelectElement,
  queryHTMLButtonElement,
  queryFormControlElement,
  queryAllHTMLElements,
  queryAllFormControlElements,
  isTextNode,
  isElementNode,
  isDocumentNode,
  safeCloneNode,
  getActiveHTMLElement,
  getFocusableElements,
  isElementEventTarget,
  isHTMLElementEventTarget
} from '@shared/guards/dom';

const createElement = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
  document.createElement(tag);

describe('DOM Type Guards', () => {
  describe('Element Type Guards', () => {
    it('should correctly identify HTML elements', () => {
      const div = createElement('div');
      const input = createElement('input');
      const textarea = createElement('textarea');
      const select = createElement('select');
      const button = createElement('button');
      const form = createElement('form');
      const image = createElement('img');
      const anchor = createElement('a');
      const span = createElement('span');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      (globalThis as Record<string, unknown>).SVGCircleElement = circle.constructor;
      (globalThis as Record<string, unknown>).SVGPathElement = path.constructor;

      expect(isHTMLElement(div)).toBe(true);
      expect(isHTMLInputElement(input)).toBe(true);
      expect(isHTMLTextAreaElement(textarea)).toBe(true);
      expect(isHTMLSelectElement(select)).toBe(true);
      expect(isHTMLButtonElement(button)).toBe(true);
      expect(isHTMLFormElement(form)).toBe(true);
      expect(isHTMLImageElement(image)).toBe(true);
      expect(isHTMLAnchorElement(anchor)).toBe(true);
      expect(isHTMLDivElement(div)).toBe(true);
      expect(isHTMLSpanElement(span)).toBe(true);
      expect(isSVGElement(svg)).toBe(true);
      expect(isSVGSVGElement(svg)).toBe(true);
      expect(isSVGCircleElement(circle)).toBe(true);
      expect(isSVGPathElement(path)).toBe(true);

      // Cross-type checks should fail
      expect(isHTMLInputElement(div)).toBe(false);
      expect(isHTMLTextAreaElement(input)).toBe(false);
      expect(isHTMLSelectElement(textarea)).toBe(false);
      expect(isSVGCircleElement(null)).toBe(false);
    });

    it('should handle null and undefined values', () => {
      expect(isHTMLElement(null)).toBe(false);
      expect(isHTMLElement(undefined as unknown as Node | null)).toBe(false);
      expect(isHTMLInputElement(null)).toBe(false);
      expect(isHTMLTextAreaElement(undefined as unknown as Element | null)).toBe(false);
    });
  });

  describe('Composite Type Guards', () => {
    it('should correctly identify input-like elements', () => {
      const input = createElement('input');
      const textarea = createElement('textarea');
      const div = createElement('div');

      expect(isInputLikeElement(input)).toBe(true);
      expect(isInputLikeElement(textarea)).toBe(true);
      expect(isInputLikeElement(div)).toBe(false);
    });

    it('should correctly identify form control elements', () => {
      const input = createElement('input');
      const textarea = createElement('textarea');
      const select = createElement('select');
      const div = createElement('div');

      expect(isFormControlElement(input)).toBe(true);
      expect(isFormControlElement(textarea)).toBe(true);
      expect(isFormControlElement(select)).toBe(true);
      expect(isFormControlElement(div)).toBe(false);
    });
  });

  describe('Safe Query Functions', () => {
    it('should safely query elements with type guards', () => {
      const mockParent = document.createElement('div');
      const inputOne = createElement('input');
      inputOne.classList.add('input');
      const inputTwo = createElement('input');
      mockParent.append(inputOne, inputTwo);

      const inputElement = querySelector(mockParent, '.input', isHTMLInputElement);
      expect(inputElement).toBeTruthy();

      const nonExistentElement = querySelector(mockParent, '.nonexistent', isHTMLInputElement);
      expect(nonExistentElement).toBeNull();

      const inputElements = querySelectorAll(mockParent, 'input', isHTMLInputElement);
      expect(inputElements).toHaveLength(2);
    });

    it('exposes convenience query wrappers for common element families', () => {
      const mockParent = document.createElement('div');
      mockParent.innerHTML = `
        <div class="panel">
          <input class="input" />
          <textarea class="textarea"></textarea>
          <select class="select"></select>
          <button class="button"></button>
        </div>
      `;

      expect(safeQuerySelector(mockParent, '.input', isHTMLInputElement)).toBeInstanceOf(
        HTMLInputElement
      );
      expect(safeQuerySelectorAll(mockParent, 'input, textarea', isInputLikeElement)).toHaveLength(
        2
      );
      expect(queryHTMLElement(mockParent, '.panel')).toBeInstanceOf(HTMLElement);
      expect(queryHTMLTextAreaElement(mockParent, '.textarea')).toBeInstanceOf(HTMLTextAreaElement);
      expect(queryHTMLSelectElement(mockParent, '.select')).toBeInstanceOf(HTMLSelectElement);
      expect(queryHTMLButtonElement(mockParent, '.button')).toBeInstanceOf(HTMLButtonElement);
      expect(queryFormControlElement(mockParent, '.select')).toBeInstanceOf(HTMLSelectElement);
      expect(queryAllHTMLElements(mockParent, 'input, textarea, select, button')).toHaveLength(4);
      expect(
        queryAllFormControlElements(mockParent, 'input, textarea, select, button')
      ).toHaveLength(3);
    });
  });

  describe('Utility Functions', () => {
    it('should safely clone nodes', () => {
      const div = createElement('div');
      const cloned = safeCloneNode(div, true);

      expect(cloned).toBeTruthy();
      expect(cloned.tagName).toBe('DIV');
    });

    it('should identify node kinds safely', () => {
      const text = document.createTextNode('copy');
      const div = createElement('div');

      expect(isTextNode(text)).toBe(true);
      expect(isElementNode(div)).toBe(true);
      expect(isDocumentNode(document)).toBe(true);
      expect(isTextNode(null)).toBe(false);
      expect(isElementNode(text)).toBe(false);
      expect(isDocumentNode(div)).toBe(false);
    });

    it('should get active HTML element safely', () => {
      const mockDoc = document.implementation.createHTMLDocument('focus-test');
      expect(getActiveHTMLElement(mockDoc)).toBeNull();

      const activeDiv = mockDoc.createElement('div');
      activeDiv.tabIndex = 0;
      mockDoc.body.appendChild(activeDiv);
      activeDiv.focus();

      expect(getActiveHTMLElement(mockDoc)).toBe(activeDiv);
    });

    it('falls back to the only focusable or autofocus element on document surfaces', () => {
      const singleFocusableDoc = document.implementation.createHTMLDocument('single-focusable');
      const button = singleFocusableDoc.createElement('button');
      singleFocusableDoc.body.appendChild(button);
      expect(getActiveHTMLElement(singleFocusableDoc)).toBe(button);

      const autofocusDoc = document.implementation.createHTMLDocument('autofocus');
      const input = autofocusDoc.createElement('input');
      input.setAttribute('autofocus', '');
      autofocusDoc.body.append(input, autofocusDoc.createElement('button'));
      expect(getActiveHTMLElement(autofocusDoc)).toBe(input);
    });

    it('should find focusable elements', () => {
      const mockContainer = document.createElement('div');
      const button = createElement('button');
      const input = createElement('input');
      mockContainer.append(button, input);

      const focusableElements = getFocusableElements(mockContainer);
      expect(focusableElements).toHaveLength(2);
    });
  });

  describe('Event Target Guards', () => {
    it('should correctly identify event targets', () => {
      const div = createElement('div');

      expect(isElementEventTarget(div)).toBe(true);
      expect(isHTMLElementEventTarget(div)).toBe(true);

      expect(isElementEventTarget(null)).toBe(false);
      expect(isHTMLElementEventTarget(undefined)).toBe(false);
      expect(isElementEventTarget('string')).toBe(false);
    });
  });
});

// Type-level tests (these will be checked at compile time)
describe('Type Safety', () => {
  it('should provide correct type narrowing', () => {
    const element: Element | null = createElement('input');

    if (isHTMLInputElement(element)) {
      // TypeScript should know this is HTMLInputElement
      expect(typeof element.value).toBe('string');
      expect(typeof element.placeholder).toBe('string');
    }

    if (isInputLikeElement(element)) {
      // TypeScript should know this is HTMLInputElement | HTMLTextAreaElement
      expect(typeof element.value).toBe('string');
      expect(typeof element.placeholder).toBe('string');
    }

    if (isFormControlElement(element)) {
      // TypeScript should know this is a form control
      expect(typeof element.value).toBe('string');
    }
  });

  it('should work with querySelector type narrowing', () => {
    const mockParent = document.createElement('div');
    mockParent.innerHTML = '<input type="text" />';

    const input = queryHTMLInputElement(mockParent, 'input');
    if (input) {
      // TypeScript should know this is HTMLInputElement
      expect(typeof input.value).toBe('string');
      expect(typeof input.type).toBe('string');
    }
  });
});
