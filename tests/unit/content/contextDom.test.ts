/* @vitest-environment jsdom */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  resolveContextRange,
  collectListPath,
  findPreviousBlockElement,
  getCleanTextContent
} from '@content/clipper/shared/contextDom';

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

describe('contextDom utilities', () => {
  it('clones range when resolving context', () => {
    container.innerHTML = '<p id="p">Hello <span>world</span></p>';
    const span = container.querySelector('span');
    if (!span || !span.firstChild) {
      throw new Error('Expected span with text node');
    }
    const textNode = span.firstChild;
    const textContent = textNode.textContent ?? '';

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textContent.length);

    const resolved = resolveContextRange(range);
    expect(resolved).not.toBe(range);
    expect(resolved?.startContainer).toBe(textNode);
    expect(resolved?.endOffset).toBe(textContent.length);
  });

  it('returns null when selection has no ranges', () => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    expect(resolveContextRange(selection)).toBeNull();
  });

  it('collects nested list path from range', () => {
    container.innerHTML = `
      <ul>
        <li id="outer">Item
          <ul>
            <li id="inner">Nested</li>
          </ul>
        </li>
      </ul>
    `;
    const targetElement = container.querySelector('#inner');
    if (!targetElement || !targetElement.firstChild) {
      throw new Error('Expected nested list item with text');
    }
    const target = targetElement.firstChild;
    const textContent = target.textContent ?? '';
    const range = document.createRange();
    range.setStart(target, 0);
    range.setEnd(target, textContent.length);

    const path = collectListPath(range);
    expect(path.map((el) => el.id)).toEqual(['outer', 'inner']);
  });

  it('finds previous block element in tree', () => {
    container.innerHTML = '<section><p id="first">First</p><p id="second">Second</p></section>';
    const second = container.querySelector('#second');
    if (!second || !second.firstChild) {
      throw new Error('Expected second paragraph with text');
    }
    const secondText = second.firstChild;
    const range = document.createRange();
    range.setStart(secondText, 0);
    range.setEnd(secondText, 1);

    const prev = findPreviousBlockElement(range);
    expect(prev?.id).toBe('first');
  });

  it('removes scripts when cleaning text content', () => {
    const element = document.createElement('div');
    element.innerHTML = '<p>Visible</p><script>console.log("secret")</script>';
    expect(getCleanTextContent(element).trim()).toBe('Visible');
  });
});
