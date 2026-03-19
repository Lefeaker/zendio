import type { NotificationOptions, NotificationsService } from '../interfaces/notifications';
import { ensureFirefox } from './utils';

function toFirefoxOptions(options: NotificationOptions): browser.notifications.CreateNotificationOptions {
  return {
    ...options,
    type: (options.type as browser.notifications.TemplateType) ?? 'basic'
  };
}

export const firefoxNotificationsService: NotificationsService = {
  async create(id: string, options: NotificationOptions): Promise<string | void> {
    const firefoxApi = ensureFirefox();
    if (!firefoxApi.notifications?.create) {
      return undefined;
    }
    const result = await firefoxApi.notifications.create(id, toFirefoxOptions(options));
    return result ?? id;
  },

  async clear(id: string): Promise<void> {
    const firefoxApi = ensureFirefox();
    if (!firefoxApi.notifications?.clear) {
      return;
    }
    await firefoxApi.notifications.clear(id);
  }
};
