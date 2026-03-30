import { SHOW_SUPPORT_PROMPT } from '../../shared/types';
import {
  AppError,
  chromeApiErrors,
  errorHandler,
  toSerializableAppError
} from '../../shared/errors';

export interface SupportPromptOptions {
  source?: string;
  vaultName?: string;
  status: 'success' | 'failure' | 'warning';
  error?: AppError;
  errorMessage?: string;
}

export type SupportPromptStatus = SupportPromptOptions['status'];

export interface SupportPromptMessage {
  type: typeof SHOW_SUPPORT_PROMPT;
  source?: string;
  vaultName?: string;
  status: SupportPromptStatus;
  errorMessage?: string;
  error?: ReturnType<typeof toSerializableAppError>;
}

export interface ClipPipelineDependencies {
  sendSupportPrompt(tabId: number, message: SupportPromptMessage): Promise<unknown>;
}

export function dispatchSupportPrompt(
  dependencies: ClipPipelineDependencies,
  tabId: number | undefined,
  options: SupportPromptOptions
): void {
  if (typeof tabId !== 'number') {
    return;
  }
  const errorMessage = options.error?.userMessage ?? options.error?.message ?? options.errorMessage;
  const serializableError = options.error ? toSerializableAppError(options.error) : undefined;

  const message: SupportPromptMessage = {
    type: SHOW_SUPPORT_PROMPT,
    status: options.status,
    ...(options.source !== undefined && { source: options.source }),
    ...(options.vaultName !== undefined && { vaultName: options.vaultName }),
    ...(errorMessage !== undefined && { errorMessage }),
    ...(serializableError !== undefined && { error: serializableError })
  };

  dependencies.sendSupportPrompt(tabId, message).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /Receiving end does not exist/i.test(message)
      || /The message port closed before a response was received/i.test(message)
      || /No tab with id/i.test(message)
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
    void errorHandler.handle(appError, { suppressNotifications: true });
  });
}
