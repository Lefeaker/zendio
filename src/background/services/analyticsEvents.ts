import {
  getAnalyticsConfigManager,
  initializeAnalyticsConfig,
  refreshAnalyticsConfig
} from '../../shared/errors/analytics/analyticsConfig';
import {
  buildAnalyticsTransportPayload,
  sendAnalyticsTransportEvent
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
  } catch {
    // Reset on failure so we can retry next time
    initializationPromise = null;
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
    return;
  }

  const sessionId = await ensureSessionId();
  const extensionVersion = resolveExtensionVersion();
  const activeConfig = sessionId
    ? { ...getAnalyticsConfigManager().getConfig(), sessionId }
    : getAnalyticsConfigManager().getConfig();

  try {
    const result = await sendAnalyticsTransportEvent(eventName, params, activeConfig, {
      extensionVersion
    });

    if (result.status === 'sent') {
      const payload = buildAnalyticsTransportPayload(eventName, params, activeConfig, {
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
  } catch (error) {
    console.warn('[analytics-events] Failed to send analytics usage event:', error);
  }
}
