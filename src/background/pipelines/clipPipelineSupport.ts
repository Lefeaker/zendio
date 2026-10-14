import { runBestEffortEffect } from '../../shared/errors/bestEffortEffect';
import { isTabsBoundaryError } from '../../platform/interfaces/tabs';
import {
  SHOW_LOCAL_VAULT_PERMISSION_PROMPT,
  SHOW_SUPPORT_PROMPT,
  type LocalVaultPermissionPromptMessage,
  type LocalVaultPermissionPromptResponse
} from '../../shared/types';
import { AppError, chromeApiErrors, errorHandler, ErrorSeverity } from '../../shared/errors';
import { createClipSaveFailure, type ClipSaveFailure } from '../../shared/types/clipResult';
import {
  toSerializableUserVisibleMessageDescriptor,
  type UserVisibleMessageDescriptor
} from '../../shared/i18n/userVisibleMessageDescriptor';

export interface SupportPromptOptions {
  source?: string;
  vaultName?: string;
  status: 'success' | 'failure' | 'warning' | 'progress';
  failure?: ClipSaveFailure;
  progress?: {
    value: number;
    label?: string;
    message?: UserVisibleMessageDescriptor;
    variant?: 'progress' | 'success' | 'failure' | 'warning';
  };
}

export type SupportPromptStatus = SupportPromptOptions['status'];

export interface SupportPromptMessage {
  type: typeof SHOW_SUPPORT_PROMPT;
  source?: string;
  vaultName?: string;
  status: SupportPromptStatus;
  error?: AppError;
  progress?: SupportPromptOptions['progress'];
}

export interface ClipPipelineDependencies {
  sendSupportPrompt(tabId: number, message: SupportPromptMessage): Promise<unknown>;
  requestLocalVaultPermission?(
    tabId: number,
    message: LocalVaultPermissionPromptMessage
  ): Promise<LocalVaultPermissionPromptResponse>;
}

export function buildLocalVaultPermissionPromptMessage(params: {
  folderId: string;
  folderName?: string;
  vaultName?: string;
}): LocalVaultPermissionPromptMessage {
  return {
    type: SHOW_LOCAL_VAULT_PERMISSION_PROMPT,
    folderId: params.folderId,
    ...(params.folderName !== undefined && { folderName: params.folderName }),
    ...(params.vaultName !== undefined && { vaultName: params.vaultName })
  };
}

export function dispatchSupportPrompt(
  dependencies: ClipPipelineDependencies,
  tabId: number | undefined,
  options: SupportPromptOptions
): void {
  if (typeof tabId !== 'number') {
    return;
  }
  const failure = options.failure ?? createClipSaveFailure('unknown');
  const warning = options.status === 'warning';
  const code = warning ? 'CLIP_CLASSIFICATION_WARNING' : failure.code;
  const serializableError: AppError | undefined =
    warning || options.status === 'failure'
      ? {
          code,
          message: code,
          domain: 'background',
          severity: warning ? ErrorSeverity.WARNING : ErrorSeverity.ERROR,
          recoverable: true,
          userMessageDescriptor: warning ? { key: 'supportPromptStatusWarning' } : failure.message
        }
      : undefined;
  const serializableMessage = toSerializableUserVisibleMessageDescriptor(options.progress?.message);
  const serializableProgress =
    options.progress === undefined
      ? undefined
      : {
          value: options.progress.value,
          ...(options.progress.label !== undefined ? { label: options.progress.label } : {}),
          ...(serializableMessage !== undefined ? { message: serializableMessage } : {}),
          ...(options.progress.variant !== undefined ? { variant: options.progress.variant } : {})
        };

  const message: SupportPromptMessage = {
    type: SHOW_SUPPORT_PROMPT,
    status: options.status,
    ...(options.source !== undefined && { source: options.source }),
    ...(options.vaultName !== undefined && { vaultName: options.vaultName }),
    ...(serializableError !== undefined && { error: serializableError }),
    ...(serializableProgress !== undefined ? { progress: serializableProgress } : {})
  };

  void runBestEffortEffect(
    () =>
      dependencies.sendSupportPrompt(tabId, message).catch((error) => {
        if (isTabsBoundaryError(error)) return;
        const message = error instanceof Error ? error.message : String(error);
        if (
          /Receiving end does not exist/i.test(message) ||
          /The message port closed before a response was received/i.test(message) ||
          /No tab with id/i.test(message)
        ) {
          return;
        }
        const appError = chromeApiErrors.runtimeError(
          'Failed to send support prompt message.',
          {
            api: 'tabs.sendMessage',
            operation: 'dispatchSupportPrompt',
            details: {
              tabId,
              status: options.status
            }
          },
          error
        );
        void runBestEffortEffect(
          () => errorHandler.handle(appError, { suppressNotifications: true }),
          'clip.support.report'
        );
      }),
    'clip.support'
  );
}
