import {
  hasRequiredUsageEventParams,
  isAllowedUsageEventName,
  sanitizeUsageEventParams
} from './analyticsSanitizers';
import type { UsageEventName, UsageEventParamMap } from './eventCatalog';

export const ANALYTICS_EVENT_MESSAGE = 'ANALYTICS_EVENT';
export const LEGACY_TRACK_USAGE_EVENT_MESSAGE = 'TRACK_USAGE_EVENT';
export const LEGACY_TRACK_USAGE_EVENT_TYPE = 'track';

type SupportedAnalyticsRuntimeEventType =
  | typeof ANALYTICS_EVENT_MESSAGE
  | typeof LEGACY_TRACK_USAGE_EVENT_MESSAGE
  | typeof LEGACY_TRACK_USAGE_EVENT_TYPE;

export type AnalyticsRuntimeEventPayload = {
  [EventName in UsageEventName]: {
    type: typeof ANALYTICS_EVENT_MESSAGE;
    event: EventName;
    params?: UsageEventParamMap[EventName];
  };
}[UsageEventName];

export type AnalyticsRuntimeEventCompatibilityPayload = {
  [EventName in UsageEventName]: {
    type: SupportedAnalyticsRuntimeEventType;
    event: EventName;
    params?: UsageEventParamMap[EventName];
  };
}[UsageEventName];

export type AnalyticsRuntimeEventAck = {
  success: true;
};

export function createAnalyticsEventMessage<EventName extends UsageEventName>(
  event: EventName,
  params?: UsageEventParamMap[EventName]
): AnalyticsRuntimeEventPayload {
  if (params === undefined) {
    return { type: ANALYTICS_EVENT_MESSAGE, event } as AnalyticsRuntimeEventPayload;
  }
  return { type: ANALYTICS_EVENT_MESSAGE, event, params } as AnalyticsRuntimeEventPayload;
}

export function createAnalyticsEventAck(): AnalyticsRuntimeEventAck {
  return { success: true };
}

export function isAnalyticsRuntimeEventMessage(
  message: unknown
): message is AnalyticsRuntimeEventCompatibilityPayload {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown; event?: unknown; params?: unknown };
  const isSupportedMessageType =
    candidate.type === ANALYTICS_EVENT_MESSAGE ||
    candidate.type === LEGACY_TRACK_USAGE_EVENT_MESSAGE ||
    candidate.type === LEGACY_TRACK_USAGE_EVENT_TYPE;
  if (!isSupportedMessageType || !isAllowedUsageEventName(candidate.event)) {
    return false;
  }

  if (candidate.params === undefined || candidate.params === null) {
    return hasRequiredUsageEventParams(candidate.event, {});
  }

  if (!isPlainRecord(candidate.params)) {
    return false;
  }

  const eventName = candidate.event;
  const sanitizedParams = sanitizeUsageEventParams(eventName, candidate.params);
  const originalKeys = Object.entries(candidate.params).filter(([, value]) => value !== undefined);
  return (
    originalKeys.length === Object.keys(sanitizedParams).length &&
    hasRequiredUsageEventParams(eventName, sanitizedParams)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
