import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { captureGlobalSnapshot, restoreGlobalSnapshot, installJsdom } from '../utils/globalTestHelpers';

describe('article extraction hardening e2e', () => {
  let globalSnapshot: ReturnType<typeof captureGlobalSnapshot>;

  beforeEach(() => {
    globalSnapshot = captureGlobalSnapshot();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    restoreGlobalSnapshot(globalSnapshot);
  });

  it('produces sanitized markdown for extension pages with inline handlers', async () => {
    vi.resetModules();
    const html = `
      <html>
        <head>
          <title>Extension Page</title>
          <style>.bad { color: red; }</style>
        </head>
        <body>
          <article>
            <h1 onclick="alert('xss')">Sample</h1>
            <p>Extension paragraph</p>
            <a href="javascript:alert('hack')" onmouseover="doSomething()">insecure link</a>
            <a href="https://safe.example.com/path">safe link</a>
            <noscript>noscript content</noscript>
          </article>
        </body>
      </html>
    `;

    const dom = new JSDOM(html, { url: 'chrome-extension://deadbeef/sample.html' });
    installJsdom(dom, { includeLocalStorage: false });

    const { extractArticle } = await import('../../src/content/extractors/articleExtractor');
    const clip = await extractArticle(dom.window.document, 'chrome-extension://deadbeef/sample.html');

    expect(clip.type).toBe('article');
    expect(clip.meta.domain).toBe('deadbeef');
    expect(clip.markdown).toContain('Extension paragraph');
    expect(clip.markdown).toContain('[safe link](https://safe.example.com/path)');
    expect(clip.markdown).not.toContain('javascript:alert');
    expect(clip.markdown).not.toContain('onclick');
    expect(clip.markdown).not.toContain('noscript');
    expect(clip.markdown).not.toContain('<style>');
  });

  it('falls back to sanitized HTML when readability yields null', async () => {
    vi.resetModules();
    const html = `
      <html>
        <head><title>Data Doc</title></head>
        <body>
          <article>
            <p>Inline body</p>
            <script>console.log('bad')</script>
          </article>
        </body>
      </html>
    `;

    const dom = new JSDOM(html, { url: 'data:text/html,<p>Inline body</p>' });
    installJsdom(dom, { includeLocalStorage: false });

    vi.doMock('@mozilla/readability', () => ({
      Readability: vi.fn().mockImplementation(() => ({
        parse: () => null
      }))
    }));

    const { extractArticle } = await import('../../src/content/extractors/articleExtractor');
    const clip = await extractArticle(dom.window.document, 'data:text/html,<p>Inline body</p>');

    expect(clip.meta.sourceUrl).toBe('data:text/html,<p>Inline body</p>');
    expect(clip.markdown).toContain('Inline body');
    expect(clip.markdown).not.toContain('console.log');
  });
});
