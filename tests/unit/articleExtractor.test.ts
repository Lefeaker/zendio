/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const parseMock = vi.fn();

vi.mock('@mozilla/readability', () => ({
  Readability: vi.fn().mockImplementation(() => ({
    parse: parseMock
  }))
}));

vi.mock('../../src/third_party/obsidian-clipper/domPrep', () => ({
  preprocessDocument: vi.fn((doc: Document) => doc)
}));

describe('extractArticle', () => {
  beforeEach(() => {
    parseMock.mockReset();
    parseMock.mockReturnValue({
      title: 'Readable Title',
      content: '<p>Readable content</p>'
    });

    document.title = 'Document Title';
    document.body.innerHTML = `
      <article>
        <h1>Fallback Title</h1>
        <p>Fallback content</p>
      </article>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('converts article DOM into markdown with front matter', async () => {
    const module = await import('../../src/content/extractors/articleExtractor');
    const result = await module.extractArticle(document, 'https://example.com/articles/1');

    expect(result.type).toBe('article');
    expect(result.title).toBe('Readable Title');
    expect(result.markdown).toContain('type: article');
    expect(result.markdown).toContain('title: "Readable Title"');
    expect(result.markdown).toContain('Readable content');
    expect(result.meta.domain).toBe('example.com');
  });

  it('sanitizes fallback HTML when readability fails', async () => {
    parseMock.mockReturnValue(null);

    document.body.innerHTML = `
      <article>
        <h1>Fallback Title</h1>
        <script>alert('xss');</script>
        <p>Body text</p>
      </article>
    `;

    const module = await import('../../src/content/extractors/articleExtractor');
    const result = await module.extractArticle(document, 'https://example.com/unsafe');

    expect(result.title).toBe('Document Title');
    expect(result.markdown).toContain('Body text');
    expect(result.markdown).not.toContain('script');
    expect(result.markdown).not.toContain('alert(');
  });

  it('handles invalid URLs gracefully', async () => {
    parseMock.mockReturnValue(null);

    const module = await import('../../src/content/extractors/articleExtractor');
    const result = await module.extractArticle(document, 'not a valid url');

    expect(result.type).toBe('article');
    const fallbackHostname = (() => {
      try {
        return new URL(document.baseURI).hostname;
      } catch {
        return '';
      }
    })();
    expect(result.meta.domain).toBe(fallbackHostname);
    expect(result.title).toBe('Document Title');
    expect(result.markdown).toContain('Fallback content');
  });
});
