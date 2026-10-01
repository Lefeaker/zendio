import { afterEach, describe, expect, it, vi } from 'vitest';

describe.each(['chrome', 'firefox'])('%s download observation', (platform) => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads final state and filename, unsubscribes, and reveals the actual download ID', async () => {
    const downloads = {
      search: vi.fn(() =>
        Promise.resolve([{ state: 'complete', filename: '/Downloads/note (1).md' }])
      ),
      show: vi.fn(() => Promise.resolve()),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
    };
    vi.stubGlobal(platform === 'chrome' ? 'chrome' : 'browser', { downloads });
    const service =
      platform === 'chrome'
        ? (await import('../../../src/platform/chrome/downloads')).chromeDownloadsService
        : (await import('../../../src/platform/firefox/downloads')).firefoxDownloadsService;
    expect(await service.inspect?.('42')).toEqual({
      state: 'complete',
      filename: '/Downloads/note (1).md'
    });
    expect(downloads.search).toHaveBeenCalledWith({ id: 42 });
    const listener = vi.fn();
    const stop = service.onChanged?.(listener);
    expect(downloads.onChanged.addListener).toHaveBeenCalledWith(listener);
    stop?.();
    expect(downloads.onChanged.removeListener).toHaveBeenCalledWith(listener);
    await service.show?.('42');
    expect(downloads.show).toHaveBeenCalledWith(42);
    downloads.search.mockResolvedValueOnce([]);
    expect(await service.inspect?.(42)).toBeUndefined();
  });
});
