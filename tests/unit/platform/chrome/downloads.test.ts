import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('chrome downloads adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('downloads blob attachments through an object URL and revokes it after the delay', async () => {
    const downloadApiMock = vi.fn().mockResolvedValue(17);
    const createObjectURLMock = vi.fn(() => 'blob:chrome-shot');
    const revokeObjectURLMock = vi.fn();

    vi.stubGlobal('chrome', {
      downloads: {
        download: downloadApiMock
      }
    });
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock
    });

    const { chromeDownloadsService } = await import('../../../../src/platform/chrome/downloads');
    const blob = new Blob(['aaa'], { type: 'image/jpeg' });

    await expect(
      chromeDownloadsService.download({
        filename: 'attachments/shot.jpg',
        blob,
        mimeType: 'image/jpeg'
      })
    ).resolves.toBe(17);

    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(downloadApiMock).toHaveBeenCalledWith({
      url: 'blob:chrome-shot',
      filename: 'attachments/shot.jpg',
      saveAs: false,
      conflictAction: 'uniquify'
    });
    expect(revokeObjectURLMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:chrome-shot');
  });

  it('falls back to an adapter-local data URL when blob downloads cannot create object URLs', async () => {
    const downloadApiMock = vi.fn().mockResolvedValue(23);

    vi.stubGlobal('chrome', {
      downloads: {
        download: downloadApiMock
      }
    });
    vi.stubGlobal('URL', {});
    vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));

    const { chromeDownloadsService } = await import('../../../../src/platform/chrome/downloads');

    await expect(
      chromeDownloadsService.download({
        filename: 'attachments/fallback.jpg',
        blob: new Blob(['bbb'], { type: 'image/jpeg' }),
        mimeType: 'image/jpeg'
      })
    ).resolves.toBe(23);

    expect(downloadApiMock).toHaveBeenCalledWith({
      url: 'data:image/jpeg;base64,YmJi',
      filename: 'attachments/fallback.jpg',
      saveAs: false,
      conflictAction: 'uniquify'
    });
  });
});
