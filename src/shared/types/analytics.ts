import {
  LEGACY_TRACK_USAGE_EVENT_MESSAGE,
  createAnalyticsEventMessage,
  isAnalyticsRuntimeEventMessage,
  type AnalyticsRuntimeEventCompatibilityPayload,
  type UsageEventName,
  type UsageEventParamMap
} from '../analytics';

export const TRACK_USAGE_EVENT = LEGACY_TRACK_USAGE_EVENT_MESSAGE;

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
  ANALYTICS_EVENT_MESSAGE,
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
  createAnalyticsEventMessage,
  getAnalyticsAllowedParams,
  hasRequiredUsageEventParams,
  isAnalyticsRuntimeEventMessage,
  isAllowedUsageEventName,
  parseUsageEventParams,
  sanitizeUsageEventParams
} from '../analytics';
export type {
  AnalyticsRuntimeEventCompatibilityPayload,
  AnalyticsRuntimeEventPayload
} from '../analytics';

export type AnalyticsEventParams = UsageEventParamMap[UsageEventName];

export type TrackUsageEventPayload = AnalyticsRuntimeEventCompatibilityPayload;

/** @deprecated Use createAnalyticsEventMessage. */
export const createTrackUsageEventMessage = createAnalyticsEventMessage;

/** @deprecated Use isAnalyticsRuntimeEventMessage. */
export const isTrackUsageEventMessage = isAnalyticsRuntimeEventMessage;
