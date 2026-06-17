import { AppError, ErrorReporter, ErrorSeverity, HandleErrorOptions } from './types';
import { toSerializableUserVisibleMessageDescriptor } from '../i18n/userVisibleMessageDescriptor';

type ErrorNotificationBridge = (error: AppError) => Promise<void> | void;

// 模块级别的单例实例
let errorHandlerInstance: ErrorHandler | null = null;

const SEVERITY_CONSOLE_METHOD: Record<ErrorSeverity, 'info' | 'warn' | 'error'> = {
  [ErrorSeverity.INFO]: 'info',
  [ErrorSeverity.WARNING]: 'warn',
  [ErrorSeverity.ERROR]: 'error',
  [ErrorSeverity.CRITICAL]: 'error'
};

function normalizeError(error: AppError, metadata?: Record<string, unknown>): AppError {
  const result: AppError = {
    code: error.code,
    domain: error.domain,
    message: error.message,
    severity: error.severity,
    recoverable: error.recoverable,
    timestamp: error.timestamp ?? Date.now()
  };

  if (error.userMessage !== undefined) {
    result.userMessage = error.userMessage;
  }
  const userMessageDescriptor = toSerializableUserVisibleMessageDescriptor(
    error.userMessageDescriptor
  );
  if (userMessageDescriptor !== undefined) {
    result.userMessageDescriptor = userMessageDescriptor;
  }

  if (error.cause !== undefined) {
    result.cause = error.cause;
  }

  const baseContext = error.context;
  if (metadata || baseContext) {
    result.context = {
      ...(baseContext ?? {}),
      ...(metadata ?? {})
    };
  }

  return result;
}

export class ErrorHandler {
  private readonly reporters = new Set<ErrorReporter>();
  private notificationBridge: ErrorNotificationBridge | null = null;

  constructor() {
    // 移除静态实例逻辑，改为普通构造函数
  }

  addReporter(reporter: ErrorReporter): () => void {
    this.reporters.add(reporter);
    return () => this.removeReporter(reporter);
  }

  removeReporter(reporter: ErrorReporter): void {
    this.reporters.delete(reporter);
  }

  clearReporters(): void {
    this.reporters.clear();
  }

  setNotificationBridge(bridge: ErrorNotificationBridge | null): void {
    this.notificationBridge = bridge;
  }

  async handle(error: AppError, options: HandleErrorOptions = {}): Promise<void> {
    const normalized = normalizeError(error, options.metadata);

    if (!options.suppressConsole) {
      this.log(normalized);
    }

    if (!options.suppressReporters) {
      await this.dispatchToReporters(normalized);
    }

    if (!options.suppressNotifications) {
      await this.dispatchToNotificationBridge(normalized);
    }

    if (options.rethrow) {
      this.rethrow(normalized);
    }
  }

  private log(error: AppError): void {
    const method = SEVERITY_CONSOLE_METHOD[error.severity] ?? 'error';
    const prefix = `[${error.domain}] ${error.code}`;
    const payload: Record<string, unknown> = {
      message: error.message,
      recoverable: error.recoverable
    };
    if (error.context) {
      payload.context = error.context;
    }
    if (error.cause) {
      payload.cause = error.cause;
    }
    if (error.timestamp) {
      payload.timestamp = error.timestamp;
    }
    // eslint-disable-next-line no-console
    console[method]('[ErrorHandler]', prefix, payload);
  }

  private async dispatchToReporters(error: AppError): Promise<void> {
    if (this.reporters.size === 0) {
      return;
    }
    await Promise.all(
      Array.from(this.reporters).map(async (reporter) => {
        try {
          await reporter.report(error);
        } catch (reporterError) {
          // eslint-disable-next-line no-console
          console.warn('[ErrorHandler] Reporter failed', reporterError);
        }
      })
    );
  }

  private async dispatchToNotificationBridge(error: AppError): Promise<void> {
    if (!this.notificationBridge) {
      return;
    }
    try {
      await this.notificationBridge(error);
    } catch (bridgeError) {
      // eslint-disable-next-line no-console
      console.warn('[ErrorHandler] Notification bridge failed', bridgeError);
    }
  }

  private rethrow(error: AppError): never {
    if (error.cause instanceof Error) {
      throw error.cause;
    }
    const rethrowError = new Error(error.message);
    (rethrowError as { code?: string }).code = error.code;
    (rethrowError as { domain?: string }).domain = error.domain;
    throw rethrowError;
  }
}

/**
 * 创建ErrorHandler实例的工厂函数
 */
export function createErrorHandler(): ErrorHandler {
  return new ErrorHandler();
}

/**
 * 获取ErrorHandler实例的便捷函数
 * 使用依赖注入容器获取实例
 */
export function getErrorHandler(): ErrorHandler {
  // 直接使用模块级别的单例，避免动态导入问题
  if (!errorHandlerInstance) {
    errorHandlerInstance = createErrorHandler();
  }
  return errorHandlerInstance;
}

/**
 * 注册自定义ErrorHandler实例
 * @param factory ErrorHandler工厂函数
 */
export function registerErrorHandler(factory: () => ErrorHandler): void {
  // 直接设置模块级别的实例
  errorHandlerInstance = factory();
}

/**
 * 处理错误的便捷函数
 * @param error 错误对象
 * @param options 处理选项
 */
export async function handleError(error: AppError, options?: HandleErrorOptions): Promise<void> {
  const handler = getErrorHandler();
  return handler.handle(error, options);
}

/**
 * @deprecated 使用getErrorHandler()替代
 * 为了向后兼容保留的导出，将在后续版本中移除
 */
export const errorHandler = getErrorHandler();
