/* @vitest-environment jsdom */

import TurndownService from 'turndown';
import { describe, expect, it } from 'vitest';
import {
  buildAncestorListMarkdown,
  wrapListFragment,
  serializeFragment,
  serializeElement,
  extractListItemLabel
} from '../../src/content/clipper/shared/contextSerialization';

const turndown = new TurndownService();

describe('contextSerialization helpers', () => {
  it('builds ancestor markdown with indentation', () => {
    document.body.innerHTML = `
      <ul>
        <li id="parent">Parent
          <ul>
            <li id="child">Child</li>
          </ul>
        </li>
      </ul>
    `;
    const child = document.getElementById('child')!;
    const path = [document.getElementById('parent')!, child];
    const { markdown, depth } = buildAncestorListMarkdown(path, turndown);
    expect(markdown).toBe('- Parent');
    expect(depth).toBe(1);
  });

  it('wraps list fragment preserving list tag', () => {
    const li = document.createElement('li');
    li.textContent = 'Item';
    const fragment = document.createDocumentFragment();
    fragment.appendChild(document.createTextNode('Nested'));

    const wrapped = wrapListFragment(li, fragment);
    expect(wrapped).toContain('<ul>');
    expect(wrapped).toContain('<li');
  });

  it('serializes fragment and removes container when empty', () => {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(document.createElement('span'));
    const html = serializeFragment(fragment);
    expect(html).toContain('<span');
  });

  it('serializes element with list wrapper when needed', () => {
    const li = document.createElement('li');
    li.textContent = 'Item';
    const html = serializeElement(li);
    expect(html.startsWith('<ul')).toBe(true);
  });

  it('extracts list item label without nested lists', () => {
    const li = document.createElement('li');
    li.innerHTML = 'Parent<ul><li>Child</li></ul>';
    const label = extractListItemLabel(li, turndown);
    expect(label).toBe('Parent');
  });
});
