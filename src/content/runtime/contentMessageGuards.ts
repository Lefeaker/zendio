import type { AppError } from '../../shared/errors';
import type { LocalVaultPermissionPromptMessage } from '../../shared/types';
import { isNonEmptyString, isObjectRecord, isOptionalString } from '../../shared/guards';
import {
  isUserVisibleMessageDescriptor,
  type UserVisibleMessageDescriptor
} from '../../shared/i18n/userVisibleMessageDescriptor';

const SHOW_SUPPORT_PROMPT = 'SHOW_SUPPORT_PROMPT';
const SHOW_LOCAL_VAULT_PERMISSION_PROMPT = 'SHOW_LOCAL_VAULT_PERMISSION_PROMPT';

export type SupportPromptStatus = 'success' | 'failure' | 'warning' | 'progress';

export interface SupportPromptOptions {
  vaultName?: string;
  status?: SupportPromptStatus;
  error?: AppError;
  errorMessage?: string;
  progress?: {
    value: number;
    label?: string;
    message?: UserVisibleMessageDescriptor;
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

function isSupportPromptStatus(value: unknown): value is SupportPromptStatus {
  return value === 'success' || value === 'failure' || value === 'warning' || value === 'progress';
}

export function isLocalVaultPermissionPromptMessage(
  message: unknown
): message is LocalVaultPermissionPromptMessage {
  if (!isObjectRecord(message)) {
    return false;
  }

  return (
    message.type === SHOW_LOCAL_VAULT_PERMISSION_PROMPT &&
    isNonEmptyString(message.folderId) &&
    isOptionalString(message.folderName) &&
    isOptionalString(message.vaultName)
  );
}

export function isSupportPromptMessage(message: unknown): message is SupportPromptMessage {
  if (!isObjectRecord(message)) {
    return false;
  }

  const progress = isObjectRecord(message.progress) ? message.progress : undefined;

  return (
    message.type === SHOW_SUPPORT_PROMPT &&
    isOptionalString(message.vaultName) &&
    (message.status === undefined || isSupportPromptStatus(message.status)) &&
    isOptionalString(message.errorMessage) &&
    (message.progress === undefined ||
      (progress !== undefined &&
        typeof progress?.value === 'number' &&
        isOptionalString(progress.label) &&
        (progress.message === undefined || isUserVisibleMessageDescriptor(progress.message)) &&
        (progress.variant === undefined || isSupportPromptStatus(progress.variant))))
  );
}
