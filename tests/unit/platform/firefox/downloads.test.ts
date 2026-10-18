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

describe('firefox downloads adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('propagates reveal errors and rejects an unavailable downloads API', async () => {
    const show = vi.fn().mockRejectedValue(new Error('Missing file'));
    vi.stubGlobal('browser', { downloads: { show } });
    const { firefoxDownloadsService } = await import('../../../../src/platform/firefox/downloads');
    await expect(firefoxDownloadsService.show?.(9)).rejects.toThrow('Missing file');
    expect(show).toHaveBeenCalledWith(9);
    vi.stubGlobal('browser', {});
    await expect(firefoxDownloadsService.show?.(9)).rejects.toThrow('is not available');
  });

  it('waits for a completed download and keeps its object URL alive beyond 30 seconds', async () => {
    let state = 'in_progress';
    const listeners = new Set<() => void>();
    const revoke = vi.fn();
    vi.stubGlobal('browser', {
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
    const { firefoxDownloadsService } = await import('../../../../src/platform/firefox/downloads');
    let settled = false;
    const pending = firefoxDownloadsService.download({ filename: 'note.md', content: '# saved' });
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
    const downloadApiMock = vi.fn().mockResolvedValue('download-id');
    const createObjectURLMock = vi.fn(() => 'blob:firefox-shot');
    const revokeObjectURLMock = vi.fn();

    vi.stubGlobal('browser', {
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

    const { firefoxDownloadsService } = await import('../../../../src/platform/firefox/downloads');
    const blob = new Blob(['aaa'], { type: 'image/jpeg' });

    await expect(
      firefoxDownloadsService.download({
        filename: 'attachments/shot.jpg',
        blob,
        mimeType: 'image/jpeg'
      })
    ).resolves.toEqual({ state: 'complete', id: 'download-id', filename: 'note.md' });

    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(downloadApiMock).toHaveBeenCalledWith({
      url: 'blob:firefox-shot',
      filename: 'attachments/shot.jpg',
      saveAs: false,
      conflictAction: 'uniquify'
    });
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:firefox-shot');
  });

  it('falls back to an adapter-local data URL when blob downloads cannot create object URLs', async () => {
    const downloadApiMock = vi.fn().mockResolvedValue('fallback-id');

    vi.stubGlobal('browser', {
      downloads: {
        download: downloadApiMock,
        search: vi.fn().mockResolvedValue([{ state: 'complete', filename: 'note.md' }]),
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
      }
    });
    vi.stubGlobal('URL', createUrlConstructor());
    vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));

    const { firefoxDownloadsService } = await import('../../../../src/platform/firefox/downloads');

    await expect(
      firefoxDownloadsService.download({
        filename: 'attachments/fallback.jpg',
        blob: new Blob(['bbb'], { type: 'image/jpeg' }),
        mimeType: 'image/jpeg'
      })
    ).resolves.toEqual({ state: 'complete', id: 'fallback-id', filename: 'note.md' });

    expect(downloadApiMock).toHaveBeenCalledWith({
      url: 'data:image/jpeg;base64,YmJi',
      filename: 'attachments/fallback.jpg',
      saveAs: false,
      conflictAction: 'uniquify'
    });
  });
});
