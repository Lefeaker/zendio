import { isObjectRecord } from '../guards';

export interface SerializedClipAttachmentBinaryContent {
  encoding: 'base64';
  data: string;
  byteLength: number;
}

export type SerializedClipAttachmentContent =
  | { kind: 'legacyDataUrl'; dataUrl: string }
  | { kind: 'base64'; binary: SerializedClipAttachmentBinaryContent };

export function isSerializedClipAttachmentBinaryContent(
  value: unknown
): value is SerializedClipAttachmentBinaryContent {
  if (!isObjectRecord(value)) {
    return false;
  }

  const { encoding, data, byteLength } = value;

  return (
    encoding === 'base64' &&
    typeof data === 'string' &&
    typeof byteLength === 'number' &&
    Number.isInteger(byteLength) &&
    byteLength >= 0
  );
}

export function isLegacyDataUrlForMimeType(value: unknown, mimeType: string): value is string {
  return typeof value === 'string' && value.startsWith(`data:${mimeType};base64,`);
}
