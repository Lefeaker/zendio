import type { AppError } from '../../shared/errors';
import type { LocalVaultPermissionPromptMessage } from '../../shared/types';

const SHOW_SUPPORT_PROMPT = 'SHOW_SUPPORT_PROMPT';
const SHOW_LOCAL_VAULT_PERMISSION_PROMPT = 'SHOW_LOCAL_VAULT_PERMISSION_PROMPT';
const SUPPORT_PROMPT_STATUSES = ['success', 'failure', 'warning', 'progress'] as const;

export type SupportPromptStatus = 'success' | 'failure' | 'warning' | 'progress';

export interface SupportPromptOptions {
  vaultName?: string;
  status?: SupportPromptStatus;
  error?: AppError;
  errorMessage?: string;
  progress?: {
    value: number;
    label?: string;
    variant?: 'progress' | 'success' | 'failure' | 'warning';
  };
}

export interface SupportPromptMessage {
  type: typeof SHOW_SUPPORT_PROMPT;
  vaultName?: string;
  status?: SupportPromptStatus;
  error?: unknown;
  errorMessage?: string;
  progress?: SupportPromptOptions['progress'];
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

  return (
    candidate.type === SHOW_LOCAL_VAULT_PERMISSION_PROMPT &&
    typeof candidate.folderId === 'string' &&
    candidate.folderId.length > 0 &&
    (candidate.folderName === undefined || typeof candidate.folderName === 'string') &&
    (candidate.vaultName === undefined || typeof candidate.vaultName === 'string')
  );
}

export function isSupportPromptMessage(message: unknown): message is SupportPromptMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as {
    type?: unknown;
    vaultName?: unknown;
    status?: unknown;
    errorMessage?: unknown;
    progress?: unknown;
  };
  const progress = candidate.progress as
    | {
        value?: unknown;
        label?: unknown;
        variant?: unknown;
      }
    | undefined;

  return (
    candidate.type === SHOW_SUPPORT_PROMPT &&
    (candidate.vaultName === undefined || typeof candidate.vaultName === 'string') &&
    (candidate.status === undefined ||
      SUPPORT_PROMPT_STATUSES.includes(candidate.status as never)) &&
    (candidate.errorMessage === undefined || typeof candidate.errorMessage === 'string') &&
    (candidate.progress === undefined ||
      (typeof candidate.progress === 'object' &&
        candidate.progress !== null &&
        typeof progress?.value === 'number' &&
        (progress.label === undefined || typeof progress.label === 'string') &&
        (progress.variant === undefined ||
          SUPPORT_PROMPT_STATUSES.includes(progress.variant as never))))
  );
}
