import type { ClipAttachment } from '../../shared/types';
import { serializeBlobAttachmentContent } from '../../shared/attachments/clipAttachmentBinary';
import type { VideoTimestampCapture } from './types';

type SerializedVideoScreenshotAttachments = {
  attachments: ClipAttachment[];
  attachmentIds: Set<string>;
};

async function serializeVideoScreenshotAttachment(
  capture: VideoTimestampCapture
): Promise<ClipAttachment | null> {
  const screenshot = capture.screenshot;
  if (!screenshot) {
    return null;
  }

  if (screenshot.content?.kind === 'blob') {
    try {
      return {
        id: screenshot.id,
        fileName: screenshot.fileName,
        mimeType: screenshot.mimeType,
        content: await serializeBlobAttachmentContent(screenshot.content.blob)
      };
    } catch {
      return null;
    }
  }

  if (typeof screenshot.dataUrl === 'string') {
    return {
      id: screenshot.id,
      fileName: screenshot.fileName,
      mimeType: screenshot.mimeType,
      dataUrl: screenshot.dataUrl
    };
  }

  return null;
}

export async function serializeVideoScreenshotAttachments(
  captures: readonly VideoTimestampCapture[]
): Promise<SerializedVideoScreenshotAttachments> {
  const attachments = (
    await Promise.all(captures.map((capture) => serializeVideoScreenshotAttachment(capture)))
  ).filter((attachment): attachment is ClipAttachment => attachment !== null);

  return {
    attachments,
    attachmentIds: new Set(attachments.map((attachment) => attachment.id))
  };
}
