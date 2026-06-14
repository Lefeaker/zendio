import {
  getAnalyticsConfigManager,
  initializeAnalyticsConfig,
  refreshAnalyticsConfig,
  type AnalyticsConfig
} from '../../shared/errors/analytics/analyticsConfig';
import {
  createAnalyticsEventQueue,
  createStorageAnalyticsQueueStorage,
  sendAnalyticsTransportEvent,
  type AnalyticsEventName,
  type AnalyticsEventQueue,
  type AnalyticsEventQueueOptions,
  type AnalyticsQueueStorage,
  type AnalyticsTransportResult
} from '../../shared/analytics';
import {
  createAnalyticsTransportConfig,
  hasAnalyticsSendConsent
} from '../../shared/analytics/analyticsRuntimeConfig';
import { GA4_CONFIG } from '../../shared/errors/analytics/analyticsConfig';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import type { StorageService } from '../../platform/interfaces/storage';
import {
  isAllowedUsageEventName,
  type UsageEventName,
  type UsageEventParamMap
} from '../../shared/types/analytics';

let initializationPromise: Promise<void> | null = null;
let usageEventQueue: AnalyticsEventQueue | null = null;
let usageEventQueueVersion = 'unknown';
let usageEventQueueStorage: AnalyticsQueueStorage | null = null;
const USAGE_ANALYTICS_CONSENT_PROBE_EVENT: UsageEventName = 'support_dislike_clicked';

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
    getConfig: () => createAnalyticsTransportConfig(getAnalyticsConfigManager().getConfig()),
    send: (eventName, params, config) =>
      sendQueuedUsageEvent(eventName, params, config, extensionVersion),
    ...(usageEventQueueStorage ? { storage: usageEventQueueStorage } : {})
  });
  return usageEventQueue;
}

export function configureUsageAnalyticsQueueStorage(storage: Pick<StorageService, 'local'>): void {
  usageEventQueueStorage = createStorageAnalyticsQueueStorage(
    storage.local,
    GA4_CONFIG.STORAGE_KEYS.ANALYTICS_QUEUE
  );
  usageEventQueue = null;
  usageEventQueueVersion = 'unknown';
}

export async function clearQueuedUsageAnalyticsEvents(): Promise<void> {
  try {
    if (usageEventQueue) {
      await usageEventQueue.clear();
      return;
    }
    await usageEventQueueStorage?.clear();
  } catch (error) {
    console.warn('[analytics-events] Failed to clear queued usage analytics events:', error);
  }
}

export async function clearQueuedUsageAnalyticsEventsIfConsentRevoked(
  config: UsageAnalyticsConsentSnapshot
): Promise<void> {
  if (
    !hasAnalyticsSendConsent(
      createAnalyticsTransportConfig(config),
      USAGE_ANALYTICS_CONSENT_PROBE_EVENT
    )
  ) {
    await clearQueuedUsageAnalyticsEvents();
  }
}

async function sendQueuedUsageEvent(
  eventName: AnalyticsEventName,
  params: QueuedAnalyticsEventParams,
  config: AnalyticsConfig,
  extensionVersion: string
): Promise<AnalyticsTransportResult> {
  const result = await sendAnalyticsTransportEvent(
    eventName,
    params,
    createAnalyticsTransportConfig(config),
    {
      extensionVersion
    }
  );
  logAnalyticsTransportResult(eventName, result);
  return result;
}

type SentAnalyticsTransportResult = Extract<AnalyticsTransportResult, { status: 'sent' }>;

function summarizeDebugResponse(debugResponse: unknown): {
  hasMessages: boolean;
  messageCount: number;
} {
  if (typeof debugResponse !== 'object' || debugResponse === null) {
    return {
      hasMessages: false,
      messageCount: 0
    };
  }

  const validationMessages = (debugResponse as { validationMessages?: unknown }).validationMessages;
  if (!Array.isArray(validationMessages)) {
    return {
      hasMessages: false,
      messageCount: 0
    };
  }

  return {
    hasMessages: validationMessages.length > 0,
    messageCount: validationMessages.length
  };
}

function buildAnalyticsTransportLogSummary(
  eventName: AnalyticsEventName,
  result: SentAnalyticsTransportResult
): {
  eventName: AnalyticsEventName;
  transportMode: SentAnalyticsTransportResult['transportMode'];
  responseStatus: number;
  validation: ReturnType<typeof summarizeDebugResponse>;
} {
  return {
    eventName,
    transportMode: result.transportMode,
    responseStatus: result.responseStatus,
    validation: summarizeDebugResponse(result.debugResponse)
  };
}

function logAnalyticsTransportResult(
  eventName: AnalyticsEventName,
  result: AnalyticsTransportResult
): void {
  if (result.status === 'sent') {
    if (result.transportMode !== 'directDebug') {
      return;
    }

    console.info(
      '[analytics-events] Event sent (debug):',
      buildAnalyticsTransportLogSummary(eventName, result)
    );
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

  const runtimeConfig = createAnalyticsTransportConfig(config);
  if (!hasAnalyticsSendConsent(runtimeConfig, eventName)) {
    await clearQueuedUsageAnalyticsEvents();
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
