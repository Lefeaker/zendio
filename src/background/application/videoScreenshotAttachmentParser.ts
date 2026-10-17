import type { SerializedClipAttachmentContent } from '../../shared/attachments/clipAttachmentBinary';
import { hasUnresolvedClipAttachmentReferences } from '../../shared/attachments/clipAttachmentReferences';
import { ClipAttachmentsSchema } from '../../shared/schemas/clip.schema';
import type { ClipMeta } from '../../shared/types';

export type ParsedClipAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  content: SerializedClipAttachmentContent;
  capturedAt?: number;
};

export function parseVideoClipAttachments(
  value: ClipMeta['attachments'],
  markdown: string
): ParsedClipAttachment[] {
  const attachments = ClipAttachmentsSchema.parse(value === undefined ? [] : value);
  if (hasUnresolvedClipAttachmentReferences(markdown, attachments)) {
    throw new Error('CLIP_ATTACHMENT_REFERENCE_MISSING');
  }
  return attachments.map((attachment) => ({
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    content:
      'content' in attachment
        ? { kind: 'base64', binary: attachment.content }
        : { kind: 'legacyDataUrl', dataUrl: attachment.dataUrl },
    ...(attachment.capturedAt !== undefined ? { capturedAt: attachment.capturedAt } : {})
  }));
}
