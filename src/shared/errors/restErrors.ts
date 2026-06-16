import { AppError, ErrorSeverity } from './types';
import { STANDARDIZED_ERROR_CODES } from './errorCodes';

interface RestContext extends Record<string, unknown> {
  endpoint?: string; // API 端点（会被清理敏感信息）
  method?: string; // HTTP 方法：GET, POST, PUT, DELETE
  statusCode?: number; // HTTP 状态码
  vault?: string; // 目标库名称
  retryCount?: number; // 重试次数
  protocol?: string; // 协议：http, https
  timeout?: number; // 超时时间（毫秒）
  duration?: number; // 请求耗时（毫秒）
  responseSize?: number; // 响应大小（字节）
  connectionType?: string; // 连接类型：'wifi', '4g', 'ethernet'
  isOnline?: boolean; // 网络在线状态
  cacheHit?: boolean; // 是否命中缓存
  apiVersion?: string; // API 版本
  userAgent?: string; // 用户代理（仅浏览器类型）
  attempts?: Array<Record<string, unknown>>;
  timestamp?: number;
}

export const restErrors = {
  requestFailed(
    message: string,
    context: RestContext = {},
    options: { cause?: unknown } = {}
  ): AppError {
    return {
      code: STANDARDIZED_ERROR_CODES.REST_NETWORK_REQUEST_FAILED,
      domain: 'rest',
      message,
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      userMessageDescriptor: { key: 'errorRestRequestFailed' },
      context: {
        ...context,
        timestamp: Date.now()
      },
      cause: options.cause
    };
  },

  unexpectedResponse(
    message: string,
    context: RestContext = {},
    options: { cause?: unknown } = {}
  ): AppError {
    return {
      code: STANDARDIZED_ERROR_CODES.REST_VALIDATION_UNEXPECTED_RESPONSE,
      domain: 'rest',
      message,
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessageDescriptor: { key: 'errorRestUnexpectedResponse' },
      context: {
        ...context,
        timestamp: Date.now()
      },
      cause: options.cause
    };
  },

  vaultUnavailable(context: RestContext = {}, options: { cause?: unknown } = {}): AppError {
    return {
      code: 'REST_VAULT_UNAVAILABLE', // 保持现有错误码，因为这是特定于项目的错误
      domain: 'rest',
      message: 'REST_VAULT_UNAVAILABLE',
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      userMessageDescriptor: { key: 'errorRestVaultUnavailable' },
      context: {
        ...context,
        timestamp: Date.now()
      },
      cause: options.cause
    };
  }
} as const;

export type RestErrorCode = ReturnType<(typeof restErrors)[keyof typeof restErrors]>['code'];
