import type { AnalyticsPrimitive, TelemetryEventName } from '../types/analytics';

export const DIRECT_DEBUG_COLLECT_URL = 'https://www.google-analytics.com/debug/mp/collect';

export interface TelemetryEventPayload<EventName extends TelemetryEventName = TelemetryEventName> {
  name: EventName;
  params: Record<string, AnalyticsPrimitive>;
}

export interface RelayTelemetryPayload<EventName extends TelemetryEventName = TelemetryEventName> {
  mode: 'collect';
  debug: boolean;
  measurementId: string;
  clientId: string;
  events: TelemetryEventPayload<EventName>[];
}

export interface DirectDebugTelemetryPayload<
  EventName extends TelemetryEventName = TelemetryEventName
> {
  client_id: string;
  events: TelemetryEventPayload<EventName>[];
  timestamp_micros: number;
}

export function buildTelemetryEventParams(
  eventParams: Record<string, AnalyticsPrimitive>,
  options: {
    extensionVersion: string;
    sessionId?: string;
    debugMode: boolean;
  }
): Record<string, AnalyticsPrimitive> {
  const payloadParams: Record<string, AnalyticsPrimitive> = {
    ...eventParams,
    extension_version: options.extensionVersion,
    engagement_time_msec: 1
  };

  if (options.sessionId) {
    payloadParams.session_id = options.sessionId;
  }

  if (options.debugMode) {
    payloadParams.debug_mode = true;
  }

  return payloadParams;
}

export function buildRelayTelemetryPayload<
  EventName extends TelemetryEventName = TelemetryEventName
>(options: {
  measurementId: string;
  clientId: string;
  debug: boolean;
  events: TelemetryEventPayload<EventName>[];
}): RelayTelemetryPayload<EventName> {
  return {
    mode: 'collect',
    debug: options.debug,
    measurementId: options.measurementId,
    clientId: options.clientId,
    events: options.events
  };
}

export function buildDirectDebugTelemetryPayload<
  EventName extends TelemetryEventName = TelemetryEventName
>(options: {
  clientId: string;
  events: TelemetryEventPayload<EventName>[];
}): DirectDebugTelemetryPayload<EventName> {
  return {
    client_id: options.clientId,
    events: options.events,
    timestamp_micros: Date.now() * 1000
  };
}
