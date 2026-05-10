import type { VaultConfig } from './vault';
import type { RestOptions } from './options';
import type { AppError } from '../errors/types';

export interface ClipMeta {
  url?: string;
  domain?: string;
  platform?: string;
  sourceUrl?: string;
  resolvedUrl?: string;
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
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as {
    type?: unknown;
    folderId?: unknown;
    folderName?: unknown;
    vaultName?: unknown;
  };

  if (candidate.type !== SHOW_LOCAL_VAULT_PERMISSION_PROMPT) {
    return false;
  }
  if (typeof candidate.folderId !== 'string' || candidate.folderId.length === 0) {
    return false;
  }
  if (candidate.folderName !== undefined && typeof candidate.folderName !== 'string') {
    return false;
  }
  if (candidate.vaultName !== undefined && typeof candidate.vaultName !== 'string') {
    return false;
  }
  return true;
}

export function isSupportPromptMessage(message: unknown): message is SupportPromptMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as {
    type?: unknown;
    source?: unknown;
    vaultName?: unknown;
    status?: unknown;
    errorMessage?: unknown;
    progress?: unknown;
  };

  if (candidate.type !== SHOW_SUPPORT_PROMPT) {
    return false;
  }

  if (candidate.source !== undefined && typeof candidate.source !== 'string') {
    return false;
  }
  if (candidate.vaultName !== undefined && typeof candidate.vaultName !== 'string') {
    return false;
  }
  if (
    candidate.status !== undefined &&
    candidate.status !== 'success' &&
    candidate.status !== 'failure' &&
    candidate.status !== 'warning' &&
    candidate.status !== 'progress'
  ) {
    return false;
  }
  if (candidate.errorMessage !== undefined && typeof candidate.errorMessage !== 'string') {
    return false;
  }
  if (candidate.progress !== undefined) {
    if (typeof candidate.progress !== 'object' || candidate.progress === null) {
      return false;
    }
    const progress = candidate.progress as {
      value?: unknown;
      label?: unknown;
      variant?: unknown;
    };
    if (typeof progress.value !== 'number') {
      return false;
    }
    if (progress.label !== undefined && typeof progress.label !== 'string') {
      return false;
    }
    if (
      progress.variant !== undefined &&
      progress.variant !== 'progress' &&
      progress.variant !== 'success' &&
      progress.variant !== 'failure' &&
      progress.variant !== 'warning'
    ) {
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
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'CLIP_RESULT'
  );
}

export function isClipErrorMessage(message: unknown): message is ClipErrorMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'CLIP_ERROR'
  );
}

export function isTestConnectionMessage(message: unknown): message is TestConnectionMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown; rest?: unknown };
  if (candidate.type !== 'TEST_CONNECTION') {
    return false;
  }

  if (candidate.rest === undefined) {
    return true;
  }

  if (typeof candidate.rest !== 'object' || candidate.rest === null) {
    return false;
  }

  return true;
}

export function isTestVaultConnectionMessage(
  message: unknown
): message is TestVaultConnectionMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown; vaultId?: unknown };
  return (
    candidate.type === 'TEST_VAULT_CONNECTION' &&
    typeof candidate.vaultId === 'string' &&
    candidate.vaultId.length > 0
  );
}
