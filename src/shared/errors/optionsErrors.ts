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
      message: 'Connection test is already running.',
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      userMessage: '连接测试正在进行，请稍候完成后再试。',
      context
    };
  },

  invalidVaultConfig(context: ConnectionContext): AppError {
    return {
      code: 'OPTIONS_VAULT_CONFIG_INVALID',
      domain: 'options',
      message: 'Vault configuration is missing required identifier.',
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessage: '仓库配置缺少必要信息，请检查后重试。',
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
      userMessage: '连接测试请求发送失败，请检查网络后重试。',
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
      userMessage: '连接测试返回数据异常，请稍后重试或反馈给我们。',
      context
    };
  }
} as const;

export type OptionsErrorCode = ReturnType<
  (typeof optionsErrors)[keyof typeof optionsErrors]
>['code'];
