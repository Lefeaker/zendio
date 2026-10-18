import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createUrlConstructor(
  methods: Partial<Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>> = {}
): typeof URL {
  class TestURL extends URL {}
  Object.defineProperties(TestURL, {
    createObjectURL: {
      configurable: true,
      value: methods.createObjectURL
    },
    revokeObjectURL: {
      configurable: true,
      value: methods.revokeObjectURL
    }
  });
  return TestURL as typeof URL;
}

describe('chrome downloads adapter', () => {
  it.each([true, false])(
    'exposes actual file existence %s for continuation checks',
    async (exists) => {
      vi.stubGlobal('chrome', {
        downloads: {
          search: vi
            .fn()
            .mockResolvedValue([{ state: 'complete', filename: '/downloads/one.jpg', exists }])
        }
      });
      const { chromeDownloadsService } = await import('../../../../src/platform/chrome/downloads');
      await expect(chromeDownloadsService.inspect?.(1)).resolves.toEqual({
        state: 'complete',
        filename: '/downloads/one.jpg',
        exists
      });
    }
  );
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('propagates reveal errors and rejects an unavailable downloads API', async () => {
    const show = vi.fn(() => {
      throw new Error('Missing file');
    });
    const search = vi.fn().mockResolvedValue([{ state: 'complete', exists: true }]);
    vi.stubGlobal('chrome', { downloads: { show, search } });
    const { chromeDownloadsService } = await import('../../../../src/platform/chrome/downloads');
    await expect(chromeDownloadsService.show?.(9)).rejects.toThrow('Missing file');
    expect(show).toHaveBeenCalledWith(9);
    search.mockResolvedValue([]);
    await expect(chromeDownloadsService.show?.(9)).rejects.toThrow('no longer available');
    vi.stubGlobal('chrome', {});
    await expect(chromeDownloadsService.show?.(9)).rejects.toThrow('is not available');
  });

  it('waits for a completed download and keeps its object URL alive beyond 30 seconds', async () => {
    let state = 'in_progress';
    const listeners = new Set<() => void>();
    const revoke = vi.fn();
    vi.stubGlobal('chrome', {
      downloads: {
        download: vi.fn().mockResolvedValue(41),
        search: vi.fn(() => Promise.resolve([{ state, filename: '/downloads/note (1).md' }])),
        cancel: vi.fn(),
        onChanged: {
          addListener: (listener: () => void) => listeners.add(listener),
          removeListener: (listener: () => void) => listeners.delete(listener)
        }
      }
    });
    vi.stubGlobal(
      'URL',
      createUrlConstructor({ createObjectURL: () => 'blob:pending', revokeObjectURL: revoke })
    );
    const { chromeDownloadsService } = await import('../../../../src/platform/chrome/downloads');
    let settled = false;
    const pending = chromeDownloadsService.download({ filename: 'note.md', content: '# saved' });
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(30_001);
    expect(settled).toBe(false);
    expect(revoke).not.toHaveBeenCalled();
    state = 'complete';
    for (const listener of listeners) listener();
    await expect(pending).resolves.toEqual({
      state: 'complete',
      id: 41,
      filename: '/downloads/note (1).md'
    });
    expect(revoke).toHaveBeenCalledWith('blob:pending');
    expect(listeners.size).toBe(0);
  });

  it('downloads blob attachments through an object URL and revokes it after completion', async () => {
    const downloadApiMock = vi.fn().mockResolvedValue(17);
    const createObjectURLMock = vi.fn(() => 'blob:chrome-shot');
    const revokeObjectURLMock = vi.fn();

    vi.stubGlobal('chrome', {
      downloads: {
        download: downloadApiMock,
        search: vi.fn().mockResolvedValue([{ state: 'complete', filename: 'note.md' }]),
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
      }
    });
    vi.stubGlobal(
      'URL',
      createUrlConstructor({
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock
      })
    );

    const { chromeDownloadsService } = await import('../../../../src/platform/chrome/downloads');
    const blob = new Blob(['aaa'], { type: 'image/jpeg' });

    await expect(
      chromeDownloadsService.download({
        filename: 'attachments/shot.jpg',
        blob,
        mimeType: 'image/jpeg'
      })
    ).resolves.toEqual({ state: 'complete', id: 17, filename: 'note.md' });

    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(downloadApiMock).toHaveBeenCalledWith({
      url: 'blob:chrome-shot',
      filename: 'attachments/shot.jpg',
      saveAs: false,
      conflictAction: 'uniquify'
    });
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:chrome-shot');
  });

  it('falls back to an adapter-local data URL when blob downloads cannot create object URLs', async () => {
    const downloadApiMock = vi.fn().mockResolvedValue(23);

    vi.stubGlobal('chrome', {
      downloads: {
        download: downloadApiMock,
        search: vi.fn().mockResolvedValue([{ state: 'complete', filename: 'note.md' }]),
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
      }
    });
    vi.stubGlobal('URL', createUrlConstructor());
    vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));

    const { chromeDownloadsService } = await import('../../../../src/platform/chrome/downloads');

    await expect(
      chromeDownloadsService.download({
        filename: 'attachments/fallback.jpg',
        blob: new Blob(['bbb'], { type: 'image/jpeg' }),
        mimeType: 'image/jpeg'
      })
    ).resolves.toEqual({ state: 'complete', id: 23, filename: 'note.md' });

    expect(downloadApiMock).toHaveBeenCalledWith({
      url: 'data:image/jpeg;base64,YmJi',
      filename: 'attachments/fallback.jpg',
      saveAs: false,
      conflictAction: 'uniquify'
    });
  });
});
