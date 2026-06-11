import type { VaultConfig } from './vault';
import type { RestOptions } from './options';
import type { AppError } from '../errors/types';
import type { SerializedClipAttachmentBinaryContent } from '../attachments/clipAttachmentBinary';
import { isNonEmptyString, isObjectRecord, isOptionalString } from '../guards';

export interface LegacyDataUrlClipAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  capturedAt?: number;
}

export interface BinaryClipAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  content: SerializedClipAttachmentBinaryContent;
  capturedAt?: number;
}

export type ClipAttachment = LegacyDataUrlClipAttachment | BinaryClipAttachment;

export interface ClipMeta {
  url?: string;
  domain?: string;
  platform?: string;
  sourceUrl?: string;
  resolvedUrl?: string;
  createdAt?: string;
  attachments?: ClipAttachment[];
  [key: string]: unknown;
}

export interface ClipPayload {
  markdown: string;
  title?: string;
  type?: string;
  meta?: ClipMeta;
  [key: string]: unknown;
}

export const SHOW_SUPPORT_PROMPT = 'SHOW_SUPPORT_PROMPT';
export const SHOW_LOCAL_VAULT_PERMISSION_PROMPT = 'SHOW_LOCAL_VAULT_PERMISSION_PROMPT';

export interface SupportPromptProgress {
  value: number;
  label?: string;
  variant?: 'progress' | 'success' | 'failure' | 'warning';
}

export interface ClipResultMessage {
  type: 'CLIP_RESULT';
  payload: ClipPayload;
}

export interface SupportPromptMessage {
  type: typeof SHOW_SUPPORT_PROMPT;
  source?: string;
  vaultName?: string;
  status?: 'success' | 'failure' | 'warning' | 'progress';
  errorMessage?: string;
  error?: AppError;
  progress?: SupportPromptProgress;
}

export interface LocalVaultPermissionPromptMessage {
  type: typeof SHOW_LOCAL_VAULT_PERMISSION_PROMPT;
  folderId: string;
  folderName?: string;
  vaultName?: string;
}

export interface LocalVaultPermissionPromptResponse {
  action: 'granted' | 'use-rest' | 'cancelled';
  permissionState?: 'granted' | 'prompt' | 'denied' | 'missing' | 'unsupported';
  persistRest?: boolean;
  errorMessage?: string;
}

export function isLocalVaultPermissionPromptMessage(
  message: unknown
): message is LocalVaultPermissionPromptMessage {
  if (!isObjectRecord(message)) {
    return false;
  }

  if (message.type !== SHOW_LOCAL_VAULT_PERMISSION_PROMPT) {
    return false;
  }
  if (!isNonEmptyString(message.folderId)) {
    return false;
  }
  if (!isOptionalString(message.folderName)) {
    return false;
  }
  if (!isOptionalString(message.vaultName)) {
    return false;
  }
  return true;
}

function isSupportPromptStatus(value: unknown): value is SupportPromptMessage['status'] {
  return value === 'success' || value === 'failure' || value === 'warning' || value === 'progress';
}

function isSupportPromptProgressVariant(
  value: unknown
): value is NonNullable<SupportPromptProgress['variant']> {
  return value === 'progress' || value === 'success' || value === 'failure' || value === 'warning';
}

export function isSupportPromptMessage(message: unknown): message is SupportPromptMessage {
  if (!isObjectRecord(message)) {
    return false;
  }

  if (message.type !== SHOW_SUPPORT_PROMPT) {
    return false;
  }

  if (!isOptionalString(message.source)) {
    return false;
  }
  if (!isOptionalString(message.vaultName)) {
    return false;
  }
  if (message.status !== undefined && !isSupportPromptStatus(message.status)) {
    return false;
  }
  if (!isOptionalString(message.errorMessage)) {
    return false;
  }
  if (message.progress !== undefined) {
    if (!isObjectRecord(message.progress)) {
      return false;
    }
    const progress = message.progress;
    if (typeof progress.value !== 'number') {
      return false;
    }
    if (!isOptionalString(progress.label)) {
      return false;
    }
    if (progress.variant !== undefined && !isSupportPromptProgressVariant(progress.variant)) {
      return false;
    }
  }

  return true;
}

export interface ClipErrorMessage {
  type: 'CLIP_ERROR';
  error: unknown;
}

export interface TestConnectionMessage {
  type: 'TEST_CONNECTION';
  rest?: Partial<RestOptions>;
}

export interface TestVaultConnectionMessage {
  type: 'TEST_VAULT_CONNECTION';
  vaultId: string;
  vault?: VaultConfig;
}

export type RuntimeMessage =
  | ClipResultMessage
  | ClipErrorMessage
  | LocalVaultPermissionPromptMessage
  | TestConnectionMessage
  | TestVaultConnectionMessage;

export function isClipResultMessage(message: unknown): message is ClipResultMessage {
  return isObjectRecord(message) && message.type === 'CLIP_RESULT';
}

export function isClipErrorMessage(message: unknown): message is ClipErrorMessage {
  return isObjectRecord(message) && message.type === 'CLIP_ERROR';
}

export function isTestConnectionMessage(message: unknown): message is TestConnectionMessage {
  if (!isObjectRecord(message)) {
    return false;
  }

  if (message.type !== 'TEST_CONNECTION') {
    return false;
  }

  if (message.rest === undefined) {
    return true;
  }

  if (!isObjectRecord(message.rest)) {
    return false;
  }

  return true;
}

export function isTestVaultConnectionMessage(
  message: unknown
): message is TestVaultConnectionMessage {
  if (!isObjectRecord(message)) {
    return false;
  }

  return message.type === 'TEST_VAULT_CONNECTION' && isNonEmptyString(message.vaultId);
}
