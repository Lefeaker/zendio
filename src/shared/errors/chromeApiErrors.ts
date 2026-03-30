import { AppError, ErrorSeverity } from './types';

interface ChromeErrorContext extends Record<string, unknown> {
  api: string;
  operation?: string;
  details?: Record<string, unknown>;
}

export const chromeApiErrors = {
  runtimeError(message: string, context: ChromeErrorContext, chromeLastError?: unknown): AppError {
    return {
      code: 'CHROME_API_RUNTIME_ERROR',
      domain: 'chrome-api',
      message,
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      userMessage: '浏览器接口调用失败，请刷新页面或重装扩展。',
      context: {
        ...context,
        chromeLastError
      },
      cause: chromeLastError
    };
  },

  unsupportedEnvironment(api: string, context: Partial<ChromeErrorContext> = {}): AppError {
    return {
      code: 'CHROME_API_UNSUPPORTED_ENVIRONMENT',
      domain: 'chrome-api',
      message: `${api} is not available in the current runtime.`,
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      userMessage: '当前浏览器环境不支持所需功能，请升级或更换浏览器。',
      context: {
        api,
        ...context
      }
    };
  }
} as const;

export type ChromeApiErrorCode = ReturnType<typeof chromeApiErrors[keyof typeof chromeApiErrors]>['code'];
