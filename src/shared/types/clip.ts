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

export interface ClipResultMessage {
  type: 'CLIP_RESULT';
  payload: ClipPayload;
}

export interface SupportPromptMessage {
  type: typeof SHOW_SUPPORT_PROMPT;
  source?: string;
  vaultName?: string;
  status?: 'success' | 'failure' | 'warning';
  errorMessage?: string;
  error?: AppError;
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
    candidate.status !== undefined
    && candidate.status !== 'success'
    && candidate.status !== 'failure'
    && candidate.status !== 'warning'
  ) {
    return false;
  }
  if (candidate.errorMessage !== undefined && typeof candidate.errorMessage !== 'string') {
    return false;
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
  | TestConnectionMessage
  | TestVaultConnectionMessage;

export function isClipResultMessage(message: unknown): message is ClipResultMessage {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'CLIP_RESULT';
}

export function isClipErrorMessage(message: unknown): message is ClipErrorMessage {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'CLIP_ERROR';
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

export function isTestVaultConnectionMessage(message: unknown): message is TestVaultConnectionMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown; vaultId?: unknown };
  return candidate.type === 'TEST_VAULT_CONNECTION' && typeof candidate.vaultId === 'string' && candidate.vaultId.length > 0;
}
