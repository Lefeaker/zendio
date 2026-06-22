import {
  isLegacyDataUrlForMimeType,
  serializeBlobAttachmentContent
} from '../../shared/attachments/clipAttachmentBinary';
import type { ClipAttachment } from '../../shared/types';
import type { VideoCaptureScreenshot } from './types';

export async function serializeVideoScreenshotAttachment(
  screenshot: VideoCaptureScreenshot
): Promise<ClipAttachment | null> {
  if (screenshot.content?.kind === 'blob') {
    try {
      return {
        id: screenshot.id,
        fileName: screenshot.fileName,
        mimeType: screenshot.mimeType,
        content: await serializeBlobAttachmentContent(screenshot.content.blob)
      };
    } catch {
      // Firefox can expose page-owned Blob objects through Xray wrappers. Fall through to the
      // JSON-safe data URL captured at the provider boundary when available.
    }
  }

  if (isLegacyDataUrlForMimeType(screenshot.dataUrl, screenshot.mimeType)) {
    return {
      id: screenshot.id,
      fileName: screenshot.fileName,
      mimeType: screenshot.mimeType,
      dataUrl: screenshot.dataUrl
    };
  }

  return null;
}
