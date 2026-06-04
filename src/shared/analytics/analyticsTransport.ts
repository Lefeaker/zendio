import {
  hasRequiredAnalyticsEventParams,
  isAllowedAnalyticsEventName,
  sanitizeAnalyticsEventParams
} from './analyticsSanitizers';
import type {
  AnalyticsEventName,
  AnalyticsEventParamMap,
  AnalyticsPrimitive
} from './eventCatalog';
import {
  isValidMeasurementId,
  normalizeAnalyticsTransportMode,
  normalizeProxyEndpoint,
  type AnalyticsTransportMode
} from './analyticsEnvironment';
import type { AnalyticsConfig } from '../errors/analytics/analyticsConfig';

export interface AnalyticsTransportPayload {
  client_id: string;
  measurement_id: string;
  events: Array<{
    name: AnalyticsEventName;
    params: Record<string, AnalyticsPrimitive>;
  }>;
  timestamp_micros: number;
}

export type AnalyticsTransportSkipReason =
  | 'transport_disabled'
  | 'invalid_measurement_id'
  | 'missing_client_id'
  | 'invalid_proxy_endpoint'
  | 'invalid_event'
  | 'invalid_payload';

export type AnalyticsTransportResult =
  | {
      status: 'sent';
      transportMode: Exclude<AnalyticsTransportMode, 'disabled'>;
      responseStatus: number;
      debugResponse?: unknown;
    }
  | {
      status: 'skipped';
      transportMode: AnalyticsTransportMode;
      reason: AnalyticsTransportSkipReason;
    }
  | {
      status: 'failed';
      transportMode: Exclude<AnalyticsTransportMode, 'disabled'>;
      responseStatus?: number;
      error?: string;
      debugResponse?: unknown;
    };

export interface AnalyticsTransportOptions {
  fetch?: AnalyticsTransportFetch;
  extensionVersion?: string;
  now?: () => number;
}

export type AnalyticsTransportFetch = (
  input: string,
  init?: RequestInit
) => Promise<AnalyticsTransportResponse>;

export interface AnalyticsTransportResponse {
  ok: boolean;
  status?: number;
  statusText?: string;
  clone: () => { text: () => Promise<string> };
}

export function buildAnalyticsTransportPayload<EventName extends AnalyticsEventName>(
  eventName: EventName,
  params: AnalyticsEventParamMap[EventName] | Record<string, unknown> | undefined,
  config: AnalyticsConfig,
  options: Pick<AnalyticsTransportOptions, 'extensionVersion' | 'now'> = {}
): AnalyticsTransportPayload | null {
  if (!isAllowedAnalyticsEventName(eventName) || !config.clientId) {
    return null;
  }

  const sanitizedParams = sanitizeAnalyticsEventParams(eventName, params ?? {});
  if (!hasRequiredAnalyticsEventParams(eventName, sanitizedParams)) {
    return null;
  }

  const eventParams: Record<string, AnalyticsPrimitive> = {
    engagement_time_msec: 1,
    ...(options.extensionVersion ? { extension_version: options.extensionVersion } : {}),
    ...(config.sessionId ? { session_id: config.sessionId } : {}),
    ...(config.debugMode ? { debug_mode: true } : {}),
    ...sanitizedParams
  };

  return {
    client_id: config.clientId,
    measurement_id: config.measurementId,
    events: [
      {
        name: eventName,
        params: eventParams
      }
    ],
    timestamp_micros: (options.now?.() ?? Date.now()) * 1000
  };
}

export async function sendAnalyticsTransportEvent<EventName extends AnalyticsEventName>(
  eventName: EventName,
  params: AnalyticsEventParamMap[EventName] | Record<string, unknown> | undefined,
  config: AnalyticsConfig,
  options: AnalyticsTransportOptions = {}
): Promise<AnalyticsTransportResult> {
  const transportMode = normalizeAnalyticsTransportMode(config.transportMode) ?? 'disabled';
  if (transportMode === 'disabled') {
    return { status: 'skipped', reason: 'transport_disabled', transportMode };
  }

  if (!isValidMeasurementId(config.measurementId)) {
    return { status: 'skipped', reason: 'invalid_measurement_id', transportMode };
  }

  if (!config.clientId) {
    return { status: 'skipped', reason: 'missing_client_id', transportMode };
  }

  if (!isAllowedAnalyticsEventName(eventName)) {
    return { status: 'skipped', reason: 'invalid_event', transportMode };
  }

  const payload = buildAnalyticsTransportPayload(eventName, params, config, options);
  if (!payload) {
    return { status: 'skipped', reason: 'invalid_payload', transportMode };
  }

  const requestFetch: AnalyticsTransportFetch = options.fetch ?? globalThis.fetch;
  if (transportMode === 'proxy') {
    const proxyEndpoint = normalizeProxyEndpoint(config.proxyEndpoint);
    if (!proxyEndpoint) {
      return { status: 'skipped', reason: 'invalid_proxy_endpoint', transportMode };
    }
    return postAnalyticsPayload(proxyEndpoint, payload, transportMode, requestFetch);
  }

  const endpoint = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(
    config.measurementId
  )}`;
  const { measurement_id: _measurementId, ...directPayload } = payload;
  return postAnalyticsPayload(endpoint, directPayload, transportMode, requestFetch);
}

async function postAnalyticsPayload(
  endpoint: string,
  payload: unknown,
  transportMode: Exclude<AnalyticsTransportMode, 'disabled'>,
  requestFetch: AnalyticsTransportFetch
): Promise<AnalyticsTransportResult> {
  try {
    const response = await requestFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseStatus = response.status || (response.ok ? 200 : 0);
    const responseBody = await readResponseBody(response);
    const debugResponse = parseResponseBody(responseBody);
    if (!response.ok) {
      return {
        status: 'failed',
        transportMode,
        responseStatus,
        ...(debugResponse !== undefined ? { debugResponse } : {})
      };
    }

    return {
      status: 'sent',
      transportMode,
      responseStatus,
      ...(debugResponse !== undefined ? { debugResponse } : {})
    };
  } catch (error) {
    return {
      status: 'failed',
      transportMode,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readResponseBody(response: AnalyticsTransportResponse): Promise<string | undefined> {
  try {
    const text = await response.clone().text();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function parseResponseBody(value: string | undefined): unknown {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
