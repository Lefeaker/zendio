import { getMessages, formatMessage } from '@i18n';
import { APP_ICON_PATH } from '../../shared/constants';
import type { NotificationOptions as PlatformNotificationOptions } from '../../platform/interfaces/notifications';
import type { PlatformServices } from '../../platform/types';
import type {
  AppNotification,
  NotificationAdapter,
  NotificationChannel,
  NotificationSeverity,
  NormalizedNotification
} from '../../shared/notifications/types';
import { AppError, ErrorSeverity, getErrorHandler, notificationErrors } from '../../shared/errors';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';

export type {
  AppNotification,
  NotificationAdapter,
  NotificationChannel,
  NotificationSeverity,
  NormalizedNotification
} from '../../shared/notifications/types';

const NOTIFICATION_CHANNELS = {
  clipSuccess: 'clipper.success' as const,
  clipFailure: 'clipper.failure' as const,
  clipError: 'clipper.error' as const,
  clipWarning: 'clipper.warning' as const,
  injectionFailure: 'clipper.injection' as const,
  systemError: 'system.error' as const,
  systemWarning: 'system.warning' as const,
  systemInfo: 'system.info' as const,
  systemState: 'system.state' as const,
  userFacing: 'system.user' as const,
  developer: 'system.developer' as const
};

type KnownNotificationChannel = (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

let customNotificationAdapter: NotificationAdapter | null = null;

const TEMPLATE_BASIC: PlatformNotificationOptions['type'] = 'basic';

const SEVERITY_TEMPLATE_MAP: Record<NotificationSeverity, PlatformNotificationOptions['type']> = {
  success: TEMPLATE_BASIC,
  info: TEMPLATE_BASIC,
  warning: TEMPLATE_BASIC,
  error: TEMPLATE_BASIC,
  critical: TEMPLATE_BASIC
};

const ERROR_SEVERITY_TO_NOTIFICATION: Record<ErrorSeverity, NotificationSeverity> = {
  [ErrorSeverity.INFO]: 'info',
  [ErrorSeverity.WARNING]: 'warning',
  [ErrorSeverity.ERROR]: 'error',
  [ErrorSeverity.CRITICAL]: 'critical'
};

const SEVERITY_TITLE_MAP: Record<NotificationSeverity, string> = {
  success: 'Zendio - Success',
  info: 'Zendio - Info',
  warning: 'Zendio - Warning',
  error: 'Zendio - Error',
  critical: 'Zendio - Critical'
};

export { NOTIFICATION_CHANNELS };
export const CHANNEL_USER_FACING = NOTIFICATION_CHANNELS.userFacing;
export const CHANNEL_DEVELOPER = NOTIFICATION_CHANNELS.developer;

export function setNotificationAdapter(adapter: NotificationAdapter | null): void {
  customNotificationAdapter = adapter;
}

function getNotificationPlatformServices(): Pick<PlatformServices, 'runtime' | 'notifications'> {
  const platform = getService<PlatformServices>(TOKENS.platformServices);
  return {
    runtime: platform.runtime,
    notifications: platform.notifications
  };
}

function sanitizeChannel(channel: NotificationChannel): string {
  return channel.replace(/[^a-z0-9]+/gi, '-');
}

function createNotificationId(channel: NotificationChannel, tag?: string): string {
  const base = sanitizeChannel(channel);
  const suffix = tag ?? `${Date.now()}`;
  return `${base}-${suffix}`;
}

function resolveIconUrl(iconUrl?: string): string {
  if (!iconUrl) {
    return APP_ICON_PATH;
  }
  if (/^(?:https?:|data:)/.test(iconUrl)) {
    return iconUrl;
  }
  try {
    return getNotificationPlatformServices().runtime.getURL(iconUrl);
  } catch (error) {
    const globalObj = globalThis as { process?: { env?: Record<string, unknown> } } | undefined;
    if (globalObj?.process?.env && 'VITEST_WORKER_ID' in globalObj.process.env) {
      return `chrome-extension://test/${iconUrl}`;
    }
    if (typeof document !== 'undefined' && document.baseURI.startsWith('about:')) {
      return `chrome-extension://test/${iconUrl}`;
    }
    console.warn('[notifications] Failed to resolve icon URL', error);
    return iconUrl;
  }
}

function resolveTemplateType(severity: NotificationSeverity): PlatformNotificationOptions['type'] {
  return SEVERITY_TEMPLATE_MAP[severity] ?? TEMPLATE_BASIC;
}

function normalizeNotificationPayload(payload: AppNotification): NormalizedNotification {
  return {
    ...payload,
    type: resolveTemplateType(payload.severity),
    iconUrl: resolveIconUrl(payload.iconUrl),
    timestamp: Date.now()
  };
}

function toNotificationOptions(payload: NormalizedNotification): PlatformNotificationOptions {
  const result: PlatformNotificationOptions = {
    type: payload.type,
    iconUrl: payload.iconUrl,
    title: payload.title,
    message: payload.message
  };

  if (payload.contextMessage !== undefined) {
    result.contextMessage = payload.contextMessage;
  }

  if (payload.requireInteraction !== undefined) {
    result.requireInteraction = payload.requireInteraction;
  }

  return result;
}

function createNotificationMetadata(error: AppError): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    code: error.code,
    domain: error.domain,
    recoverable: error.recoverable,
    severity: error.severity
  };
  if (error.context) {
    metadata.context = error.context;
  }
  if (error.timestamp) {
    metadata.timestamp = error.timestamp;
  }
  return metadata;
}

async function mapErrorToNotification(error: AppError): Promise<AppNotification | null> {
  const severity = ERROR_SEVERITY_TO_NOTIFICATION[error.severity] ?? 'error';
  const message = error.userMessage ?? error.message;
  const metadata = createNotificationMetadata(error);

  if (
    (error.domain === 'extraction' || error.domain === 'content') &&
    (severity === 'error' || severity === 'critical')
  ) {
    const msgs = await getMessages();
    const result: AppNotification = {
      channel: NOTIFICATION_CHANNELS.clipFailure,
      severity,
      iconUrl: APP_ICON_PATH,
      title: msgs.clipFailed,
      message,
      requireInteraction: !error.recoverable,
      tag: error.code,
      metadata
    };

    const contextMessage = error.message && error.message !== message ? error.message : undefined;
    if (contextMessage !== undefined) {
      result.contextMessage = contextMessage;
    }

    return result;
  }

  if ((error.domain === 'extraction' || error.domain === 'content') && severity === 'warning') {
    const msgs = await getMessages();
    const reason = message;
    const result: AppNotification = {
      channel: NOTIFICATION_CHANNELS.clipWarning,
      severity,
      iconUrl: APP_ICON_PATH,
      title: msgs.classificationFallbackTitle,
      message: formatMessage(msgs.classificationFallbackMessage, { reason }),
      requireInteraction: false,
      tag: error.code,
      metadata: {
        ...metadata,
        reason
      }
    };

    const contextMessage = error.message && error.message !== reason ? error.message : undefined;
    if (contextMessage !== undefined) {
      result.contextMessage = contextMessage;
    }

    return result;
  }

  if (error.domain === 'i18n' || error.domain === 'options') {
    const result: AppNotification = {
      channel: NOTIFICATION_CHANNELS.userFacing,
      severity,
      iconUrl: APP_ICON_PATH,
      title: SEVERITY_TITLE_MAP[severity],
      message,
      requireInteraction: severity === 'error' || severity === 'critical',
      tag: error.code,
      metadata
    };

    const contextMessage = error.message && error.message !== message ? error.message : undefined;
    if (contextMessage !== undefined) {
      result.contextMessage = contextMessage;
    }

    return result;
  }

  const channel =
    severity === 'warning'
      ? NOTIFICATION_CHANNELS.systemWarning
      : severity === 'info'
        ? NOTIFICATION_CHANNELS.systemInfo
        : NOTIFICATION_CHANNELS.systemError;

  const result: AppNotification = {
    channel,
    severity,
    iconUrl: APP_ICON_PATH,
    title: SEVERITY_TITLE_MAP[severity],
    message,
    requireInteraction: severity === 'error' || severity === 'critical',
    tag: error.code,
    metadata
  };

  const contextMessage = error.message && error.message !== message ? error.message : undefined;
  if (contextMessage !== undefined) {
    result.contextMessage = contextMessage;
  }

  return result;
}

async function dispatchNotification(payload: AppNotification): Promise<string | void> {
  const id = createNotificationId(payload.channel, payload.tag);
  const normalized = normalizeNotificationPayload(payload);

  if (customNotificationAdapter) {
    return customNotificationAdapter(id, normalized);
  }

  return getNotificationPlatformServices().notifications.create(
    id,
    toNotificationOptions(normalized)
  );
}

export async function notifyAppEvent(payload: AppNotification): Promise<string | void> {
  return dispatchNotification(payload);
}

function mapChannelForClipper(channel: KnownNotificationChannel): NotificationChannel {
  return channel;
}

export type ClipSuccessStorageTarget = 'local-folder' | 'rest-api' | 'downloads';
export type ClipSuccessFallbackReason =
  | 'permission-denied'
  | 'folder-missing'
  | 'unsupported'
  | 'write-preflight-failed';

export interface ClipSuccessNotificationDetails {
  vaultName?: string;
  storageTarget?: ClipSuccessStorageTarget;
  localFolderName?: string;
  fallbackReason?: ClipSuccessFallbackReason;
}

export async function notifyClipSuccess(
  filePath: string,
  detailsOrVaultName?: string | ClipSuccessNotificationDetails
): Promise<void> {
  const msgs = await getMessages();
  const details =
    typeof detailsOrVaultName === 'string'
      ? { vaultName: detailsOrVaultName, storageTarget: 'rest-api' as const }
      : (detailsOrVaultName ?? {});
  const vaultName = details.vaultName;
  const title = vaultName ? `${msgs.clipSuccess} (${vaultName})` : msgs.clipSuccess;
  const storageTarget = details.storageTarget ?? 'rest-api';
  const message = formatClipSuccessMessage(msgs, filePath, details, storageTarget);
  await notifyAppEvent({
    channel: mapChannelForClipper(NOTIFICATION_CHANNELS.clipSuccess),
    severity: details.fallbackReason ? 'info' : 'success',
    iconUrl: APP_ICON_PATH,
    title,
    message,
    metadata: {
      filePath,
      vaultName,
      storageTarget,
      ...(details.localFolderName !== undefined && { localFolderName: details.localFolderName }),
      ...(details.fallbackReason !== undefined && { fallbackReason: details.fallbackReason })
    }
  });
}

function formatClipSuccessMessage(
  msgs: Awaited<ReturnType<typeof getMessages>>,
  filePath: string,
  details: ClipSuccessNotificationDetails,
  storageTarget: ClipSuccessStorageTarget
): string {
  if (details.fallbackReason) {
    return msgs.clipSuccessRestFallback;
  }
  if (storageTarget === 'local-folder') {
    return formatMessage(msgs.clipSuccessLocalFolder, {
      folderName: details.localFolderName ?? details.vaultName ?? ''
    });
  }
  if (storageTarget === 'downloads') {
    return formatMessage(msgs.clipSuccessDownloads, { filePath });
  }
  if (details.vaultName) {
    return formatMessage(msgs.clipSuccessRestApi, { vaultName: details.vaultName });
  }
  return String(filePath);
}

export async function notifyClipFailure(error: string): Promise<void> {
  const msgs = await getMessages();
  await notifyAppEvent({
    channel: mapChannelForClipper(NOTIFICATION_CHANNELS.clipFailure),
    severity: ErrorSeverity.ERROR,
    iconUrl: APP_ICON_PATH,
    title: msgs.clipFailed,
    message: error,
    metadata: { error }
  });
}

export async function notifyExtractionError(error: string): Promise<void> {
  const msgs = await getMessages();
  await notifyAppEvent({
    channel: mapChannelForClipper(NOTIFICATION_CHANNELS.clipError),
    severity: ErrorSeverity.ERROR,
    iconUrl: APP_ICON_PATH,
    title: msgs.extractionFailed,
    message: error,
    metadata: { error }
  });
}

export async function notifyInjectionFailure(errorMessage: string): Promise<void> {
  const msgs = await getMessages();
  await notifyAppEvent({
    channel: mapChannelForClipper(NOTIFICATION_CHANNELS.injectionFailure),
    severity: ErrorSeverity.ERROR,
    iconUrl: APP_ICON_PATH,
    title: msgs.clipFailed,
    message: `${msgs.scriptInjectionFailed}: ${errorMessage}`,
    metadata: { error: errorMessage }
  });
}

export async function notifyClipWarning(reason?: string): Promise<void> {
  const msgs = await getMessages();
  const normalizedReason = reason?.trim()
    ? reason.trim()
    : msgs.classificationFallbackDefaultReason;
  await notifyAppEvent({
    channel: mapChannelForClipper(NOTIFICATION_CHANNELS.clipWarning),
    severity: ErrorSeverity.WARNING,
    iconUrl: APP_ICON_PATH,
    title: msgs.classificationFallbackTitle,
    message: formatMessage(msgs.classificationFallbackMessage, { reason: normalizedReason }),
    metadata: { reason: normalizedReason }
  });
}

// 设置错误处理器的通知桥接
const errorHandler = getErrorHandler();
errorHandler.setNotificationBridge(async (error: AppError) => {
  const notification = await mapErrorToNotification(error);
  if (!notification) {
    return;
  }

  try {
    await notifyAppEvent(notification);
  } catch (cause: unknown) {
    const fallbackError = notificationErrors.dispatchFailed(
      notification.message,
      { channel: notification.channel, title: notification.title },
      { cause }
    );
    await errorHandler.handle(fallbackError, { suppressNotifications: true });
  }
});
