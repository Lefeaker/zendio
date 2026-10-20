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
  it.each([true, false])(
    'exposes actual file existence %s for continuation checks',
    async (exists) => {
      vi.stubGlobal('browser', {
        downloads: {
          search: vi
            .fn()
            .mockResolvedValue([{ state: 'complete', filename: '/downloads/one.jpg', exists }])
        }
      });
      const { firefoxDownloadsService } =
        await import('../../../../src/platform/firefox/downloads');
      await expect(firefoxDownloadsService.inspect?.(1)).resolves.toEqual({
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
  it('bounds native creation, revokes its URL and cancels only a late returned ID', async () => {
    let release!: (id: number) => void;
    const native = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          release = resolve;
        })
    );
    const cancel = vi.fn().mockRejectedValue(new Error('native cancellation unavailable'));
    const revoke = vi.fn();
    vi.stubGlobal('browser', { downloads: { download: native, cancel } });
    vi.stubGlobal(
      'URL',
      createUrlConstructor({ createObjectURL: () => 'blob:late', revokeObjectURL: revoke })
    );
    const { firefoxDownloadsService } = await import('../../../../src/platform/firefox/downloads');
    const result = firefoxDownloadsService.download({ filename: 'late.md', content: '# late' });
    const rejected = expect(result).rejects.toMatchObject({ failureCategory: 'timeout' });
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:late');
    expect(cancel).not.toHaveBeenCalled();
    release(73);
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(73);
    expect(revoke).toHaveBeenCalledOnce();
    expect(native).toHaveBeenCalledOnce();
  });

  it('uses the remaining absolute budget for completion and cancels only its current ID', async () => {
    const listeners = new Set<() => void>();
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('browser', {
      downloads: {
        download: vi.fn().mockResolvedValue(27),
        cancel,
        search: vi.fn().mockResolvedValue([{ state: 'in_progress', filename: 'slow.md' }]),
        onChanged: {
          addListener: (listener: () => void) => listeners.add(listener),
          removeListener: (listener: () => void) => listeners.delete(listener)
        }
      }
    });
    const { firefoxDownloadsService } = await import('../../../../src/platform/firefox/downloads');
    const result = firefoxDownloadsService.download(
      { filename: 'slow.md', content: '# slow' },
      { deadlineAt: Date.now() + 40_000 }
    );
    const rejected = expect(result).rejects.toMatchObject({ failureCategory: 'timeout' });
    await vi.advanceTimersByTimeAsync(40_000);
    await rejected;
    expect(cancel).toHaveBeenCalledExactlyOnceWith(27);
    expect(listeners.size).toBe(0);
  });

  it('does not create a native download when blob preparation resolves after cancellation', async () => {
    let release!: (buffer: ArrayBuffer) => void;
    const blob = new Blob(['a']);
    vi.spyOn(blob, 'arrayBuffer').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const native = vi.fn();
    vi.stubGlobal('browser', { downloads: { download: native } });
    vi.stubGlobal('URL', createUrlConstructor());
    const { firefoxDownloadsService } = await import('../../../../src/platform/firefox/downloads');
    const controller = new AbortController();
    const result = firefoxDownloadsService.download(
      { filename: 'late.jpg', blob },
      { signal: controller.signal }
    );
    const rejected = expect(result).rejects.toMatchObject({ failureCategory: 'connection' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    release(new Uint8Array([97]).buffer);
    await vi.advanceTimersByTimeAsync(0);
    expect(native).not.toHaveBeenCalled();
  });
});
