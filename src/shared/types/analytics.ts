import {
  hasRequiredUsageEventParams,
  isAllowedUsageEventName,
  sanitizeUsageEventParams,
  type UsageEventName,
  type UsageEventParamMap
} from '../analytics';

export const TRACK_USAGE_EVENT = 'TRACK_USAGE_EVENT';
const LEGACY_TRACK_USAGE_EVENT = 'track';

export type {
  AnalyticsEventName,
  AnalyticsEventParamMap,
  AnalyticsOutcome,
  AnalyticsPrimitive,
  ContentType,
  CountBucket,
  DurationBucket,
  ExportDestination,
  FailureCategory,
  FeatureArea,
  StorageTarget,
  SupportLinkTarget,
  SupportToastVariant,
  UsageDashboardCategory,
  UsageEventName,
  UsageEventParamMap
} from '../analytics';
export {
  ANALYTICS_CATALOG_VERSION,
  ANALYTICS_EVENT_CATALOG,
  ANALYTICS_OPTIONAL_PARAMS,
  ANALYTICS_REQUIRED_PARAMS,
  CONTRACT_ONLY_EVENT_NAMES,
  DEV_ONLY_EVENT_NAMES,
  EMITTED_PRODUCT_EVENT_NAMES,
  EMITTED_RUNTIME_EVENT_NAMES,
  DOCS_ONLY_EVENT_NAMES,
  EMITTED_USAGE_EVENT_NAMES,
  ERROR_EVENT_NAMES,
  FUTURE_PRODUCT_EVENT_NAMES,
  INVENTORY_ONLY_EVENT_NAMES,
  RUNTIME_USAGE_EVENT_NAMES,
  getAnalyticsAllowedParams,
  hasRequiredUsageEventParams,
  isAllowedUsageEventName,
  parseUsageEventParams,
  sanitizeUsageEventParams
} from '../analytics';

export type AnalyticsEventParams = UsageEventParamMap[UsageEventName];

export type TrackUsageEventPayload = {
  [EventName in UsageEventName]: {
    type: typeof TRACK_USAGE_EVENT | typeof LEGACY_TRACK_USAGE_EVENT;
    event: EventName;
    params?: UsageEventParamMap[EventName];
  };
}[UsageEventName];

export function createTrackUsageEventMessage<EventName extends UsageEventName>(
  event: EventName,
  params?: UsageEventParamMap[EventName]
): TrackUsageEventPayload {
  if (params === undefined) {
    return { type: TRACK_USAGE_EVENT, event } as TrackUsageEventPayload;
  }
  return { type: TRACK_USAGE_EVENT, event, params } as TrackUsageEventPayload;
}

export function isTrackUsageEventMessage(message: unknown): message is TrackUsageEventPayload {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown; event?: unknown; params?: unknown };
  const isSupportedMessageType =
    candidate.type === TRACK_USAGE_EVENT || candidate.type === LEGACY_TRACK_USAGE_EVENT;
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
