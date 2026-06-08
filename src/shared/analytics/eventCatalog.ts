import type { TelemetryCustomDefinitionKind } from './analyticsSanitizers';

const tuple = <const Values extends readonly string[]>(...values: Values) => values;
const EMPTY_PARAMS = tuple();

export const SUPPORT_LINK_TARGETS = tuple('ko-fi', 'afdian');
export type SupportLinkTarget = (typeof SUPPORT_LINK_TARGETS)[number];

export const SUPPORT_TOAST_VARIANTS = tuple('first', 'returning', 'acknowledged');
export type SupportToastVariant = (typeof SUPPORT_TOAST_VARIANTS)[number];

export const USAGE_DASHBOARD_CATEGORIES = tuple('ai_chat', 'fragment', 'article');
export type UsageDashboardCategory = (typeof USAGE_DASHBOARD_CATEGORIES)[number];

export const I18N_OVERFLOW_COMPONENTS = tuple('button', 'label', 'hint', 'title');
export const I18N_OVERFLOW_PRIORITIES = tuple('high', 'medium', 'low');
export const RUNTIME_HARNESS_SOURCES = tuple('runtime-observability-harness');
export const VIDEO_EVENT_SOURCES = tuple('menu');

export interface UsageEventParamMap {
  support_link_clicked: { target: SupportLinkTarget };
  support_like_clicked: { variant: SupportToastVariant };
  support_dislike_clicked: Record<string, never>;
  support_review_link_clicked: { variant?: SupportToastVariant };
  support_review_acknowledged_clicked: { variant?: SupportToastVariant };
  support_dislike_reddit_clicked: Record<string, never>;
  support_github_feedback_clicked: Record<string, never>;
  support_like_toast_shown: { variant: SupportToastVariant };
  support_dislike_toast_shown: Record<string, never>;
  clear_stats: { timestamp: number };
  i18n_text_overflow: {
    key: string;
    language: string;
    component?: (typeof I18N_OVERFLOW_COMPONENTS)[number];
    priority?: (typeof I18N_OVERFLOW_PRIORITIES)[number];
    length: number;
    limit?: number;
    used_short: boolean;
  };
  usage_dashboard_increment: {
    category: UsageDashboardCategory;
    increment: number;
    total_after: number;
  };
  runtime_harness_open: {
    source: (typeof RUNTIME_HARNESS_SOURCES)[number];
  };
  video_started: {
    source: (typeof VIDEO_EVENT_SOURCES)[number];
  };
}

export interface ExtensionErrorEventParams {
  error_code: string;
  error_domain: string;
  error_category: string;
  error_severity: string;
  error_severity_level: number;
  error_recoverable: boolean;
  error_description: string;
  extension_version: string;
  timestamp: number;
  browser_name?: string;
  browser_version?: string;
  session_id?: string;
  extractor?: string;
  type?: string;
  method?: string;
  statusCode?: number;
  feature?: string;
  step?: string;
  component?: string;
  action?: string;
  retryCount?: number;
  timeout?: number;
  batchSize?: number;
  itemCount?: number;
  duration?: number;
  memoryUsage?: number;
  cacheHit?: boolean;
  apiVersion?: string;
  userAgent?: string;
  platform?: string;
  locale?: string;
  theme?: string;
  screenResolution?: string;
  viewportSize?: string;
  connectionType?: string;
  isOnline?: boolean;
  tabCount?: number;
  extensionContext?: string;
  domain?: string;
  protocol?: string;
  stackTrace?: string;
}

export interface TelemetryEventParamMap extends UsageEventParamMap {
  extension_error: ExtensionErrorEventParams;
}

export type UsageEventContractName = keyof UsageEventParamMap;
export type UsageEventName = Exclude<UsageEventContractName, 'video_started'>;
export type TelemetryEventName = keyof TelemetryEventParamMap;
export type TelemetryEventScope =
  | 'production'
  | 'dev-only'
  | 'contract-helper'
  | 'retired-contract';
export type TelemetryConsentKind = 'analytics' | 'errorReporting';
type TelemetryEventParamName<EventName extends TelemetryEventName> = Extract<
  keyof TelemetryEventParamMap[EventName],
  string
>;

export interface TelemetryEventDefinition<
  EventName extends TelemetryEventName = TelemetryEventName
> {
  readonly event: EventName;
  readonly consent: TelemetryConsentKind;
  readonly scope: TelemetryEventScope;
  readonly requiredParams: ReadonlyArray<TelemetryEventParamName<EventName>>;
  readonly allowedParams: ReadonlyArray<TelemetryEventParamName<EventName>>;
  readonly gaCustomDefinitionKinds: Partial<
    Record<TelemetryEventParamName<EventName>, TelemetryCustomDefinitionKind>
  >;
  readonly privacyNote: string;
}

type TelemetryEventCatalog = {
  readonly [EventName in TelemetryEventName]: TelemetryEventDefinition<EventName>;
};

function defineTelemetryEvent<EventName extends TelemetryEventName>(
  definition: TelemetryEventDefinition<EventName>
): TelemetryEventDefinition<EventName> {
  return definition;
}

function defineTelemetryEventCatalog<Catalog extends TelemetryEventCatalog>(
  catalog: Catalog
): Catalog {
  return catalog;
}

function recordValues<Value>(record: Record<string, Value>): ReadonlyArray<Value> {
  return Object.values(record);
}

function getEventNames<EventName extends string>(
  definitions: ReadonlyArray<{ readonly event: EventName }>
): ReadonlyArray<EventName> {
  return definitions.map(({ event }) => event);
}

export const TELEMETRY_EVENT_CATALOG = defineTelemetryEventCatalog({
  support_link_clicked: defineTelemetryEvent({
    event: 'support_link_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: tuple('target'),
    allowedParams: tuple('target'),
    gaCustomDefinitionKinds: { target: 'dimension' },
    privacyNote: 'Capture only the stable support destination enum.'
  }),
  support_like_clicked: defineTelemetryEvent({
    event: 'support_like_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: tuple('variant'),
    allowedParams: tuple('variant'),
    gaCustomDefinitionKinds: { variant: 'dimension' },
    privacyNote: 'Capture only the low-cardinality support prompt variant.'
  }),
  support_dislike_clicked: defineTelemetryEvent({
    event: 'support_dislike_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: EMPTY_PARAMS,
    allowedParams: EMPTY_PARAMS,
    gaCustomDefinitionKinds: {},
    privacyNote: 'Record the click without attaching user text or destinations.'
  }),
  support_review_link_clicked: defineTelemetryEvent({
    event: 'support_review_link_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: EMPTY_PARAMS,
    allowedParams: tuple('variant'),
    gaCustomDefinitionKinds: { variant: 'dimension' },
    privacyNote: 'Capture only the support prompt variant when present.'
  }),
  support_review_acknowledged_clicked: defineTelemetryEvent({
    event: 'support_review_acknowledged_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: EMPTY_PARAMS,
    allowedParams: tuple('variant'),
    gaCustomDefinitionKinds: { variant: 'dimension' },
    privacyNote: 'Capture only the support prompt variant when present.'
  }),
  support_dislike_reddit_clicked: defineTelemetryEvent({
    event: 'support_dislike_reddit_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: EMPTY_PARAMS,
    allowedParams: EMPTY_PARAMS,
    gaCustomDefinitionKinds: {},
    privacyNote: 'Record the feedback escape hatch without raw URLs.'
  }),
  support_github_feedback_clicked: defineTelemetryEvent({
    event: 'support_github_feedback_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: EMPTY_PARAMS,
    allowedParams: EMPTY_PARAMS,
    gaCustomDefinitionKinds: {},
    privacyNote: 'Record the GitHub feedback click without raw URLs.'
  }),
  support_like_toast_shown: defineTelemetryEvent({
    event: 'support_like_toast_shown',
    consent: 'analytics',
    scope: 'production',
    requiredParams: tuple('variant'),
    allowedParams: tuple('variant'),
    gaCustomDefinitionKinds: { variant: 'dimension' },
    privacyNote: 'Capture only the toast presentation variant.'
  }),
  support_dislike_toast_shown: defineTelemetryEvent({
    event: 'support_dislike_toast_shown',
    consent: 'analytics',
    scope: 'production',
    requiredParams: EMPTY_PARAMS,
    allowedParams: EMPTY_PARAMS,
    gaCustomDefinitionKinds: {},
    privacyNote: 'Record the toast presentation without user-derived payloads.'
  }),
  clear_stats: defineTelemetryEvent({
    event: 'clear_stats',
    consent: 'analytics',
    scope: 'production',
    requiredParams: tuple('timestamp'),
    allowedParams: tuple('timestamp'),
    gaCustomDefinitionKinds: { timestamp: 'metric' },
    privacyNote: 'Record only the non-negative client timestamp of the reset action.'
  }),
  i18n_text_overflow: defineTelemetryEvent({
    event: 'i18n_text_overflow',
    consent: 'analytics',
    scope: 'production',
    requiredParams: tuple('key', 'language', 'length', 'used_short'),
    allowedParams: tuple(
      'key',
      'language',
      'component',
      'priority',
      'length',
      'limit',
      'used_short'
    ),
    gaCustomDefinitionKinds: {
      key: 'dimension',
      language: 'dimension',
      component: 'dimension',
      priority: 'dimension',
      length: 'metric',
      limit: 'metric',
      used_short: 'dimension'
    },
    privacyNote: 'Allow only safe i18n identifiers, locale tags, and bounded layout metrics.'
  }),
  extension_error: defineTelemetryEvent({
    event: 'extension_error',
    consent: 'errorReporting',
    scope: 'production',
    requiredParams: tuple(
      'error_code',
      'error_domain',
      'error_category',
      'error_severity',
      'error_severity_level',
      'error_recoverable',
      'error_description',
      'extension_version',
      'timestamp'
    ),
    allowedParams: tuple(
      'error_code',
      'error_domain',
      'error_category',
      'error_severity',
      'error_severity_level',
      'error_recoverable',
      'error_description',
      'extension_version',
      'timestamp',
      'browser_name',
      'browser_version',
      'session_id',
      'extractor',
      'type',
      'method',
      'statusCode',
      'feature',
      'step',
      'component',
      'action',
      'retryCount',
      'timeout',
      'batchSize',
      'itemCount',
      'duration',
      'memoryUsage',
      'cacheHit',
      'apiVersion',
      'userAgent',
      'platform',
      'locale',
      'theme',
      'screenResolution',
      'viewportSize',
      'connectionType',
      'isOnline',
      'tabCount',
      'extensionContext',
      'domain',
      'protocol',
      'stackTrace'
    ),
    gaCustomDefinitionKinds: {
      error_code: 'dimension',
      error_domain: 'dimension',
      error_category: 'dimension',
      error_severity: 'dimension',
      error_severity_level: 'metric',
      error_recoverable: 'dimension',
      error_description: 'dimension',
      extension_version: 'dimension',
      timestamp: 'metric',
      browser_name: 'dimension',
      browser_version: 'dimension',
      session_id: 'dimension',
      extractor: 'dimension',
      type: 'dimension',
      method: 'dimension',
      statusCode: 'metric',
      feature: 'dimension',
      step: 'dimension',
      component: 'dimension',
      action: 'dimension',
      retryCount: 'metric',
      timeout: 'metric',
      batchSize: 'metric',
      itemCount: 'metric',
      duration: 'metric',
      memoryUsage: 'metric',
      cacheHit: 'dimension',
      apiVersion: 'dimension',
      userAgent: 'dimension',
      platform: 'dimension',
      locale: 'dimension',
      theme: 'dimension',
      screenResolution: 'dimension',
      viewportSize: 'dimension',
      connectionType: 'dimension',
      isOnline: 'dimension',
      tabCount: 'metric',
      extensionContext: 'dimension',
      domain: 'dimension',
      protocol: 'dimension',
      stackTrace: 'dimension'
    },
    privacyNote:
      'Allow only sanitized technical metadata and redacted stack/domain context from the error reporter.'
  }),
  usage_dashboard_increment: defineTelemetryEvent({
    event: 'usage_dashboard_increment',
    consent: 'analytics',
    scope: 'contract-helper',
    requiredParams: tuple('category', 'increment', 'total_after'),
    allowedParams: tuple('category', 'increment', 'total_after'),
    gaCustomDefinitionKinds: {
      category: 'dimension',
      increment: 'metric',
      total_after: 'metric'
    },
    privacyNote: 'Keep the helper contract typed without promoting it to live production telemetry.'
  }),
  runtime_harness_open: defineTelemetryEvent({
    event: 'runtime_harness_open',
    consent: 'analytics',
    scope: 'dev-only',
    requiredParams: tuple('source'),
    allowedParams: tuple('source'),
    gaCustomDefinitionKinds: { source: 'dimension' },
    privacyNote: 'Limit the harness signal to the single dev-only source enum.'
  }),
  video_started: defineTelemetryEvent({
    event: 'video_started',
    consent: 'analytics',
    scope: 'retired-contract',
    requiredParams: tuple('source'),
    allowedParams: tuple('source'),
    gaCustomDefinitionKinds: { source: 'dimension' },
    privacyNote:
      'Keep the retired contract visible for audit and docs sync while blocking runtime acceptance.'
  })
});

export const TELEMETRY_EVENT_LIST = recordValues(TELEMETRY_EVENT_CATALOG);

export const TELEMETRY_EVENT_NAMES = getEventNames(TELEMETRY_EVENT_LIST);

export const USAGE_EVENT_CONTRACT_NAMES = TELEMETRY_EVENT_NAMES.filter(
  (eventName): eventName is UsageEventContractName => eventName !== 'extension_error'
);

export const RUNTIME_USAGE_EVENT_NAMES = USAGE_EVENT_CONTRACT_NAMES.filter(
  (eventName): eventName is UsageEventName =>
    TELEMETRY_EVENT_CATALOG[eventName].scope !== 'retired-contract'
);
