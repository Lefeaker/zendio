import type { WriteLocalVaultFileOptions } from '../interfaces/fileSystemAccess';

export const LOCAL_VAULT_OFFSCREEN_PATH = 'offscreen/local-vault.html';
export const LOCAL_VAULT_WRITE_MESSAGE = 'AIIOB_LOCAL_VAULT_WRITE';

export type SerializedLocalVaultContent =
  | { kind: 'text'; text: string }
  | { kind: 'binary'; base64: string; contentType: string };

export interface LocalVaultWriteRequest {
  type: typeof LOCAL_VAULT_WRITE_MESSAGE;
  folderId: string;
  filePath: string;
  content: SerializedLocalVaultContent;
  contentType: string;
}

export interface LocalVaultWriteResponse {
  ok: boolean;
  error?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function serializeLocalVaultContent(
  content: WriteLocalVaultFileOptions['content'],
  contentType: string
): Promise<SerializedLocalVaultContent> {
  if (typeof content === 'string') {
    return { kind: 'text', text: content };
  }

  const arrayBuffer =
    content instanceof Blob
      ? await content.arrayBuffer()
      : content instanceof Uint8Array
        ? content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
        : content;
  return {
    kind: 'binary',
    base64: bytesToBase64(new Uint8Array(arrayBuffer)),
    contentType
  };
}

export function deserializeLocalVaultContent(
  content: SerializedLocalVaultContent
): string | Uint8Array {
  return content.kind === 'text' ? content.text : base64ToBytes(content.base64);
}

export function isLocalVaultWriteRequest(message: unknown): message is LocalVaultWriteRequest {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const candidate = message as Partial<LocalVaultWriteRequest>;
  if (
    candidate.type !== LOCAL_VAULT_WRITE_MESSAGE ||
    typeof candidate.folderId !== 'string' ||
    typeof candidate.filePath !== 'string' ||
    typeof candidate.contentType !== 'string' ||
    typeof candidate.content !== 'object' ||
    candidate.content === null
  ) {
    return false;
  }

  if (candidate.content.kind === 'text') {
    return typeof candidate.content.text === 'string';
  }
  return (
    candidate.content.kind === 'binary' &&
    typeof candidate.content.base64 === 'string' &&
    typeof candidate.content.contentType === 'string'
  );
}
