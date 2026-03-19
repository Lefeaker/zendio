/* @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { generateTextFragmentUrl } from '@content/clipper/utils/textFragment';
import { extractSelectionClip } from '@content/extractors/selectionExtractor';

describe('selectionExtractor', () => {
  it('generates fragment urls from selected text', () => {
    const fragment = generateTextFragmentUrl('https://example.com', 'Hello world from fragment test');
    expect(fragment).toContain('https://example.com#:~:text=');
  });

  it('creates markdown for simple selection', async () => {
    document.body.innerHTML = `
      <article>
        <p id="target">Hello world</p>
      </article>
    `;

    const target = document.getElementById('target');
    if (!target) throw new Error('missing test element');

    const range = document.createRange();
    range.selectNodeContents(target);

    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    const result = await extractSelectionClip({
      doc: document,
      url: 'https://example.com',
      selectedHtml: container.innerHTML,
      selectedText: target.textContent || '',
      userComment: '',
      config: {
        useFootnoteFormat: false,
        captureContext: false,
        contextLength: 200,
        contextMode: 'chars',
        selectionModifierEnabled: false,
        selectionModifierKeys: [],
        keyboardShortcutsEnabled: false
      },
      selectionRange: range
    });

    expect(result.type).toBe('clipper');
    expect(result.markdown).toContain('Hello world');
    expect(result.meta.fragmentUrl).toContain('#:~:text');
    expect(result.meta.domain).toBe('example.com');
    expect(result.meta.url).toBe('https://example.com/');
    expect(result.meta.sourceUrl).toBe('https://example.com');
    expect(result.meta.resolvedUrl).toBe('https://example.com/');
  });

  it('falls back gracefully when url cannot be parsed', async () => {
    document.body.innerHTML = `<p id="target">Fallback text</p>`;
    const target = document.getElementById('target');
    if (!target) throw new Error('missing test element');

    const range = document.createRange();
    range.selectNodeContents(target);

    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    const result = await extractSelectionClip({
      doc: document,
      url: 'not a url',
      selectedHtml: container.innerHTML,
      selectedText: target.textContent || '',
      userComment: '',
      config: {
        useFootnoteFormat: false,
        captureContext: false,
        contextLength: 200,
        contextMode: 'chars',
        selectionModifierEnabled: false,
        selectionModifierKeys: [],
        keyboardShortcutsEnabled: false
      },
      selectionRange: range
    });

    expect(result.meta.domain).toBe(new URL(document.baseURI ?? 'http://localhost/').hostname || '');
    expect(result.meta.sourceUrl).toBe('not a url');
    expect(result.meta.resolvedUrl).toBe(document.baseURI ?? 'not a url');
    expect(result.meta.fragmentUrl).toContain('#:~:text');
  });

  it('marks hasComment when a user comment is provided', async () => {
    document.body.innerHTML = `<p id="target">Commented text</p>`;
    const target = document.getElementById('target');
    if (!target) throw new Error('missing test element');
    const range = document.createRange();
    range.selectNodeContents(target);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    const result = await extractSelectionClip({
      doc: document,
      url: 'https://example.com/post',
      selectedHtml: container.innerHTML,
      selectedText: target.textContent || '',
      userComment: 'remember this',
      config: {
        useFootnoteFormat: false,
        captureContext: false,
        contextLength: 200,
        contextMode: 'chars',
        selectionModifierEnabled: false,
        selectionModifierKeys: [],
        keyboardShortcutsEnabled: false
      },
      selectionRange: range
    });
    expect(result.meta.hasComment).toBe(true);
    expect(result.markdown).toContain('remember this');
  });

});
