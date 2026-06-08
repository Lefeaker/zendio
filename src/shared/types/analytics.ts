import {
  hasRequiredUsageEventParams,
  isAllowedUsageEventName,
  sanitizeUsageEventParams,
  type AnalyticsPrimitive,
  type TelemetryEventParamMap,
  type UsageEventName,
  type UsageEventParamMap
} from './analyticsContract';
import { RUNTIME_USAGE_EVENT_NAMES, TELEMETRY_EVENT_CATALOG } from '../analytics/eventCatalog';

export const TRACK_USAGE_EVENT = 'TRACK_USAGE_EVENT';
export const TRACK_TELEMETRY_EVENT = 'TRACK_TELEMETRY_EVENT';
const LEGACY_TRACK_USAGE_EVENT = 'track';
type ServiceProvidedRuntimeParamName =
  | 'debug_mode'
  | 'engagement_time_msec'
  | 'extension_version'
  | 'session_id';
const CANONICAL_RUNTIME_TELEMETRY_EVENT_NAMES = new Set<string>([
  ...RUNTIME_USAGE_EVENT_NAMES,
  'extension_error'
]);
const EXTENSION_ERROR_ALLOWED_PARAM_NAMES = new Set<string>(
  (TELEMETRY_EVENT_CATALOG.extension_error.allowedParams as ReadonlyArray<string>).filter(
    (key) => !isServiceProvidedRuntimeParamName(key)
  )
);
const EXTENSION_ERROR_REQUIRED_PARAM_NAMES = (
  TELEMETRY_EVENT_CATALOG.extension_error.requiredParams as ReadonlyArray<string>
).filter((key) => !isServiceProvidedRuntimeParamName(key));

export type {
  AnalyticsPrimitive,
  SupportLinkTarget,
  SupportToastVariant,
  TelemetryConsentKind,
  TelemetryEventDefinition,
  TelemetryEventName,
  TelemetryEventParamMap,
  TelemetryEventScope,
  UsageDashboardCategory,
  UsageEventName,
  UsageEventParamMap
} from './analyticsContract';
export {
  hasRequiredUsageEventParams,
  isAllowedUsageEventName,
  parseUsageEventParams,
  sanitizeUsageEventParams
} from './analyticsContract';

export type AnalyticsEventParams = UsageEventParamMap[UsageEventName];
export type RuntimeExtensionErrorParams = Omit<
  TelemetryEventParamMap['extension_error'],
  ServiceProvidedRuntimeParamName
>;

export type TrackUsageEventPayload = {
  [EventName in UsageEventName]: {
    type: typeof TRACK_USAGE_EVENT | typeof TRACK_TELEMETRY_EVENT | typeof LEGACY_TRACK_USAGE_EVENT;
    event: EventName;
    params?: UsageEventParamMap[EventName];
  };
}[UsageEventName];

export type TrackTelemetryEventPayload = {
  [EventName in UsageEventName | 'extension_error']: {
    type: typeof TRACK_TELEMETRY_EVENT;
    event: EventName;
    params?: EventName extends 'extension_error'
      ? RuntimeExtensionErrorParams
      : TelemetryEventParamMap[EventName];
  };
}[UsageEventName | 'extension_error'];

export function isTrackUsageEventMessage(message: unknown): message is TrackUsageEventPayload {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown; event?: unknown; params?: unknown };
  const isSupportedMessageType =
    candidate.type === TRACK_USAGE_EVENT ||
    candidate.type === TRACK_TELEMETRY_EVENT ||
    candidate.type === LEGACY_TRACK_USAGE_EVENT;
  if (!isSupportedMessageType || !isAllowedUsageEventName(candidate.event)) {
    return false;
  }

  return hasValidUsageParams(candidate.event, candidate.params);
}

export function isTrackTelemetryEventMessage(
  message: unknown
): message is TrackTelemetryEventPayload {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown; event?: unknown; params?: unknown };
  if (
    candidate.type !== TRACK_TELEMETRY_EVENT ||
    !isAllowedCanonicalRuntimeTelemetryEventName(candidate.event)
  ) {
    return false;
  }

  if (isAllowedUsageEventName(candidate.event)) {
    return hasValidUsageParams(candidate.event, candidate.params);
  }

  return hasValidExtensionErrorParams(candidate.params);
}

function hasValidUsageParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: unknown
): boolean {
  if (params === undefined || params === null) {
    return hasRequiredUsageEventParams(eventName, {});
  }

  if (!isPlainRecord(params)) {
    return false;
  }

  const sanitizedParams = sanitizeUsageEventParams(eventName, params);
  const originalKeys = Object.entries(params).filter(([, value]) => value !== undefined);
  return (
    originalKeys.length === Object.keys(sanitizedParams).length &&
    hasRequiredUsageEventParams(eventName, sanitizedParams)
  );
}

function hasValidExtensionErrorParams(params: unknown): params is RuntimeExtensionErrorParams {
  if (!isPlainRecord(params)) {
    return false;
  }

  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  return (
    entries.every(
      ([key, value]) => EXTENSION_ERROR_ALLOWED_PARAM_NAMES.has(key) && isAnalyticsPrimitive(value)
    ) && EXTENSION_ERROR_REQUIRED_PARAM_NAMES.every((key) => params[key] !== undefined)
  );
}

function isAllowedCanonicalRuntimeTelemetryEventName(
  eventName: unknown
): eventName is UsageEventName | 'extension_error' {
  return typeof eventName === 'string' && CANONICAL_RUNTIME_TELEMETRY_EVENT_NAMES.has(eventName);
}

function isAnalyticsPrimitive(value: unknown): value is AnalyticsPrimitive {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isServiceProvidedRuntimeParamName(
  value: string
): value is ServiceProvidedRuntimeParamName {
  return (
    value === 'debug_mode' ||
    value === 'engagement_time_msec' ||
    value === 'extension_version' ||
    value === 'session_id'
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
