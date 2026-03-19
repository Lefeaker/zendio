import type { NotificationOptions, NotificationsService } from '../interfaces/notifications';
import { ensureChrome, getChromeLastError, normalizePromise } from './utils';
import { chromeApiErrors, errorHandler } from '../../shared/errors';

function serializeNotificationOptions(options: NotificationOptions): Record<string, unknown> {
  return {
    title: options.title,
    message: options.message,
    contextMessage: (options as { contextMessage?: string }).contextMessage,
    requireInteraction: options.requireInteraction
  };
}

export const chromeNotificationsService: NotificationsService = {
  async create(id: string, options: NotificationOptions): Promise<string | void> {
    const chromeApi = ensureChrome();
    return normalizePromise<string | void>((resolve, reject) => {
      try {
        chromeApi.notifications.create(id, options, (notificationId) => {
          const lastError = getChromeLastError();
          if (lastError) {
            const appError = chromeApiErrors.runtimeError(
              'notifications.create failed',
              {
                api: 'chrome.notifications',
                operation: 'create',
                details: {
                  id,
                  ...serializeNotificationOptions(options)
                }
              },
              lastError
            );
            void errorHandler.handle(appError, { suppressNotifications: true });
            reject(appError as unknown as Error);
            return;
          }
          resolve(notificationId);
        });
      } catch (error) {
        const appError = chromeApiErrors.runtimeError(
          'notifications.create threw an exception',
          {
            api: 'chrome.notifications',
            operation: 'create',
            details: {
              id,
              ...serializeNotificationOptions(options)
            }
          },
          error
        );
        void errorHandler.handle(appError, { suppressNotifications: true });
        reject(appError as unknown as Error);
      }
    });
  },

  async clear(id: string): Promise<void> {
    const chromeApi = ensureChrome();
    await normalizePromise<void>((resolve, reject) => {
      try {
        chromeApi.notifications.clear(id, () => {
          const lastError = getChromeLastError();
          if (lastError) {
            const appError = chromeApiErrors.runtimeError(
              'notifications.clear failed',
              {
                api: 'chrome.notifications',
                operation: 'clear',
                details: { id }
              },
              lastError
            );
            void errorHandler.handle(appError, { suppressNotifications: true });
            reject(appError as unknown as Error);
            return;
          }
          resolve();
        });
      } catch (error) {
        const appError = chromeApiErrors.runtimeError(
          'notifications.clear threw an exception',
          {
            api: 'chrome.notifications',
            operation: 'clear',
            details: { id }
          },
          error
        );
        void errorHandler.handle(appError, { suppressNotifications: true });
        reject(appError as unknown as Error);
      }
    });
  }
};
