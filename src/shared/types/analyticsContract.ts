export type AnalyticsPrimitive = string | number | boolean;
export type SupportLinkTarget = 'ko-fi' | 'afdian';
export type SupportToastVariant = 'first' | 'returning' | 'acknowledged';
export type UsageDashboardCategory = 'ai_chat' | 'fragment' | 'article';

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
  i18n_text_overflow: {
    key: string;
    language: string;
    component?: 'button' | 'label' | 'hint' | 'title';
    priority?: 'high' | 'medium' | 'low';
    length: number;
    limit?: number;
    used_short: boolean;
  };
  clear_stats: { timestamp: number };
  usage_dashboard_increment: {
    category: UsageDashboardCategory;
    increment: number;
    total_after: number;
  };
  video_started: { source: 'menu' };
  runtime_harness_open: { source: 'runtime-observability-harness' };
}

export type UsageEventName = keyof UsageEventParamMap;

const ALLOWED_USAGE_EVENT_NAMES = new Set<UsageEventName>([
  'support_link_clicked',
  'support_like_clicked',
  'support_dislike_clicked',
  'support_review_link_clicked',
  'support_review_acknowledged_clicked',
  'support_dislike_reddit_clicked',
  'support_github_feedback_clicked',
  'support_like_toast_shown',
  'support_dislike_toast_shown',
  'i18n_text_overflow',
  'clear_stats',
  'usage_dashboard_increment',
  'video_started',
  'runtime_harness_open'
]);

type ParamSanitizer = (value: unknown) => AnalyticsPrimitive | undefined;

const SUPPORT_TOAST_VARIANTS = new Set<SupportToastVariant>(['first', 'returning', 'acknowledged']);
const SUPPORT_LINK_TARGETS = new Set<SupportLinkTarget>(['ko-fi', 'afdian']);
const USAGE_DASHBOARD_CATEGORIES = new Set<UsageDashboardCategory>([
  'ai_chat',
  'fragment',
  'article'
]);
const I18N_COMPONENTS = new Set(['button', 'label', 'hint', 'title']);
const I18N_PRIORITIES = new Set(['high', 'medium', 'low']);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

const PARAM_SANITIZERS: {
  [EventName in UsageEventName]: Record<keyof UsageEventParamMap[EventName], ParamSanitizer>;
} = {
  support_link_clicked: { target: (value) => sanitizeEnum(value, SUPPORT_LINK_TARGETS) },
  support_like_clicked: { variant: (value) => sanitizeEnum(value, SUPPORT_TOAST_VARIANTS) },
  support_dislike_clicked: {},
  support_review_link_clicked: { variant: (value) => sanitizeEnum(value, SUPPORT_TOAST_VARIANTS) },
  support_review_acknowledged_clicked: {
    variant: (value) => sanitizeEnum(value, SUPPORT_TOAST_VARIANTS)
  },
  support_dislike_reddit_clicked: {},
  support_github_feedback_clicked: {},
  support_like_toast_shown: { variant: (value) => sanitizeEnum(value, SUPPORT_TOAST_VARIANTS) },
  support_dislike_toast_shown: {},
  i18n_text_overflow: {
    key: (value) => sanitizeIdentifier(value, 80),
    language: (value) => sanitizeLanguage(value),
    component: (value) => sanitizeEnum(value, I18N_COMPONENTS),
    priority: (value) => sanitizeEnum(value, I18N_PRIORITIES),
    length: (value) => sanitizeNonNegativeNumber(value),
    limit: (value) => sanitizeNonNegativeNumber(value),
    used_short: (value) => (typeof value === 'boolean' ? value : undefined)
  },
  clear_stats: { timestamp: (value) => sanitizeNonNegativeNumber(value) },
  usage_dashboard_increment: {
    category: (value) => sanitizeEnum(value, USAGE_DASHBOARD_CATEGORIES),
    increment: (value) => sanitizePositiveNumber(value),
    total_after: (value) => sanitizeNonNegativeNumber(value)
  },
  video_started: { source: (value) => (value === 'menu' ? value : undefined) },
  runtime_harness_open: {
    source: (value) => (value === 'runtime-observability-harness' ? value : undefined)
  }
};

const REQUIRED_PARAMS: {
  [EventName in UsageEventName]: ReadonlyArray<keyof UsageEventParamMap[EventName]>;
} = {
  support_link_clicked: ['target'],
  support_like_clicked: ['variant'],
  support_dislike_clicked: [],
  support_review_link_clicked: [],
  support_review_acknowledged_clicked: [],
  support_dislike_reddit_clicked: [],
  support_github_feedback_clicked: [],
  support_like_toast_shown: ['variant'],
  support_dislike_toast_shown: [],
  i18n_text_overflow: ['key', 'language', 'length', 'used_short'],
  clear_stats: ['timestamp'],
  usage_dashboard_increment: ['category', 'increment', 'total_after'],
  video_started: ['source'],
  runtime_harness_open: ['source']
};

export function isAllowedUsageEventName(eventName: unknown): eventName is UsageEventName {
  return (
    typeof eventName === 'string' && ALLOWED_USAGE_EVENT_NAMES.has(eventName as UsageEventName)
  );
}

export function sanitizeUsageEventParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: unknown
): Record<string, AnalyticsPrimitive> {
  if (!isPlainRecord(params)) {
    return {};
  }

  const sanitizers = PARAM_SANITIZERS[eventName];
  const sanitized: Record<string, AnalyticsPrimitive> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    const sanitizer = (sanitizers as Record<string, ParamSanitizer>)[key];
    if (!sanitizer) {
      continue;
    }
    const nextValue = sanitizer(value);
    if (nextValue !== undefined) {
      sanitized[key] = nextValue;
    }
  }

  return sanitized;
}

export function parseUsageEventParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: unknown
): UsageEventParamMap[EventName] | null {
  const sanitizedParams = sanitizeUsageEventParams(eventName, params);
  if (!hasRequiredUsageEventParams(eventName, sanitizedParams)) {
    return null;
  }
  return sanitizedParams as UsageEventParamMap[EventName];
}

export function hasRequiredUsageEventParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: Record<string, AnalyticsPrimitive>
): boolean {
  return REQUIRED_PARAMS[eventName].every((key) => params[String(key)] !== undefined);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeEnum<const Value extends string>(
  value: unknown,
  allowedValues: ReadonlySet<Value>
): Value | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return allowedValues.has(value as Value) ? (value as Value) : undefined;
}

function sanitizeIdentifier(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    !IDENTIFIER_PATTERN.test(normalized) ||
    containsUrlLikeText(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function sanitizeLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length > 16 || !LANGUAGE_PATTERN.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function sanitizeNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function sanitizePositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function containsUrlLikeText(value: string): boolean {
  const lowerValue = value.toLowerCase();
  return (
    lowerValue.includes('://') ||
    lowerValue.startsWith('www.') ||
    lowerValue.startsWith('/') ||
    lowerValue.includes('?') ||
    lowerValue.includes('#')
  );
}
