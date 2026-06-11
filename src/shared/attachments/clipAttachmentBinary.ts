import { isObjectRecord } from '../guards';

export interface SerializedClipAttachmentBinaryContent {
  encoding: 'base64';
  data: string;
  byteLength: number;
}

export type SerializedClipAttachmentContent =
  | { kind: 'legacyDataUrl'; dataUrl: string }
  | { kind: 'base64'; binary: SerializedClipAttachmentBinaryContent };

const LEGACY_DATA_URL_PATTERN = /^data:([^;,]+);base64,(.+)$/u;

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

function decodeBase64ToBytes(base64: string): Uint8Array {
  if (typeof globalThis.atob !== 'function') {
    throw new Error('Base64 decoding is unavailable in this runtime.');
  }

  let binary: string;
  try {
    binary = globalThis.atob(base64);
  } catch {
    throw new Error('Invalid base64 attachment content.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function serializedAttachmentContentToBlob(
  content: SerializedClipAttachmentContent,
  mimeType: string
): Blob {
  if (content.kind === 'legacyDataUrl') {
    if (!isLegacyDataUrlForMimeType(content.dataUrl, mimeType)) {
      throw new Error('Invalid attachment data URL.');
    }
    const match = LEGACY_DATA_URL_PATTERN.exec(content.dataUrl);
    if (!match) {
      throw new Error('Invalid attachment data URL.');
    }
    const [, dataUrlMimeType, base64] = match;
    return new Blob([copyBytesToArrayBuffer(decodeBase64ToBytes(base64))], {
      type: dataUrlMimeType || mimeType
    });
  }

  const bytes = decodeBase64ToBytes(content.binary.data);
  if (bytes.byteLength !== content.binary.byteLength) {
    throw new Error('Attachment byteLength does not match decoded content.');
  }
  return new Blob([copyBytesToArrayBuffer(bytes)], { type: mimeType });
}
