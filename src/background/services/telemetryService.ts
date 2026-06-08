import {
  getAnalyticsConfigManager,
  initializeAnalyticsConfig,
  type AnalyticsConfig,
  type AnalyticsTransportMode
} from '../../shared/errors/analytics/analyticsConfig';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import {
  buildDirectDebugTelemetryPayload,
  buildRelayTelemetryPayload,
  buildTelemetryEventParams,
  DIRECT_DEBUG_COLLECT_URL,
  type TelemetryEventPayload
} from '../../shared/analytics/telemetryPayload';
import {
  parseTelemetryValidationResponse,
  validateTelemetryEvent,
  type TelemetryValidationReason
} from '../../shared/analytics/telemetryValidation';
import type { TelemetryEventName, TelemetryEventParamMap } from '../../shared/types/analytics';

type TelemetryLogTransportMode = AnalyticsTransportMode | 'unknown';

let initializationPromise: Promise<void> | null = null;

export async function trackTelemetryEvent<EventName extends TelemetryEventName>(
  eventName: EventName,
  params?: TelemetryEventParamMap[EventName]
): Promise<void> {
  try {
    await ensureTelemetryReady();
  } catch {
    logSkipped(eventName, 'init-failed', 'unknown');
    return;
  }

  const manager = getAnalyticsConfigManager();
  try {
    await manager.refreshFromStorage();
  } catch {
    logSkipped(eventName, 'config-refresh-failed', 'unknown');
    return;
  }

  const config = manager.getConfig();
  const transportMode = config.transportMode;

  const validation = validateTelemetryEvent(eventName, params);
  if (!validation.ok) {
    logSkipped(eventName, validation.reason, transportMode);
    return;
  }

  if (!config.enabled) {
    logSkipped(eventName, 'config-disabled', transportMode);
    return;
  }

  if (!hasConsent(config, validation.value.consent)) {
    logSkipped(eventName, 'no-consent', transportMode);
    return;
  }

  if (transportMode === 'disabled') {
    logSkipped(eventName, 'transport-disabled', transportMode);
    return;
  }

  const measurementId = readTrimmedString(config.measurementId);
  if (!measurementId || isPlaceholderMeasurementId(measurementId)) {
    logSkipped(eventName, 'invalid-measurement-id', transportMode);
    return;
  }

  const clientId = readTrimmedString(config.clientId);
  if (!clientId) {
    logSkipped(eventName, 'missing-client-id', transportMode);
    return;
  }

  if (transportMode === 'relay' && !readTrimmedString(config.relayEndpoint)) {
    logSkipped(eventName, 'missing-relay-endpoint', transportMode);
    return;
  }

  if (transportMode === 'directDebug' && !config.debugMode) {
    logSkipped(eventName, 'debug-mode-required', transportMode);
    return;
  }

  const sessionId = readTrimmedString(config.sessionId);
  const eventPayload: TelemetryEventPayload<EventName> = {
    name: eventName,
    params: buildTelemetryEventParams(validation.value.params, {
      extensionVersion: resolveExtensionVersion(),
      ...(sessionId !== undefined && { sessionId }),
      debugMode: config.debugMode
    })
  };

  try {
    if (transportMode === 'relay') {
      const relayEndpoint = readTrimmedString(config.relayEndpoint)!;
      const response = await fetch(relayEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          buildRelayTelemetryPayload({
            measurementId,
            clientId,
            debug: config.debugMode,
            events: [eventPayload]
          })
        )
      });

      await handleResponse(response, eventName, transportMode, config.debugMode);
      return;
    }

    const response = await fetch(
      `${DIRECT_DEBUG_COLLECT_URL}?measurement_id=${encodeURIComponent(measurementId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          buildDirectDebugTelemetryPayload({
            clientId,
            events: [eventPayload]
          })
        )
      }
    );

    await handleResponse(response, eventName, transportMode, true);
  } catch {
    logFailedRequest(eventName, 'request-exception', transportMode);
  }
}

async function ensureTelemetryReady(): Promise<void> {
  if (initializationPromise === null) {
    initializationPromise = initializeAnalyticsConfig().then(() => undefined);
  }

  try {
    await initializationPromise;
  } catch {
    initializationPromise = null;
    throw new Error('telemetry init failed');
  }
}

async function handleResponse(
  response: Response,
  eventName: TelemetryEventName,
  transportMode: AnalyticsTransportMode,
  shouldParseValidation: boolean
): Promise<void> {
  const responseText = shouldParseValidation ? await readResponseText(response) : null;
  const { validationMessageCount } = parseTelemetryValidationResponse(responseText);

  if (!response.ok) {
    logFailedRequest(
      eventName,
      'request-failed',
      transportMode,
      response.status,
      validationMessageCount
    );
    return;
  }

  if (validationMessageCount !== null && validationMessageCount > 0) {
    console.warn('[telemetry-service] validation-error', {
      eventName,
      transportMode,
      statusCode: response.status,
      validationMessageCount,
      reason: 'validation-error'
    });
    return;
  }

  console.info('[telemetry-service] sent', {
    eventName,
    transportMode,
    statusCode: response.status,
    validationMessageCount
  });
}

async function readResponseText(response: Response): Promise<string | null> {
  try {
    return await response.clone().text();
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

function hasConsent(config: AnalyticsConfig, consentKind: 'analytics' | 'errorReporting'): boolean {
  if (consentKind === 'analytics') {
    return config.userConsent?.analytics === true;
  }

  return config.userConsent?.errorReporting === true;
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

function isPlaceholderMeasurementId(measurementId: string): boolean {
  return measurementId.trim().length === 0 || /X{4,}/i.test(measurementId);
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function logSkipped(
  eventName: TelemetryEventName,
  reason:
    | TelemetryValidationReason
    | 'config-disabled'
    | 'config-refresh-failed'
    | 'debug-mode-required'
    | 'init-failed'
    | 'invalid-measurement-id'
    | 'missing-client-id'
    | 'missing-relay-endpoint'
    | 'no-consent'
    | 'transport-disabled',
  transportMode: TelemetryLogTransportMode
): void {
  console.warn('[telemetry-service] skipped', {
    eventName,
    reason,
    transportMode
  });
}

function logFailedRequest(
  eventName: TelemetryEventName,
  reason: 'request-exception' | 'request-failed',
  transportMode: TelemetryLogTransportMode,
  statusCode?: number,
  validationMessageCount?: number | null
): void {
  console.warn('[telemetry-service] request-failed', {
    eventName,
    reason,
    transportMode,
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(validationMessageCount !== undefined ? { validationMessageCount } : {})
  });
}
