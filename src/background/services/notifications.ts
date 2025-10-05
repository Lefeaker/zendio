import { getMessages } from '../../i18n';
import { APP_ICON_PATH } from '../../shared/constants';

type NotificationType = 'clip-success' | 'clip-failure' | 'clip-error' | 'injection-failure';

interface NotificationPayload {
  type: chrome.notifications.TemplateType;
  iconUrl: string;
  title: string;
  message: string;
}

type NotificationAdapterResult = void | string | Promise<void | string>;
type NotificationAdapter = (id: string, options: NotificationPayload) => NotificationAdapterResult;

let customNotificationAdapter: NotificationAdapter | null = null;

const BASIC_TEMPLATE = 'basic' as chrome.notifications.TemplateType;

export function setNotificationAdapter(adapter: NotificationAdapter | null): void {
  customNotificationAdapter = adapter;
}

function createNotificationId(type: NotificationType): string {
  return `${type}-${Date.now()}`;
}

function resolveIconUrl(iconUrl?: string): string {
  if (!iconUrl) {
    return APP_ICON_PATH;
  }
  if (/^(?:https?:|data:)/.test(iconUrl)) {
    return iconUrl;
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(iconUrl);
    }
  } catch (error) {
    console.warn('[notifications] Failed to resolve icon URL', error);
  }
  return iconUrl;
}

function toChromeOptions(payload: NotificationPayload): chrome.notifications.NotificationCreateOptions {
  return {
    type: payload.type,
    iconUrl: payload.iconUrl,
    title: payload.title,
    message: payload.message
  };
}

async function dispatchNotification(type: NotificationType, options: NotificationPayload): Promise<void> {
  const id = createNotificationId(type);
  const normalized: NotificationPayload = {
    ...options,
    iconUrl: resolveIconUrl(options.iconUrl)
  };
  if (customNotificationAdapter) {
    await customNotificationAdapter(id, normalized);
    return;
  }
  await chrome.notifications.create(id, toChromeOptions(normalized));
}

export async function notifyClipSuccess(filePath: string, vaultName?: string): Promise<void> {
  const msgs = await getMessages();
  const title = vaultName ? `${msgs.clipSuccess} (${vaultName})` : msgs.clipSuccess;
  await dispatchNotification('clip-success', {
    type: BASIC_TEMPLATE,
    iconUrl: APP_ICON_PATH,
    title,
    message: String(filePath)
  });
}

export async function notifyClipFailure(error: string): Promise<void> {
  const msgs = await getMessages();
  await dispatchNotification('clip-failure', {
    type: BASIC_TEMPLATE,
    iconUrl: APP_ICON_PATH,
    title: msgs.clipFailed,
    message: error
  });
}

export async function notifyExtractionError(error: string): Promise<void> {
  const msgs = await getMessages();
  await dispatchNotification('clip-error', {
    type: BASIC_TEMPLATE,
    iconUrl: APP_ICON_PATH,
    title: msgs.extractionFailed,
    message: error
  });
}

export async function notifyInjectionFailure(errorMessage: string): Promise<void> {
  const msgs = await getMessages();
  await dispatchNotification('injection-failure', {
    type: BASIC_TEMPLATE,
    iconUrl: APP_ICON_PATH,
    title: msgs.clipFailed,
    message: `${msgs.scriptInjectionFailed}: ${errorMessage}`
  });
}
