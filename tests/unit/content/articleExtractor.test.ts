/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetYamlConfigOverridesStore, setYamlConfigOverrides } from '@shared/state/yamlConfigOverridesStore';

const parseMock = vi.fn();

vi.mock('@mozilla/readability', () => ({
  Readability: vi.fn().mockImplementation(() => ({
    parse: parseMock
  }))
}));

vi.mock('../../../src/third_party/obsidian-clipper/domPrep', () => ({
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
    setYamlConfigOverrides(null);
    resetYamlConfigOverridesStore();
  });

  it('canHandle always resolves true', async () => {
    const module = await import('@content/extractors/articleExtractor');
    const extractor = module.createArticleExtractor({
      now: () => new Date('2024-01-01T00:00:00Z')
    });

    const result = await extractor.canHandle({ url: 'https://example.com/post', document });
    expect(result).toBe(true);
  });

  it('converts article DOM into markdown with front matter', async () => {
    const module = await import('@content/extractors/articleExtractor');
    const result = await module.extractArticle(document, 'https://example.com/articles/1');

    expect(result.type).toBe('article');
    expect(result.title).toBe('Readable Title');
    expect(result.markdown).toContain('type: "article"');
    expect(result.markdown).toContain('title: "Readable Title"');
    expect(result.markdown).toContain('url: "https://example.com/articles/1"');
    expect(result.markdown).toContain('Readable content');
    expect(result.meta.domain).toBe('example.com');
    expect(result.meta.sourceUrl).toBe('https://example.com/articles/1');
    expect(result.meta.resolvedUrl).toBe('https://example.com/articles/1');
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

    const module = await import('@content/extractors/articleExtractor');
    const result = await module.extractArticle(document, 'https://example.com/unsafe');

    expect(result.title).toBe('Document Title');
    expect(result.markdown).toContain('Body text');
    expect(result.markdown).not.toContain('script');
    expect(result.markdown).not.toContain('alert(');
    expect(result.meta.sourceUrl).toBe('https://example.com/unsafe');
    expect(result.meta.resolvedUrl).toBe('https://example.com/unsafe');
  });

  it('applies YAML overrides with valuePath and array defaults', async () => {
    setYamlConfigOverrides({
      contentTypes: {
        article: {
          customFields: [
            { name: 'article_alias', type: 'text', enabled: true, valuePath: 'title' },
            { name: 'reading_tags', type: 'array', enabled: true, defaultValue: ['reading', 'focus'] }
          ]
        }
      }
    });
    const module = await import('@content/extractors/articleExtractor');
    const result = await module.extractArticle(document, 'https://example.com/articles/42');

    const frontMatterMatch = result.markdown.match(/^---\n([\s\S]*?)\n---/);
    const frontMatter = frontMatterMatch ? frontMatterMatch[0] : '';
    expect(frontMatter).toContain('article_alias: "Readable Title"');
    expect(frontMatter).toContain('reading_tags: ["reading", "focus"]');
  });

  it('handles invalid URLs gracefully', async () => {
    parseMock.mockReturnValue(null);

    const module = await import('@content/extractors/articleExtractor');
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
    expect(result.meta.sourceUrl).toBe('not a valid url');
    expect(result.meta.resolvedUrl).toBe(document.baseURI);
    expect(result.title).toBe('Document Title');
    expect(result.markdown).toContain('Fallback content');
    expect(result.markdown).toContain(`url: "${document.baseURI}"`);
  });

  it('supports about protocol without throwing or losing markdown', async () => {
    parseMock.mockReturnValue({
      title: 'About Title',
      content: '<p>About body</p>'
    });

    const module = await import('@content/extractors/articleExtractor');
    const parser = new DOMParser();
    const aboutDoc = parser.parseFromString(
      '<html><head><title>About Page</title></head><body><article><p>About body</p></article></body></html>',
      'text/html'
    );
    const result = await module.extractArticle(aboutDoc, 'about:blank');

    expect(result.type).toBe('article');
    expect(result.meta.resolvedUrl).toBe('about:blank');
    expect(result.meta.sourceUrl).toBe('about:blank');
    expect(result.meta.domain).toBe('');
    expect(result.markdown).toContain('About body');
  });

  it('filters disallowed image protocols', async () => {
    parseMock.mockReturnValue({
      title: 'Image Title',
      content: `<p><img src="javascript:alert('xss')" alt="bad" /></p>`
    });

    const module = await import('@content/extractors/articleExtractor');
    const result = await module.extractArticle(document, 'https://example.com/with-image');

    expect(result.markdown).not.toContain('![bad]');
    expect(result.markdown).not.toContain('javascript:alert');
  });

  it('resolves relative image sources using the base url', async () => {
    parseMock.mockReturnValue({
      title: 'Image Title',
      content: `<p><img src="/images/photo.png" alt="Photo" /></p>`
    });

    const module = await import('@content/extractors/articleExtractor');
    const result = await module.extractArticle(document, 'https://example.com/articles/1');

    expect(result.markdown).toContain('![Photo](https://example.com/images/photo.png)');
  });

  it('falls back to source url when sanitized content is empty', async () => {
    parseMock.mockReturnValue(null);

    document.body.innerHTML = `<script>alert('xss')</script>`;

    const module = await import('@content/extractors/articleExtractor');
    const result = await module.extractArticle(document, 'https://example.com/empty');

    expect(result.markdown).toContain('https://example.com/empty');
    expect(result.markdown).not.toContain('script');
  });

  it('handles chrome-extension protocol and keeps domain', async () => {
    parseMock.mockReturnValue({
      title: 'Extension Title',
      content: '<p>Extension content</p>'
    });

    const module = await import('@content/extractors/articleExtractor');
    const parser = new DOMParser();
    const extensionDoc = parser.parseFromString(
      '<html><head><title>Extension Page</title></head><body><article><p>Extension content</p></article></body></html>',
      'text/html'
    );
    Object.defineProperty(extensionDoc, 'baseURI', {
      configurable: true,
      value: 'chrome-extension://deadbeef/home.html'
    });

    const result = await module.extractArticle(extensionDoc, 'chrome-extension://deadbeef/home.html');

    expect(result.meta.sourceUrl).toBe('chrome-extension://deadbeef/home.html');
    expect(result.meta.resolvedUrl).toBe('chrome-extension://deadbeef/home.html');
    expect(result.meta.domain).toBe('deadbeef');
    expect(result.markdown).toContain('Extension content');
  });

  it('falls back gracefully for data urls when readability fails', async () => {
    parseMock.mockReturnValue(null);
    const module = await import('@content/extractors/articleExtractor');
    const parser = new DOMParser();
    const dataDoc = parser.parseFromString(
      '<html><head><title>Data Doc</title><style>p{color:red;}</style></head><body><article><p>Inline body</p><noscript>should hide</noscript></article></body></html>',
      'text/html'
    );

    const dataUrl = 'data:text/html,<p>Inline body</p>';
    const result = await module.extractArticle(dataDoc, dataUrl);

    expect(result.meta.sourceUrl).toBe(dataUrl);
    expect(result.meta.resolvedUrl).toBe(dataUrl);
    expect(result.meta.domain).toBe('');
    expect(result.markdown).toContain('Inline body');
    expect(result.markdown).not.toContain('noscript');
    expect(result.markdown).not.toContain('style');
  });

  it('removes inline event handlers and disallowed links when sanitizing fallback HTML', async () => {
    parseMock.mockReturnValue(null);
    document.body.innerHTML = `
      <article>
        <p onclick="alert('xss')">Inline event</p>
        <a href="javascript:alert('xss')">Danger link</a>
        <a href="https://example.com" onclick="doSomething()">Safe link</a>
      </article>
    `;

    const module = await import('../../../src/content/extractors/articleExtractor');
    const result = await module.extractArticle(document, 'https://example.com/page');

    expect(result.markdown).toContain('Inline event');
    expect(result.markdown).toContain('[Safe link](https://example.com)');
    expect(result.markdown).not.toContain('javascript:alert');
    expect(result.markdown).not.toContain('onclick');
  });
});
