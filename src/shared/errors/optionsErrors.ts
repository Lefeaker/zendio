import { AppError, ErrorSeverity } from './types';

interface ConnectionContext extends Record<string, unknown> {
  scope: 'global' | 'vault';
  vaultId?: string;
  messageType?: string;
}

interface ResponseContext extends ConnectionContext {
  response?: unknown;
}

interface DispatchContext extends ConnectionContext {
  originalError?: unknown;
}

export const optionsErrors = {
  connectionInProgress(context: ConnectionContext): AppError {
    return {
      code: 'OPTIONS_CONNECTION_IN_PROGRESS',
      domain: 'options',
      message: 'OPTIONS_CONNECTION_IN_PROGRESS',
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      userMessageDescriptor: { key: 'errorOptionsConnectionInProgress' },
      context
    };
  },

  invalidVaultConfig(context: ConnectionContext): AppError {
    return {
      code: 'OPTIONS_VAULT_CONFIG_INVALID',
      domain: 'options',
      message: 'OPTIONS_VAULT_CONFIG_INVALID',
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessageDescriptor: { key: 'errorOptionsVaultConfigInvalid' },
      context
    };
  },

  requestDispatchFailed(error: unknown, context: DispatchContext): AppError {
    const message = error instanceof Error ? error.message : String(error);
    return {
      code: 'OPTIONS_CONNECTION_REQUEST_FAILED',
      domain: 'options',
      message: `Failed to dispatch connection test request: ${message}`,
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      userMessageDescriptor: { key: 'errorOptionsConnectionRequestFailed' },
      context,
      cause: error
    };
  },

  responseInvalid(reason: string, context: ResponseContext): AppError {
    return {
      code: 'OPTIONS_CONNECTION_RESPONSE_INVALID',
      domain: 'options',
      message: `Connection test response is invalid: ${reason}`,
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessageDescriptor: { key: 'errorOptionsConnectionResponseInvalid' },
      context
    };
  }
} as const;

export type OptionsErrorCode = ReturnType<
  (typeof optionsErrors)[keyof typeof optionsErrors]
>['code'];
