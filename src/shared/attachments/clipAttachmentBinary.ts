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

const BASE64_CHUNK_SIZE = 0x8000;

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa !== 'function') {
    throw new Error('Base64 encoding is unavailable in this runtime.');
  }

  const binaryChunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
    let binary = '';
    for (let index = 0; index < chunk.length; index += 1) {
      binary += String.fromCharCode(chunk[index]);
    }
    binaryChunks.push(binary);
  }

  return globalThis.btoa(binaryChunks.join(''));
}

export async function serializeBlobAttachmentContent(
  blob: Blob
): Promise<SerializedClipAttachmentBinaryContent> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  return {
    encoding: 'base64',
    data: encodeBytesToBase64(bytes),
    byteLength: bytes.byteLength
  };
}
