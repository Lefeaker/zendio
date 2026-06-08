import type { TelemetryCustomDefinitionKind } from './analyticsSanitizers';

export const SUPPORT_LINK_TARGETS = ['ko-fi', 'afdian'] as const;
export type SupportLinkTarget = (typeof SUPPORT_LINK_TARGETS)[number];

export const SUPPORT_TOAST_VARIANTS = ['first', 'returning', 'acknowledged'] as const;
export type SupportToastVariant = (typeof SUPPORT_TOAST_VARIANTS)[number];

export const USAGE_DASHBOARD_CATEGORIES = ['ai_chat', 'fragment', 'article'] as const;
export type UsageDashboardCategory = (typeof USAGE_DASHBOARD_CATEGORIES)[number];

export const I18N_OVERFLOW_COMPONENTS = ['button', 'label', 'hint', 'title'] as const;
export const I18N_OVERFLOW_PRIORITIES = ['high', 'medium', 'low'] as const;
export const RUNTIME_HARNESS_SOURCES = ['runtime-observability-harness'] as const;
export const VIDEO_EVENT_SOURCES = ['menu'] as const;

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

export interface TelemetryEventDefinition<
  EventName extends TelemetryEventName = TelemetryEventName
> {
  readonly event: EventName;
  readonly consent: TelemetryConsentKind;
  readonly scope: TelemetryEventScope;
  readonly requiredParams: ReadonlyArray<keyof TelemetryEventParamMap[EventName]>;
  readonly allowedParams: ReadonlyArray<keyof TelemetryEventParamMap[EventName]>;
  readonly gaCustomDefinitionKinds: Partial<
    Record<keyof TelemetryEventParamMap[EventName], TelemetryCustomDefinitionKind>
  >;
  readonly privacyNote: string;
}

type TelemetryEventCatalog = {
  readonly [EventName in TelemetryEventName]: TelemetryEventDefinition<EventName>;
};

export const TELEMETRY_EVENT_CATALOG = {
  support_link_clicked: {
    event: 'support_link_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: ['target'] as const,
    allowedParams: ['target'] as const,
    gaCustomDefinitionKinds: { target: 'dimension' },
    privacyNote: 'Capture only the stable support destination enum.'
  },
  support_like_clicked: {
    event: 'support_like_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: ['variant'] as const,
    allowedParams: ['variant'] as const,
    gaCustomDefinitionKinds: { variant: 'dimension' },
    privacyNote: 'Capture only the low-cardinality support prompt variant.'
  },
  support_dislike_clicked: {
    event: 'support_dislike_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: [] as const,
    allowedParams: [] as const,
    gaCustomDefinitionKinds: {},
    privacyNote: 'Record the click without attaching user text or destinations.'
  },
  support_review_link_clicked: {
    event: 'support_review_link_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: [] as const,
    allowedParams: ['variant'] as const,
    gaCustomDefinitionKinds: { variant: 'dimension' },
    privacyNote: 'Capture only the support prompt variant when present.'
  },
  support_review_acknowledged_clicked: {
    event: 'support_review_acknowledged_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: [] as const,
    allowedParams: ['variant'] as const,
    gaCustomDefinitionKinds: { variant: 'dimension' },
    privacyNote: 'Capture only the support prompt variant when present.'
  },
  support_dislike_reddit_clicked: {
    event: 'support_dislike_reddit_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: [] as const,
    allowedParams: [] as const,
    gaCustomDefinitionKinds: {},
    privacyNote: 'Record the feedback escape hatch without raw URLs.'
  },
  support_github_feedback_clicked: {
    event: 'support_github_feedback_clicked',
    consent: 'analytics',
    scope: 'production',
    requiredParams: [] as const,
    allowedParams: [] as const,
    gaCustomDefinitionKinds: {},
    privacyNote: 'Record the GitHub feedback click without raw URLs.'
  },
  support_like_toast_shown: {
    event: 'support_like_toast_shown',
    consent: 'analytics',
    scope: 'production',
    requiredParams: ['variant'] as const,
    allowedParams: ['variant'] as const,
    gaCustomDefinitionKinds: { variant: 'dimension' },
    privacyNote: 'Capture only the toast presentation variant.'
  },
  support_dislike_toast_shown: {
    event: 'support_dislike_toast_shown',
    consent: 'analytics',
    scope: 'production',
    requiredParams: [] as const,
    allowedParams: [] as const,
    gaCustomDefinitionKinds: {},
    privacyNote: 'Record the toast presentation without user-derived payloads.'
  },
  clear_stats: {
    event: 'clear_stats',
    consent: 'analytics',
    scope: 'production',
    requiredParams: ['timestamp'] as const,
    allowedParams: ['timestamp'] as const,
    gaCustomDefinitionKinds: { timestamp: 'metric' },
    privacyNote: 'Record only the non-negative client timestamp of the reset action.'
  },
  i18n_text_overflow: {
    event: 'i18n_text_overflow',
    consent: 'analytics',
    scope: 'production',
    requiredParams: ['key', 'language', 'length', 'used_short'] as const,
    allowedParams: [
      'key',
      'language',
      'component',
      'priority',
      'length',
      'limit',
      'used_short'
    ] as const,
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
  },
  extension_error: {
    event: 'extension_error',
    consent: 'errorReporting',
    scope: 'production',
    requiredParams: [
      'error_code',
      'error_domain',
      'error_category',
      'error_severity',
      'error_severity_level',
      'error_recoverable',
      'error_description',
      'extension_version',
      'timestamp'
    ] as const,
    allowedParams: [
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
    ] as const,
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
  },
  usage_dashboard_increment: {
    event: 'usage_dashboard_increment',
    consent: 'analytics',
    scope: 'contract-helper',
    requiredParams: ['category', 'increment', 'total_after'] as const,
    allowedParams: ['category', 'increment', 'total_after'] as const,
    gaCustomDefinitionKinds: {
      category: 'dimension',
      increment: 'metric',
      total_after: 'metric'
    },
    privacyNote: 'Keep the helper contract typed without promoting it to live production telemetry.'
  },
  runtime_harness_open: {
    event: 'runtime_harness_open',
    consent: 'analytics',
    scope: 'dev-only',
    requiredParams: ['source'] as const,
    allowedParams: ['source'] as const,
    gaCustomDefinitionKinds: { source: 'dimension' },
    privacyNote: 'Limit the harness signal to the single dev-only source enum.'
  },
  video_started: {
    event: 'video_started',
    consent: 'analytics',
    scope: 'retired-contract',
    requiredParams: ['source'] as const,
    allowedParams: ['source'] as const,
    gaCustomDefinitionKinds: { source: 'dimension' },
    privacyNote:
      'Keep the retired contract visible for audit and docs sync while blocking runtime acceptance.'
  }
} as const satisfies TelemetryEventCatalog;

export const TELEMETRY_EVENT_LIST = Object.values(
  TELEMETRY_EVENT_CATALOG
) as ReadonlyArray<TelemetryEventDefinition>;

export const TELEMETRY_EVENT_NAMES = TELEMETRY_EVENT_LIST.map(
  ({ event }) => event
) as ReadonlyArray<TelemetryEventName>;

export const USAGE_EVENT_CONTRACT_NAMES = TELEMETRY_EVENT_NAMES.filter(
  (eventName): eventName is UsageEventContractName => eventName !== 'extension_error'
);

export const RUNTIME_USAGE_EVENT_NAMES = USAGE_EVENT_CONTRACT_NAMES.filter(
  (eventName): eventName is UsageEventName =>
    TELEMETRY_EVENT_CATALOG[eventName].scope !== 'retired-contract'
);
