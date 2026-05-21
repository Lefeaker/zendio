import { AppError, ErrorSeverity } from './types';

interface NotificationContext extends Record<string, unknown> {
  channel?: string;
  title?: string;
  type?: string;
}

export const notificationErrors = {
  dispatchFailed(
    message: string,
    context: NotificationContext = {},
    options: { cause?: unknown } = {}
  ): AppError {
    return {
      code: 'NOTIFICATION_DISPATCH_FAILED',
      domain: 'notifications',
      message,
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      userMessage: '通知发送失败，已记录日志。',
      context,
      cause: options.cause
    };
  }
} as const;

export type NotificationErrorCode = ReturnType<
  (typeof notificationErrors)[keyof typeof notificationErrors]
>['code'];
