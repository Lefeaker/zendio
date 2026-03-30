export interface NotificationOptions {
  type: chrome.notifications.TemplateType | 'basic';
  iconUrl: string;
  title: string;
  message: string;
  contextMessage?: string;
  requireInteraction?: boolean;
}

export interface NotificationsService {
  create(id: string, options: NotificationOptions): Promise<string | void>;
  clear(id: string): Promise<void>;
}
