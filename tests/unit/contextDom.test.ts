/* @vitest-environment jsdom */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  resolveContextRange,
  collectListPath,
  findPreviousBlockElement,
  getCleanTextContent
} from '../../src/content/clipper/shared/contextDom';

let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

describe('contextDom utilities', () => {
  it('clones range when resolving context', () => {
    container.innerHTML = '<p id="p">Hello <span>world</span></p>';
    const textNode = container.querySelector('span')!.firstChild!;

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent!.length);

    const resolved = resolveContextRange(range);
    expect(resolved).not.toBe(range);
    expect(resolved?.startContainer).toBe(textNode);
    expect(resolved?.endOffset).toBe(textNode.textContent!.length);
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
    const target = container.querySelector('#inner')!.firstChild!;
    const range = document.createRange();
    range.setStart(target, 0);
    range.setEnd(target, target.textContent!.length);

    const path = collectListPath(range);
    expect(path.map(el => el.id)).toEqual(['outer', 'inner']);
  });

  it('finds previous block element in tree', () => {
    container.innerHTML = '<section><p id="first">First</p><p id="second">Second</p></section>';
    const secondText = container.querySelector('#second')!.firstChild!;
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
