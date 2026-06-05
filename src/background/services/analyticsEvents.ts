import {
  getAnalyticsConfigManager,
  initializeAnalyticsConfig,
  refreshAnalyticsConfig,
  type AnalyticsConfig
} from '../../shared/errors/analytics/analyticsConfig';
import {
  buildAnalyticsTransportPayload,
  createAnalyticsEventQueue,
  sendAnalyticsTransportEvent,
  type AnalyticsEventName,
  type AnalyticsEventQueue,
  type AnalyticsEventQueueOptions,
  type AnalyticsTransportResult
} from '../../shared/analytics';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import {
  isAllowedUsageEventName,
  type UsageEventName,
  type UsageEventParamMap
} from '../../shared/types/analytics';

let initializationPromise: Promise<void> | null = null;
let usageEventQueue: AnalyticsEventQueue | null = null;
let usageEventQueueVersion = 'unknown';

type QueuedAnalyticsEventParams = Parameters<NonNullable<AnalyticsEventQueueOptions['send']>>[1];
type UsageAnalyticsConsentSnapshot = {
  enabled?: boolean;
  userConsent?: {
    analytics?: boolean;
  };
};

async function ensureAnalyticsReady(): Promise<void> {
  if (initializationPromise === null) {
    initializationPromise = (async () => {
      try {
        await initializeAnalyticsConfig();
      } catch (error) {
        console.warn('[analytics-events] Failed to initialize analytics config:', error);
        throw error;
      }
    })();
  }

  try {
    await initializationPromise;
  } catch (error) {
    // Reset on failure so we can retry next time
    initializationPromise = null;
    throw error;
  }
}

async function ensureSessionId(): Promise<string | undefined> {
  const manager = getAnalyticsConfigManager();
  const config = manager.getConfig();
  if (config.sessionId) {
    return config.sessionId;
  }
  try {
    await manager.renewSession();
    return manager.getConfig().sessionId;
  } catch (error) {
    console.warn('[analytics-events] Failed to renew analytics session id:', error);
    return undefined;
  }
}

function resolveExtensionVersion(): string {
  try {
    return (
      getService<PlatformServices>(TOKENS.platformServices).runtime.getManifest?.()?.version ??
      'unknown'
    );
  } catch {
    return 'unknown';
  }
}

function getUsageEventQueue(extensionVersion: string): AnalyticsEventQueue {
  if (usageEventQueue && usageEventQueueVersion === extensionVersion) {
    return usageEventQueue;
  }

  usageEventQueueVersion = extensionVersion;
  usageEventQueue = createAnalyticsEventQueue({
    getConfig: () => getAnalyticsConfigManager().getConfig(),
    send: (eventName, params, config) =>
      sendQueuedUsageEvent(eventName, params, config, extensionVersion)
  });
  return usageEventQueue;
}

export function clearQueuedUsageAnalyticsEvents(): void {
  usageEventQueue?.clear();
}

export function clearQueuedUsageAnalyticsEventsIfConsentRevoked(
  config: UsageAnalyticsConsentSnapshot
): void {
  if (config.enabled !== true || config.userConsent?.analytics !== true) {
    clearQueuedUsageAnalyticsEvents();
  }
}

async function sendQueuedUsageEvent(
  eventName: AnalyticsEventName,
  params: QueuedAnalyticsEventParams,
  config: AnalyticsConfig,
  extensionVersion: string
): Promise<AnalyticsTransportResult> {
  const result = await sendAnalyticsTransportEvent(eventName, params, config, {
    extensionVersion
  });
  logAnalyticsTransportResult(eventName, params, config, extensionVersion, result);
  return result;
}

function logAnalyticsTransportResult(
  eventName: AnalyticsEventName,
  params: QueuedAnalyticsEventParams,
  config: AnalyticsConfig,
  extensionVersion: string,
  result: AnalyticsTransportResult
): void {
  if (result.status === 'sent') {
    const payload = buildAnalyticsTransportPayload(eventName, params, config, {
      extensionVersion
    });
    const logPayload = {
      eventName,
      params: payload?.events[0]?.params ?? {},
      transportMode: result.transportMode,
      responseStatus: result.responseStatus,
      ...(result.debugResponse !== undefined ? { response: result.debugResponse } : {})
    };

    if (result.transportMode === 'directDebug') {
      console.info('[analytics-events] Event sent (debug):', logPayload);
    } else {
      console.info('[analytics-events] Event sent:', logPayload);
    }
    return;
  }

  if (result.status === 'failed') {
    if (result.responseStatus !== undefined) {
      console.warn(`[analytics-events] Analytics transport failed: ${result.responseStatus}`);
    } else {
      console.warn('[analytics-events] Failed to send analytics usage event:', result.error);
    }
    return;
  }

  if (result.reason === 'missing_client_id') {
    console.warn('[analytics-events] Missing analytics client id.');
  }
}

export async function trackUsageEvent<EventName extends UsageEventName>(
  eventName: EventName,
  params?: UsageEventParamMap[EventName]
): Promise<void> {
  if (!isAllowedUsageEventName(eventName)) {
    return;
  }

  try {
    await ensureAnalyticsReady();
  } catch {
    return;
  }

  let config;
  try {
    config = await refreshAnalyticsConfig();
  } catch (error) {
    console.warn('[analytics-events] Failed to refresh analytics config:', error);
    return;
  }

  const hasAnalyticsConsent = config.userConsent?.analytics === true;
  if (!hasAnalyticsConsent) {
    clearQueuedUsageAnalyticsEvents();
    return;
  }

  await ensureSessionId();
  const extensionVersion = resolveExtensionVersion();
  const queue = getUsageEventQueue(extensionVersion);

  try {
    if (queue.enqueue(eventName, params)) {
      await queue.flush();
    }
  } catch (error) {
    console.warn('[analytics-events] Failed to send analytics usage event:', error);
  }
}
