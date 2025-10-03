import { getMessages } from '../../i18n';

const ICON_PATH = 'assets/icons/icon128.png';

type NotificationType = 'clip-success' | 'clip-failure' | 'clip-error' | 'injection-failure';

type NotificationCreateOptions = Parameters<typeof chrome.notifications.create>[1];
type NotificationCreateResult = Awaited<ReturnType<typeof chrome.notifications.create>>;
type NotificationAdapter = (id: string, options: NotificationCreateOptions) => Promise<NotificationCreateResult> | NotificationCreateResult;

let customNotificationAdapter: NotificationAdapter | null = null;

export function setNotificationAdapter(adapter: NotificationAdapter | null): void {
  customNotificationAdapter = adapter;
}

function createNotificationId(type: NotificationType): string {
  return `${type}-${Date.now()}`;
}

async function dispatchNotification(type: NotificationType, options: NotificationCreateOptions): Promise<void> {
  const id = createNotificationId(type);
  if (customNotificationAdapter) {
    await customNotificationAdapter(id, options);
    return;
  }
  await chrome.notifications.create(id, options);
}

export async function notifyClipSuccess(filePath: string, vaultName?: string): Promise<void> {
  const msgs = await getMessages();
  const title = vaultName ? `${msgs.clipSuccess} (${vaultName})` : msgs.clipSuccess;
  await dispatchNotification('clip-success', {
    type: 'basic',
    iconUrl: ICON_PATH,
    title,
    message: String(filePath)
  });
}

export async function notifyClipFailure(error: string): Promise<void> {
  const msgs = await getMessages();
  await dispatchNotification('clip-failure', {
    type: 'basic',
    iconUrl: ICON_PATH,
    title: msgs.clipFailed,
    message: error
  });
}

export async function notifyExtractionError(error: string): Promise<void> {
  const msgs = await getMessages();
  await dispatchNotification('clip-error', {
    type: 'basic',
    iconUrl: ICON_PATH,
    title: msgs.extractionFailed,
    message: error
  });
}

export async function notifyInjectionFailure(errorMessage: string): Promise<void> {
  const msgs = await getMessages();
  await dispatchNotification('injection-failure', {
    type: 'basic',
    iconUrl: ICON_PATH,
    title: msgs.clipFailed,
    message: `${msgs.scriptInjectionFailed}: ${errorMessage}`
  });
}
