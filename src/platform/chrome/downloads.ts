import type { DownloadTextFileOptions, DownloadsService } from '../interfaces/downloads';
import { serializeBlobAttachmentContent } from '../../shared/attachments/clipAttachmentBinary';

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

async function createBlobDownloadUrl(
  blob: Blob,
  mimeType: string
): Promise<{ url: string; revoke(): void }> {
  if (typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob);
    return {
      url,
      revoke: () => URL.revokeObjectURL(url)
    };
  }

  const serialized = await serializeBlobAttachmentContent(blob);
  return {
    url: `data:${mimeType};base64,${serialized.data}`,
    revoke: () => undefined
  };
}

async function createDownloadResource(
  options: DownloadTextFileOptions
): Promise<{ url: string; revoke(): void }> {
  if (options.url !== undefined) {
    return { url: options.url, revoke: () => undefined };
  }
  if (options.blob !== undefined) {
    return createBlobDownloadUrl(
      options.blob,
      (options.mimeType ?? options.blob.type) || 'application/octet-stream'
    );
  }
  return createDownloadUrl(options.content ?? '', options.mimeType ?? 'text/plain;charset=utf-8');
}

export const chromeDownloadsService: DownloadsService = {
  async download(options: DownloadTextFileOptions): Promise<number | undefined> {
    if (!chrome?.downloads?.download) {
      throw new Error('chrome.downloads.download is not available.');
    }

    const resource = await createDownloadResource(options);
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
