import {
  hasRequiredUsageEventParams,
  isAllowedUsageEventName,
  sanitizeUsageEventParams,
  type UsageEventName,
  type UsageEventParamMap
} from './analyticsContract';

export const TRACK_USAGE_EVENT = 'TRACK_USAGE_EVENT';
export const TRACK_TELEMETRY_EVENT = 'TRACK_TELEMETRY_EVENT';
const LEGACY_TRACK_USAGE_EVENT = 'track';

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

export type TrackUsageEventPayload = {
  [EventName in UsageEventName]: {
    type: typeof TRACK_USAGE_EVENT | typeof TRACK_TELEMETRY_EVENT | typeof LEGACY_TRACK_USAGE_EVENT;
    event: EventName;
    params?: UsageEventParamMap[EventName];
  };
}[UsageEventName];

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

  if (candidate.params === undefined || candidate.params === null) {
    return hasRequiredUsageEventParams(candidate.event, {});
  }

  if (!isPlainRecord(candidate.params)) {
    return false;
  }

  const sanitizedParams = sanitizeUsageEventParams(candidate.event, candidate.params);
  const originalKeys = Object.entries(candidate.params).filter(([, value]) => value !== undefined);
  return (
    originalKeys.length === Object.keys(sanitizedParams).length &&
    hasRequiredUsageEventParams(candidate.event, sanitizedParams)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
