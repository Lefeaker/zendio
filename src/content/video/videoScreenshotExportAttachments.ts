import type { ClipAttachment } from '../../shared/types';
import type { VideoTimestampCapture } from './types';
import { serializeVideoScreenshotAttachment as serializeScreenshotAttachment } from './videoScreenshotAttachmentSerialization';

type SerializedVideoScreenshotAttachments = {
  attachments: ClipAttachment[];
  attachmentIds: Set<string>;
};

async function serializeCaptureScreenshotAttachment(
  capture: VideoTimestampCapture
): Promise<ClipAttachment | null> {
  const screenshot = capture.screenshot;
  if (!screenshot) {
    return null;
  }

  return serializeScreenshotAttachment(screenshot);
}

export async function serializeVideoScreenshotAttachments(
  captures: readonly VideoTimestampCapture[]
): Promise<SerializedVideoScreenshotAttachments> {
  const attachments = (
    await Promise.all(captures.map((capture) => serializeCaptureScreenshotAttachment(capture)))
  ).filter((attachment): attachment is ClipAttachment => attachment !== null);

  return {
    attachments,
    attachmentIds: new Set(attachments.map((attachment) => attachment.id))
  };
}
