import {
  booleanParam,
  enumParam,
  hasRequiredTelemetryParams,
  identifierParam,
  type AnalyticsPrimitive,
  languageParam,
  nonNegativeNumberParam,
  positiveNumberParam,
  sanitizeTelemetryParams,
  type TelemetryParamDefinition
} from '../analytics/analyticsSanitizers';
import {
  I18N_OVERFLOW_COMPONENTS,
  I18N_OVERFLOW_PRIORITIES,
  RUNTIME_HARNESS_SOURCES,
  RUNTIME_USAGE_EVENT_NAMES,
  SUPPORT_LINK_TARGETS,
  SUPPORT_TOAST_VARIANTS,
  type SupportLinkTarget,
  type SupportToastVariant,
  type TelemetryConsentKind,
  type TelemetryEventDefinition,
  type TelemetryEventName,
  type TelemetryEventParamMap,
  type TelemetryEventScope,
  type UsageDashboardCategory,
  type UsageEventContractName,
  type UsageEventName,
  type UsageEventParamMap,
  USAGE_DASHBOARD_CATEGORIES,
  VIDEO_EVENT_SOURCES
} from '../analytics/eventCatalog';

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
};

const ALLOWED_USAGE_EVENT_NAME_SET = new Set<string>(RUNTIME_USAGE_EVENT_NAMES);

type UsageEventParamDefinitions = {
  [EventName in UsageEventContractName]: Record<
    keyof UsageEventParamMap[EventName],
    TelemetryParamDefinition
  >;
};

const USAGE_EVENT_PARAM_DEFINITIONS = {
  support_link_clicked: {
    target: enumParam(SUPPORT_LINK_TARGETS, {
      required: true,
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only the stable support link target enum.'
    })
  },
  support_like_clicked: {
    variant: enumParam(SUPPORT_TOAST_VARIANTS, {
      required: true,
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only the support prompt variant enum.'
    })
  },
  support_dislike_clicked: {},
  support_review_link_clicked: {
    variant: enumParam(SUPPORT_TOAST_VARIANTS, {
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only the support prompt variant enum.'
    })
  },
  support_review_acknowledged_clicked: {
    variant: enumParam(SUPPORT_TOAST_VARIANTS, {
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only the support prompt variant enum.'
    })
  },
  support_dislike_reddit_clicked: {},
  support_github_feedback_clicked: {},
  support_like_toast_shown: {
    variant: enumParam(SUPPORT_TOAST_VARIANTS, {
      required: true,
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only the support prompt variant enum.'
    })
  },
  support_dislike_toast_shown: {},
  clear_stats: {
    timestamp: nonNegativeNumberParam({
      required: true,
      gaCustomDefinitionKind: 'metric',
      privacyNote: 'Allow only non-negative timestamps.'
    })
  },
  i18n_text_overflow: {
    key: identifierParam(80, {
      required: true,
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only safe i18n keys.'
    }),
    language: languageParam({
      required: true,
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only locale tags.'
    }),
    component: enumParam(I18N_OVERFLOW_COMPONENTS, {
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only low-cardinality component enums.'
    }),
    priority: enumParam(I18N_OVERFLOW_PRIORITIES, {
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only low-cardinality priority enums.'
    }),
    length: nonNegativeNumberParam({
      required: true,
      max: 10_000,
      gaCustomDefinitionKind: 'metric',
      privacyNote: 'Allow only bounded layout lengths.'
    }),
    limit: nonNegativeNumberParam({
      max: 10_000,
      gaCustomDefinitionKind: 'metric',
      privacyNote: 'Allow only bounded layout limits.'
    }),
    used_short: booleanParam({
      required: true,
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only boolean overflow decisions.'
    })
  },
  usage_dashboard_increment: {
    category: enumParam(USAGE_DASHBOARD_CATEGORIES, {
      required: true,
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only the current usage dashboard category enum.'
    }),
    increment: positiveNumberParam({
      required: true,
      max: 10_000,
      gaCustomDefinitionKind: 'metric',
      privacyNote: 'Allow only positive bounded increments.'
    }),
    total_after: nonNegativeNumberParam({
      required: true,
      max: 1_000_000,
      gaCustomDefinitionKind: 'metric',
      privacyNote: 'Allow only non-negative bounded totals.'
    })
  },
  runtime_harness_open: {
    source: enumParam(RUNTIME_HARNESS_SOURCES, {
      required: true,
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Allow only the dev harness source enum.'
    })
  },
  video_started: {
    source: enumParam(VIDEO_EVENT_SOURCES, {
      required: true,
      gaCustomDefinitionKind: 'dimension',
      privacyNote: 'Keep the retired contract typed without permitting runtime sends.'
    })
  }
} satisfies UsageEventParamDefinitions;

export function isAllowedUsageEventName(eventName: unknown): eventName is UsageEventName {
  return typeof eventName === 'string' && ALLOWED_USAGE_EVENT_NAME_SET.has(eventName);
}

export function sanitizeUsageEventParams<EventName extends UsageEventContractName>(
  eventName: EventName,
  params: unknown
): Record<string, AnalyticsPrimitive> {
  const paramDefinitions = USAGE_EVENT_PARAM_DEFINITIONS[
    eventName
  ] as UsageEventParamDefinitions[EventName];

  return sanitizeTelemetryParams(paramDefinitions, params);
}

export function parseUsageEventParams<EventName extends UsageEventContractName>(
  eventName: EventName,
  params: unknown
): UsageEventParamMap[EventName] | null {
  const sanitizedParams = sanitizeUsageEventParams(eventName, params);
  if (!hasRequiredUsageEventParams(eventName, sanitizedParams)) {
    return null;
  }

  return sanitizedParams as UsageEventParamMap[EventName];
}

export function hasRequiredUsageEventParams<EventName extends UsageEventContractName>(
  eventName: EventName,
  params: Record<string, AnalyticsPrimitive>
): boolean {
  const paramDefinitions = USAGE_EVENT_PARAM_DEFINITIONS[
    eventName
  ] as UsageEventParamDefinitions[EventName];

  return hasRequiredTelemetryParams(paramDefinitions, params);
}
