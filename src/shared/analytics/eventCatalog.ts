import {
  ANALYTICS_SCHEMA,
  type AnalyticsEventClassification,
  type AnalyticsEventNamesMatching,
  type AnalyticsEventParamMapFromSchema,
  type FeatureArea
} from './schema/analyticsSchema';
import {
  ANALYTICS_EVENT_CATALOG,
  ANALYTICS_OPTIONAL_PARAMS,
  ANALYTICS_REQUIRED_PARAMS,
  CONTRACT_ONLY_EVENT_NAMES,
  DEV_ONLY_EVENT_NAMES,
  EMITTED_PRODUCT_EVENT_NAMES,
  EMITTED_RUNTIME_EVENT_NAMES,
  EMITTED_USAGE_EVENT_NAMES,
  ERROR_EVENT_NAMES,
  FUTURE_PRODUCT_EVENT_NAMES,
  RUNTIME_USAGE_EVENT_NAMES,
  getAnalyticsAllowedParams,
  type AnalyticsDerivedEventDefinition
} from './schema/analyticsSchemaDerived';

export const ANALYTICS_CATALOG_VERSION = 2;

export type AnalyticsEventParamMap = AnalyticsEventParamMapFromSchema<typeof ANALYTICS_SCHEMA>;
export type AnalyticsEventName = keyof AnalyticsEventParamMap & string;
export type FutureProductEventName = AnalyticsEventNamesMatching<
  typeof ANALYTICS_SCHEMA,
  { classification: 'future' }
>;
export type RuntimeUsageEventName = AnalyticsEventNamesMatching<
  typeof ANALYTICS_SCHEMA,
  { runtimeAllowed: true }
>;
export type UsageEventName = RuntimeUsageEventName;
export type UsageEventParamMap = Pick<AnalyticsEventParamMap, UsageEventName>;
export type AnalyticsEventDefinition = AnalyticsDerivedEventDefinition<
  AnalyticsEventName,
  FeatureArea,
  AnalyticsEventClassification
>;
export type {
  AnalyticsEventClassification,
  AnalyticsOutcome,
  AnalyticsPlatform,
  AnalyticsPrimitive,
  AnalyticsSection,
  AnalyticsSource,
  ContentType,
  CountBucket,
  DurationBucket,
  ExportDestination,
  FailureCategory,
  FeatureArea,
  StorageTarget,
  SupportLinkTarget,
  SupportToastVariant,
  UsageDashboardCategory
} from './schema/analyticsSchema';

export const INVENTORY_ONLY_EVENT_NAMES = ['extension_usage', 'extension_performance'] as const;
export const DOCS_ONLY_EVENT_NAMES = ['support_dislike_qr_clicked'] as const;

export {
  ANALYTICS_EVENT_CATALOG,
  ANALYTICS_OPTIONAL_PARAMS,
  ANALYTICS_REQUIRED_PARAMS,
  CONTRACT_ONLY_EVENT_NAMES,
  DEV_ONLY_EVENT_NAMES,
  EMITTED_PRODUCT_EVENT_NAMES,
  EMITTED_RUNTIME_EVENT_NAMES,
  EMITTED_USAGE_EVENT_NAMES,
  ERROR_EVENT_NAMES,
  FUTURE_PRODUCT_EVENT_NAMES,
  RUNTIME_USAGE_EVENT_NAMES,
  getAnalyticsAllowedParams
};
