import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('firefox downloads adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('downloads blob attachments through an object URL and revokes it after the delay', async () => {
    const downloadApiMock = vi.fn().mockResolvedValue('download-id');
    const createObjectURLMock = vi.fn(() => 'blob:firefox-shot');
    const revokeObjectURLMock = vi.fn();

    vi.stubGlobal('browser', {
      downloads: {
        download: downloadApiMock
      }
    });
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock
    });

    const { firefoxDownloadsService } =
      await import('../../../../src/platform/firefox/downloads');
    const blob = new Blob(['aaa'], { type: 'image/jpeg' });

    await expect(
      firefoxDownloadsService.download({
        filename: 'attachments/shot.jpg',
        blob,
        mimeType: 'image/jpeg'
      })
    ).resolves.toBe('download-id');

    expect(createObjectURLMock).toHaveBeenCalledWith(blob);
    expect(downloadApiMock).toHaveBeenCalledWith({
      url: 'blob:firefox-shot',
      filename: 'attachments/shot.jpg',
      saveAs: false,
      conflictAction: 'uniquify'
    });
    expect(revokeObjectURLMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:firefox-shot');
  });

  it('falls back to an adapter-local data URL when blob downloads cannot create object URLs', async () => {
    const downloadApiMock = vi.fn().mockResolvedValue('fallback-id');

    vi.stubGlobal('browser', {
      downloads: {
        download: downloadApiMock
      }
    });
    vi.stubGlobal('URL', {});
    vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));

    const { firefoxDownloadsService } =
      await import('../../../../src/platform/firefox/downloads');

    await expect(
      firefoxDownloadsService.download({
        filename: 'attachments/fallback.jpg',
        blob: new Blob(['bbb'], { type: 'image/jpeg' }),
        mimeType: 'image/jpeg'
      })
    ).resolves.toBe('fallback-id');

    expect(downloadApiMock).toHaveBeenCalledWith({
      url: 'data:image/jpeg;base64,YmJi',
      filename: 'attachments/fallback.jpg',
      saveAs: false,
      conflictAction: 'uniquify'
    });
  });
});
