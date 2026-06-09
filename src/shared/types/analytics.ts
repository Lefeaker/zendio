import {
  hasRequiredUsageEventParams,
  isAllowedUsageEventName,
  sanitizeUsageEventParams,
  validateExtensionErrorEventParams,
  type TelemetryEventParamMap,
  type UsageEventName,
  type UsageEventParamMap
} from './analyticsContract';
import { RUNTIME_USAGE_EVENT_NAMES } from '../analytics/eventCatalog';

export const TRACK_USAGE_EVENT = 'TRACK_USAGE_EVENT';
export const TRACK_TELEMETRY_EVENT = 'TRACK_TELEMETRY_EVENT';
const LEGACY_TRACK_USAGE_EVENT = 'track';
type RuntimeMessageValue = unknown;
type RuntimeMessageRecord = Record<string, RuntimeMessageValue>;
type ServiceProvidedRuntimeParamName =
  | 'debug_mode'
  | 'engagement_time_msec'
  | 'extension_version'
  | 'session_id';
const CANONICAL_RUNTIME_TELEMETRY_EVENT_NAMES = new Set<string>([
  ...RUNTIME_USAGE_EVENT_NAMES,
  'extension_error'
]);

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
  sanitizeUsageEventParams,
  validateExtensionErrorEventParams
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

export function isTrackUsageEventMessage(
  message: RuntimeMessageValue
): message is TrackUsageEventPayload {
  if (!isPlainRecord(message)) {
    return false;
  }

  const isSupportedMessageType =
    message.type === TRACK_USAGE_EVENT ||
    message.type === TRACK_TELEMETRY_EVENT ||
    message.type === LEGACY_TRACK_USAGE_EVENT;
  if (!isSupportedMessageType || !isAllowedUsageEventName(message.event)) {
    return false;
  }

  return hasValidUsageParams(message.event, message.params);
}

export function isTrackTelemetryEventMessage(
  message: RuntimeMessageValue
): message is TrackTelemetryEventPayload {
  if (!isPlainRecord(message)) {
    return false;
  }

  if (
    message.type !== TRACK_TELEMETRY_EVENT ||
    !isAllowedCanonicalRuntimeTelemetryEventName(message.event)
  ) {
    return false;
  }

  if (isAllowedUsageEventName(message.event)) {
    return hasValidUsageParams(message.event, message.params);
  }

  return hasValidExtensionErrorParams(message.params);
}

function hasValidUsageParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: RuntimeMessageValue
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

function hasValidExtensionErrorParams(
  params: RuntimeMessageValue
): params is RuntimeExtensionErrorParams {
  return validateExtensionErrorEventParams(params, { allowServiceProvidedParams: false }).ok;
}

function isAllowedCanonicalRuntimeTelemetryEventName(
  eventName: RuntimeMessageValue
): eventName is UsageEventName | 'extension_error' {
  return typeof eventName === 'string' && CANONICAL_RUNTIME_TELEMETRY_EVENT_NAMES.has(eventName);
}

function isPlainRecord(value: RuntimeMessageValue): value is RuntimeMessageRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
