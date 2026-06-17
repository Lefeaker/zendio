/* @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { generateTextFragmentUrl } from '@content/clipper/utils/textFragment';
import { extractSelectionClip } from '@content/extractors/selectionExtractor';

describe('selectionExtractor', () => {
  it('generates fragment urls from selected text', () => {
    const fragment = generateTextFragmentUrl(
      'https://example.com',
      'Hello world from fragment test'
    );
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

    expect(result.meta.domain).toBe(
      new URL(document.baseURI ?? 'http://localhost/').hostname || ''
    );
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
      commentHeading: 'Catalog Comment Heading',
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

  it('keeps hasComment false and falls back to original url when range is missing', async () => {
    document.body.innerHTML = `<p>Detached text</p>`;
    const result = await extractSelectionClip({
      doc: document,
      url: '',
      selectedHtml: '<p>Detached text</p>',
      selectedText: 'Detached text',
      config: {
        useFootnoteFormat: false,
        captureContext: true,
        contextLength: 120,
        contextMode: 'chars',
        selectionModifierEnabled: false,
        selectionModifierKeys: [],
        keyboardShortcutsEnabled: false
      },
      selectionRange: null
    });

    expect(result.meta.hasComment).toBe(false);
    expect(result.meta.sourceUrl).toBe('');
    expect(result.meta.resolvedUrl).toBe(document.baseURI ?? '');
    expect(result.meta.selectedTextPreview).toBe('Detached text');
  });

  it('falls back to hostname title and default config when config is omitted', async () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = `<p id="target">Title fallback</p>`;
    const target = doc.getElementById('target');
    if (!target) throw new Error('missing test element');

    const range = doc.createRange();
    range.selectNodeContents(target);
    const container = doc.createElement('div');
    container.appendChild(range.cloneContents());

    const result = await extractSelectionClip({
      doc,
      url: 'https://fallback.example/path',
      selectedHtml: container.innerHTML,
      selectedText: target.textContent || '',
      selectionRange: range
    } as never);

    expect(result.pageTitle).toBe('fallback.example');
    expect(result.meta.domain).toBe('fallback.example');
    expect(result.meta.url).toBe('https://fallback.example/path');
  });

  it('treats whitespace comments as empty and accepts Selection objects', async () => {
    document.body.innerHTML = `
      <ul>
        <li id="item"><span>List context</span></li>
      </ul>
    `;
    const target = document.getElementById('item');
    if (!target) throw new Error('missing test element');

    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    const result = await extractSelectionClip({
      doc: document,
      url: 'https://example.com/list',
      selectedHtml: container.innerHTML,
      selectedText: target.textContent || '',
      userComment: '   ',
      config: {
        useFootnoteFormat: false,
        captureContext: true,
        contextLength: 200,
        contextMode: 'chars',
        selectionModifierEnabled: false,
        selectionModifierKeys: [],
        keyboardShortcutsEnabled: false
      },
      selectionRange: selection
    });

    expect(result.meta.hasComment).toBe(false);
    expect(result.markdown).toContain('List context');
  });

  it('uses a caller-provided localized comment heading', async () => {
    document.body.innerHTML = `<p id="target">Localized text</p>`;
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
      commentHeading: 'Catalog Comment Heading',
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

    expect(result.markdown).toContain('## 💭 Catalog Comment Heading');
    expect(result.markdown).not.toContain('我的评论');
  });

  it('throws when plain markdown export omits the comment heading', async () => {
    document.body.innerHTML = `<p id="target">Localized text</p>`;
    const target = document.getElementById('target');
    if (!target) throw new Error('missing test element');

    const range = document.createRange();
    range.selectNodeContents(target);
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    expect(() =>
      extractSelectionClip({
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
      })
    ).toThrow('Missing fragment comment heading');
  });
});
