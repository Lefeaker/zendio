import {
  type SerializedClipAttachmentContent,
  isLegacyDataUrlForMimeType,
  isSerializedClipAttachmentBinaryContent
} from '../../shared/attachments/clipAttachmentBinary';
import { isObjectRecord } from '../../shared/guards';
import type { ClipMeta } from '../../shared/types';

export type ParsedClipAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  content: SerializedClipAttachmentContent;
  capturedAt?: number;
};

function parseAttachmentContent(
  record: Record<string, unknown>
): SerializedClipAttachmentContent | null {
  if (isSerializedClipAttachmentBinaryContent(record.content)) {
    return { kind: 'base64', binary: record.content };
  }

  if (isLegacyDataUrlForMimeType(record.dataUrl, String(record.mimeType ?? ''))) {
    return { kind: 'legacyDataUrl', dataUrl: record.dataUrl };
  }

  return null;
}

export function parseVideoClipAttachments(value: ClipMeta['attachments']): ParsedClipAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): ParsedClipAttachment[] => {
    if (!isObjectRecord(item)) {
      return [];
    }

    const content = parseAttachmentContent(item);
    if (
      typeof item.id !== 'string' ||
      typeof item.fileName !== 'string' ||
      typeof item.mimeType !== 'string' ||
      content === null
    ) {
      return [];
    }

    return [
      {
        id: item.id,
        fileName: item.fileName,
        mimeType: item.mimeType,
        content,
        ...(typeof item.capturedAt === 'number' && Number.isFinite(item.capturedAt)
          ? { capturedAt: item.capturedAt }
          : {})
      }
    ];
  });
}
