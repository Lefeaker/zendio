export * from './types';
export * from './errorHandler';
export * from './extractionErrors';
export * from './i18nErrors';
export * from './restErrors';
export * from './chromeApiErrors';
export * from './classifierErrors';
export * from './utils';
export * from './notificationErrors';
export * from './optionsErrors';
export * from './appErrors';
export * from './contentErrors';
export * from './repositoryErrors';

// 依赖注入友好的API
import { registry, TOKENS } from '../di';
import { createErrorHandler, type ErrorHandler } from './errorHandler';
import type { AppError, HandleErrorOptions } from './types';

/**
 * 便捷的错误处理函数，使用依赖注入获取ErrorHandler实例
 */
export async function handleError(error: AppError, options?: HandleErrorOptions): Promise<void> {
  const errorHandler = getErrorHandlerInstance();
  return errorHandler.handle(error, options);
}

/**
 * 获取ErrorHandler实例
 * 如果未注册，自动注册默认实现
 */
export function getErrorHandlerInstance(): ErrorHandler {
  if (!registry.has(TOKENS.errorHandler)) {
    registry.register(TOKENS.errorHandler, createErrorHandler);
  }
  return registry.resolve<ErrorHandler>(TOKENS.errorHandler);
}

/**
 * 注册自定义ErrorHandler实例
 * @param factory 创建ErrorHandler的工厂函数
 */
export function registerErrorHandler(factory: () => ErrorHandler): void {
  registry.register(TOKENS.errorHandler, factory);
}

/**
 * 辅助函数：为内容脚本等短生命周期上下文提供ErrorHandler
 */
export function withErrorHandler<T>(callback: (errorHandler: ErrorHandler) => T): T {
  const errorHandler = getErrorHandlerInstance();
  return callback(errorHandler);
}
