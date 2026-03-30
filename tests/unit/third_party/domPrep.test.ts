/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';

import { preprocessDocument, preprocessDocumentFull, removeAdsAndTracking, cleanupAttributes } from '../../../src/third_party/obsidian-clipper/domPrep';

function createDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('domPrep', () => {
  it('removes script-like elements and absolutizes urls', () => {
    const doc = createDocument('<html><body><script></script><img src="/img.png"><a href="/page">Link</a><img srcset="/a.png 1x, /b.png 2x" data-src="/lazy.png"></body></html>');
    preprocessDocument(doc, 'https://example.com/base/');
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('https://example.com/img.png');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.com/page');
    expect(doc.querySelector('[srcset]')?.getAttribute('srcset')).toContain('https://example.com/a.png 1x');
    expect(doc.querySelector('[data-src]')?.getAttribute('data-src')).toBe('https://example.com/lazy.png');
  });

  it('cleans ad selectors, removable attributes, and tolerates invalid selectors', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = createDocument('<html><body><div class="ad">ad</div><button onclick="alert(1)" data-track="x">ok</button></body></html>');
    removeAdsAndTracking(doc);
    cleanupAttributes(doc);
    expect(doc.querySelector('.ad')).toBeNull();
    expect(doc.querySelector('button')?.hasAttribute('onclick')).toBe(false);
    expect(doc.querySelector('button')?.hasAttribute('data-track')).toBe(false);
    preprocessDocumentFull(doc, 'https://example.com');
    expect(consoleWarnSpy).not.toHaveBeenCalledWith('Invalid selector:', expect.anything(), expect.anything());
    consoleWarnSpy.mockRestore();
  });
});
