import {
  withRequestDeadline,
  type RequestDeadlineOptions
} from '../../shared/utils/requestDeadline';
import { DOWNLOAD_TIMEOUT_MS, waitForDownloadCompletion } from '../downloadCompletion';
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
  async cancel(id) {
    await chrome.downloads?.cancel(Number(id));
  },
  async inspect(id) {
    const items = await chrome.downloads?.search({ id: Number(id) });
    const item = items?.[0];
    return item
      ? {
          state: item.state,
          filename: item.filename,
          ...(typeof item.exists === 'boolean' ? { exists: item.exists } : {})
        }
      : undefined;
  },
  onChanged(listener) {
    chrome.downloads?.onChanged.addListener(listener);
    return () => chrome.downloads?.onChanged.removeListener(listener);
  },
  async show(id) {
    if (!chrome.downloads?.show) throw new Error('chrome.downloads.show is not available.');
    const [item] = await chrome.downloads.search({ id: Number(id) });
    if (!item || item.state !== 'complete' || item.exists === false)
      throw new Error('Saved download is no longer available.');
    // Chrome show() has no completion callback; this only requests the system file manager.
    chrome.downloads.show(Number(id));
  },
  async download(options: DownloadTextFileOptions, requestOptions: RequestDeadlineOptions = {}) {
    if (!chrome?.downloads?.download) {
      throw new Error('chrome.downloads.download is not available.');
    }

    return withRequestDeadline(DOWNLOAD_TIMEOUT_MS, requestOptions, async (request) => {
      const resource = await createDownloadResource(options);
      let revoked = false;
      const revoke = () => {
        if (revoked) return;
        revoked = true;
        resource.revoke();
      };
      request.signal.addEventListener('abort', revoke, { once: true });
      try {
        request.check();
        const id = await chrome.downloads.download({
          url: resource.url,
          filename: options.filename,
          saveAs: false,
          conflictAction: 'uniquify'
        });
        try {
          request.check();
        } catch (error) {
          // Native creation can return its own ID after the request already ended.
          if (id !== undefined) void chromeDownloadsService.cancel?.(id).catch(() => undefined);
          throw error;
        }
        return await waitForDownloadCompletion(chromeDownloadsService, id, request);
      } finally {
        request.signal.removeEventListener('abort', revoke);
        revoke();
      }
    });
  }
};
