import {
  getAnalyticsConfigManager,
  initializeAnalyticsConfig,
  refreshAnalyticsConfig,
  type AnalyticsConfig
} from '../../shared/errors/analytics/analyticsConfig';
import {
  clearAnalyticsQueueStorage,
  clearUsageAnalyticsQueueIfConsentRevoked,
  createAnalyticsEventQueue,
  createUsageAnalyticsQueueStorage,
  sendAnalyticsTransportEvent,
  type AnalyticsEventName,
  type AnalyticsEventQueue,
  type AnalyticsEventQueueOptions,
  type AnalyticsTransportResult
} from '../../shared/analytics';
import {
  createAnalyticsTransportConfig,
  hasAnalyticsSendConsent
} from '../../shared/analytics/analyticsRuntimeConfig';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { StorageService } from '../../platform/interfaces/storage';
import type { PlatformServices } from '../../platform/types';
import {
  isAllowedUsageEventName,
  type UsageEventName,
  type UsageEventParamMap
} from '../../shared/types/analytics';

let initializationPromise: Promise<void> | null = null;
let usageEventQueue: AnalyticsEventQueue | null = null;
let usageEventQueueVersion = 'unknown';
let usageEventQueueStorage: ReturnType<typeof createUsageAnalyticsQueueStorage> | null = null;

type QueuedAnalyticsEventParams = Parameters<NonNullable<AnalyticsEventQueueOptions['send']>>[1];
type SentAnalyticsTransportResult = Extract<AnalyticsTransportResult, { status: 'sent' }>;

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
    initializationPromise = null;
    throw error;
  }
}

async function ensureSessionId(): Promise<string | undefined> {
  const manager = getAnalyticsConfigManager();
  if (manager.getConfig().sessionId) {
    return manager.getConfig().sessionId;
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
  usageEventQueueStorage = createUsageAnalyticsQueueStorage(storage.local);
  usageEventQueue = null;
  usageEventQueueVersion = 'unknown';
}

export async function clearQueuedUsageAnalyticsEvents(): Promise<void> {
  try {
    await clearAnalyticsQueueStorage(usageEventQueue, usageEventQueueStorage);
  } catch (error) {
    console.warn('[analytics-events] Failed to clear queued usage analytics events:', error);
  }
}

export async function clearQueuedUsageAnalyticsEventsIfConsentRevoked(config: {
  enabled?: boolean;
  userConsent?: { analytics?: boolean };
}): Promise<void> {
  await clearUsageAnalyticsQueueIfConsentRevoked(config, usageEventQueue, usageEventQueueStorage);
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
    { extensionVersion }
  );
  logAnalyticsTransportResult(eventName, result);
  return result;
}

function summarizeDebugResponse(debugResponse: unknown): {
  hasMessages: boolean;
  messageCount: number;
} {
  if (typeof debugResponse !== 'object' || debugResponse === null) {
    return { hasMessages: false, messageCount: 0 };
  }
  const validationMessages = (debugResponse as { validationMessages?: unknown }).validationMessages;
  return Array.isArray(validationMessages)
    ? { hasMessages: validationMessages.length > 0, messageCount: validationMessages.length }
    : { hasMessages: false, messageCount: 0 };
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

  if (!hasAnalyticsSendConsent(createAnalyticsTransportConfig(config), eventName)) {
    await clearQueuedUsageAnalyticsEvents();
    return;
  }

  await ensureSessionId();
  const queue = getUsageEventQueue(resolveExtensionVersion());
  try {
    if (queue.enqueue(eventName, params)) {
      await queue.flush();
    }
  } catch (error) {
    console.warn('[analytics-events] Failed to send analytics usage event:', error);
  }
}
