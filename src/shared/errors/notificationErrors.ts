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
      userMessageDescriptor: { key: 'errorNotificationDispatchFailed' },
      context,
      cause: options.cause
    };
  }
} as const;

export type NotificationErrorCode = ReturnType<
  (typeof notificationErrors)[keyof typeof notificationErrors]
>['code'];
