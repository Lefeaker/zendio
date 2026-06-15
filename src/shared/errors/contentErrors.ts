import type { AppError, ErrorSeverity } from './types';

/**
 * 内容脚本相关错误上下文
 */
export interface ContentErrorContext {
  component?: string;
  action?: string;
  url?: string;
  selector?: string;
  [key: string]: unknown;
}

/**
 * 内容脚本领域错误工厂函数
 */
export const contentErrors = {
  /**
   * 存储操作失败错误
   */
  storageOperationFailed(
    operation: string,
    key: string,
    context: ContentErrorContext = {},
    options: { cause?: unknown } = {}
  ): AppError {
    return {
      code: 'CONTENT_STORAGE_OPERATION_FAILED',
      domain: 'content',
      message: `Storage ${operation} operation failed for key: ${key}`,
      severity: 'warning' as ErrorSeverity,
      recoverable: true,
      userMessageDescriptor: { key: 'errorContentStorageOperationFailed' },
      context: {
        operation,
        key,
        ...context
      },
      cause: options.cause,
      timestamp: Date.now()
    };
  },

  /**
   * 快捷键使用统计错误
   */
  shortcutUsageTrackingFailed(
    context: ContentErrorContext = {},
    options: { cause?: unknown } = {}
  ): AppError {
    return {
      code: 'CONTENT_SHORTCUT_USAGE_TRACKING_FAILED',
      domain: 'content',
      message: 'Failed to track shortcut usage statistics',
      severity: 'info' as ErrorSeverity,
      recoverable: true,
      userMessageDescriptor: { key: 'errorContentShortcutUsageTrackingFailed' },
      context,
      cause: options.cause,
      timestamp: Date.now()
    };
  },

  /**
   * 组件初始化失败错误
   */
  componentInitializationFailed(
    componentName: string,
    context: ContentErrorContext = {},
    options: { cause?: unknown } = {}
  ): AppError {
    return {
      code: 'CONTENT_COMPONENT_INITIALIZATION_FAILED',
      domain: 'content',
      message: `Failed to initialize component: ${componentName}`,
      severity: 'error' as ErrorSeverity,
      recoverable: false,
      userMessageDescriptor: { key: 'errorContentComponentInitializationFailed' },
      context: {
        component: componentName,
        ...context
      },
      cause: options.cause,
      timestamp: Date.now()
    };
  },

  /**
   * 消息传递失败错误
   */
  messagingFailed(
    messageType: string,
    context: ContentErrorContext = {},
    options: { cause?: unknown } = {}
  ): AppError {
    return {
      code: 'CONTENT_MESSAGING_FAILED',
      domain: 'content',
      message: `Failed to send message: ${messageType}`,
      severity: 'warning' as ErrorSeverity,
      recoverable: true,
      userMessageDescriptor: { key: 'errorContentMessagingFailed' },
      context: {
        messageType,
        ...context
      },
      cause: options.cause,
      timestamp: Date.now()
    };
  }
} as const;
