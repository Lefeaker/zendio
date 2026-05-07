import type { DownloadTextFileOptions, DownloadsService } from '../interfaces/downloads';

function createDownloadUrl(content: string, mimeType: string): { url: string; revoke(): void } {
  if (typeof Blob !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    return {
      url,
      revoke: () => URL.revokeObjectURL(url)
    };
  }

  return {
    url: `data:${mimeType},${encodeURIComponent(content)}`,
    revoke: () => undefined
  };
}

export const chromeDownloadsService: DownloadsService = {
  async download(options: DownloadTextFileOptions): Promise<number | undefined> {
    if (!chrome?.downloads?.download) {
      throw new Error('chrome.downloads.download is not available.');
    }

    const resource =
      options.url !== undefined
        ? { url: options.url, revoke: () => undefined }
        : createDownloadUrl(options.content ?? '', options.mimeType ?? 'text/plain;charset=utf-8');
    try {
      return await chrome.downloads.download({
        url: resource.url,
        filename: options.filename,
        saveAs: false,
        conflictAction: 'uniquify'
      });
    } finally {
      setTimeout(() => resource.revoke(), 30_000);
    }
  }
};
