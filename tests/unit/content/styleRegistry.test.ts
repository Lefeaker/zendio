/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearClipperStyleCache,
  contentStylePackPath,
  loadContentStylePack,
  loadExtensionStyle
} from '@content/clipper/shared/styleRegistry';

const originalUserAgent = navigator.userAgent;

function setUserAgent(value: string): void {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value });
}

describe('styleRegistry', () => {
  afterEach(() => {
    clearClipperStyleCache();
    setUserAgent(originalUserAgent);
    vi.unstubAllGlobals();
  });

  it('maps the closed pack enum to exact flattened asset paths', () => {
    expect(contentStylePackPath('clipper')).toBe('ui/stitch-runtime/styles/clipper.css');
    expect(contentStylePackPath('reader')).toBe('ui/stitch-runtime/styles/reader.css');
    expect(contentStylePackPath('video')).toBe('ui/stitch-runtime/styles/video.css');
    expect(contentStylePackPath('prompt-task')).toBe('ui/stitch-runtime/styles/prompt-task.css');
  });

  it('returns an empty stylesheet in jsdom instead of fetching relative URLs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadContentStylePack('clipper')).resolves.toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deduplicates a flattened pack request without a no-store override', async () => {
    setUserAgent('Zendio browser test');
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve('.pack{}') } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const first = loadExtensionStyle('ui/stitch-runtime/styles/reader.css');
    const second = loadExtensionStyle('ui/stitch-runtime/styles/reader.css');
    await expect(Promise.all([first, second])).resolves.toEqual(['.pack{}', '.pack{}']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('ui/stitch-runtime/styles/reader.css');
  });

  it('evicts rejected and non-flattened cache entries for one explicit retry', async () => {
    setUserAgent('Zendio browser test');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'fail' } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('@import "other.css";')
      } as Response)
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('.retry{}') } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadContentStylePack('video')).rejects.toThrow('Failed to load style');
    await expect(loadContentStylePack('video')).rejects.toThrow('is not flattened');
    await expect(loadContentStylePack('video')).resolves.toBe('.retry{}');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
