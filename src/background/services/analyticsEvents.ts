import {
  getAnalyticsConfigManager,
  initializeAnalyticsConfig
} from '../../shared/errors/analytics/analyticsConfig';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import type { AnalyticsEventParams } from '../../shared/types/analytics';

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

function resolveEndpoint(measurementId: string, debugMode: boolean | undefined): string {
  const base = debugMode
    ? 'https://www.google-analytics.com/debug/mp/collect'
    : 'https://www.google-analytics.com/mp/collect';
  return `${base}?measurement_id=${measurementId}`;
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

export async function trackUsageEvent(
  eventName: string,
  params?: AnalyticsEventParams
): Promise<void> {
  try {
    await ensureAnalyticsReady();
  } catch {
    return;
  }

  const manager = getAnalyticsConfigManager();
  const config = manager.getConfig();

  const hasAnalyticsConsent = config.userConsent?.analytics === true;
  if (!hasAnalyticsConsent) {
    return;
  }

  if (
    !config.measurementId ||
    config.measurementId.trim().length === 0 ||
    /X{4,}/i.test(config.measurementId)
  ) {
    // 未配置有效的 GA4 ID 时跳过
    return;
  }

  if (!config.clientId) {
    console.warn('[analytics-events] Missing analytics client id.');
    return;
  }

  const sessionId = await ensureSessionId();
  const extensionVersion = resolveExtensionVersion();

  const payloadParams: Record<string, string | number | boolean> = {
    extension_version: extensionVersion,
    engagement_time_msec: 1
  };

  if (sessionId) {
    payloadParams.session_id = sessionId;
  }

  if (config.debugMode) {
    payloadParams.debug_mode = true;
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        payloadParams[key] = value;
      }
    }
  }

  const body = JSON.stringify({
    client_id: config.clientId,
    events: [
      {
        name: eventName,
        params: payloadParams
      }
    ],
    timestamp_micros: Date.now() * 1000
  });

  const endpoint = resolveEndpoint(config.measurementId, config.debugMode);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    });

    if (!response.ok) {
      const message = `[analytics-events] GA4 request failed: ${response.status} ${response.statusText}`;
      if (config.debugMode) {
        const debugResponse = await readResponseBody(response);
        console.warn(message, debugResponse ?? '');
      } else {
        console.warn(message);
      }
    } else if (config.debugMode) {
      const debugResponseText = await readResponseBody(response);
      let debugPayload: unknown = null;
      if (debugResponseText) {
        try {
          debugPayload = JSON.parse(debugResponseText);
        } catch {
          debugPayload = debugResponseText;
        }
      }
      console.info('[analytics-events] Event sent (debug):', {
        eventName,
        params: payloadParams,
        response: debugPayload
      });
    } else {
      console.info('[analytics-events] Event sent:', { eventName, params: payloadParams });
    }
  } catch (error) {
    console.warn('[analytics-events] Failed to send GA4 usage event:', error);
  }
}

async function readResponseBody(response: Response): Promise<string | null> {
  try {
    return await response.clone().text();
  } catch {
    return null;
  }
}
