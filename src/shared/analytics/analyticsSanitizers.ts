import {
  ANALYTICS_EVENT_CATALOG,
  ANALYTICS_REQUIRED_PARAMS,
  type AnalyticsEventName,
  type AnalyticsEventParamMap,
  type AnalyticsPrimitive,
  type CountBucket,
  type DurationBucket,
  type UsageEventName,
  type UsageEventParamMap
} from './eventCatalog';

type ParamSanitizer = (value: unknown) => AnalyticsPrimitive | undefined;
type ParamSanitizerMap = {
  [EventName in AnalyticsEventName]: Record<
    keyof AnalyticsEventParamMap[EventName] & string,
    ParamSanitizer
  >;
};

const SUPPORT_TOAST_VARIANTS = new Set(['first', 'returning', 'acknowledged']);
const SUPPORT_LINK_TARGETS = new Set(['ko-fi', 'afdian']);
const USAGE_DASHBOARD_CATEGORIES = new Set(['ai_chat', 'fragment', 'article']);
const I18N_COMPONENTS = new Set(['button', 'label', 'hint', 'title']);
const I18N_PRIORITIES = new Set(['high', 'medium', 'low']);
const ANALYTICS_SOURCES = new Set([
  'menu',
  'toolbar',
  'shortcut',
  'runtime-observability-harness',
  'unknown'
]);
const CONTENT_TYPES = new Set(['article', 'selection', 'ai_chat', 'reader', 'video', 'other']);
const STORAGE_TARGETS = new Set(['downloads', 'local_folder', 'rest_api', 'unknown']);
const EXPORT_DESTINATIONS = new Set([
  'downloads',
  'local_folder',
  'rest_api',
  'clipboard',
  'unknown'
]);
const FAILURE_CATEGORIES = new Set([
  'permission',
  'connection',
  'validation',
  'classification',
  'extraction',
  'write',
  'timeout',
  'unsupported',
  'unknown'
]);
const PLATFORMS = new Set([
  'youtube',
  'bilibili',
  'chatgpt',
  'claude',
  'gemini',
  'other',
  'unknown'
]);
const OPTIONS_SECTIONS = new Set([
  'overview',
  'vault',
  'storage',
  'templates',
  'privacy',
  'onboarding',
  'usage',
  'video',
  'reader',
  'advanced'
]);
const DURATION_BUCKETS = new Set<DurationBucket>([
  'under_100ms',
  '100ms_to_499ms',
  '500ms_to_999ms',
  '1s_to_2s',
  '3s_to_9s',
  '10s_to_29s',
  '30s_to_119s',
  '2m_plus'
]);
const COUNT_BUCKETS = new Set<CountBucket>([
  'zero',
  'one',
  'two_to_five',
  'six_to_ten',
  'eleven_to_twenty',
  'twenty_one_to_fifty',
  'fifty_one_plus'
]);
const ONBOARDING_STEPS = new Set(['welcome', 'vault', 'privacy', 'shortcut', 'finish']);
const ONBOARDING_ACTIONS = new Set(['contact', 'feedback', 'docs']);
const PRIVACY_FIELDS = new Set(['analytics', 'errorReporting', 'debugMode']);
const OPTIONS_THEMES = new Set(['light', 'dark', 'system']);
const BACKGROUND_STAGES = new Set([
  'classify',
  'route',
  'write_attachments',
  'write_markdown',
  'record_usage'
]);

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const OPERATION_ID_PATTERN = /^op_[a-z0-9]{6,24}$/;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const SECRET_PATTERN = /(api[_-]?key|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]+|secret|token|password)/i;

const PARAM_SANITIZERS: ParamSanitizerMap = {
  extension_error: {
    error_code: (value) => sanitizeIdentifier(value, 80),
    error_domain: (value) => sanitizeIdentifier(value, 80),
    error_category: (value) => sanitizeIdentifier(value, 80),
    error_severity: (value) => sanitizeIdentifier(value, 32),
    error_recoverable: sanitizeBoolean,
    extension_version: (value) => sanitizeIdentifier(value, 32),
    browser_name: (value) => sanitizeIdentifier(value, 32),
    browser_version: (value) => sanitizeIdentifier(value, 16),
    failure_category: (value) => sanitizeEnum(value, FAILURE_CATEGORIES)
  },
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
    language: sanitizeLanguage,
    component: (value) => sanitizeEnum(value, I18N_COMPONENTS),
    priority: (value) => sanitizeEnum(value, I18N_PRIORITIES),
    length: sanitizeNonNegativeInteger,
    limit: sanitizeNonNegativeInteger,
    used_short: sanitizeBoolean
  },
  clear_stats: { timestamp: sanitizeNonNegativeInteger },
  usage_dashboard_increment: {
    category: (value) => sanitizeEnum(value, USAGE_DASHBOARD_CATEGORIES),
    increment: sanitizePositiveInteger,
    total_after: sanitizeNonNegativeInteger
  },
  runtime_harness_open: {
    source: (value) =>
      value === 'runtime-observability-harness' ? 'runtime-observability-harness' : undefined
  },
  video_started: { source: (value) => (value === 'menu' ? 'menu' : undefined) },
  extension_installed: {
    source: (value) => (value === 'install' ? 'install' : undefined),
    browser_family: (value) => sanitizeIdentifier(value, 32)
  },
  onboarding_started: { source: (value) => sanitizeEnum(value, new Set(['install', 'options'])) },
  onboarding_step_completed: {
    step: (value) => sanitizeEnum(value, ONBOARDING_STEPS),
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS)
  },
  onboarding_skipped: { step: (value) => sanitizeEnum(value, ONBOARDING_STEPS) },
  onboarding_support_action: { action: (value) => sanitizeEnum(value, ONBOARDING_ACTIONS) },
  onboarding_completed: { duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS) },
  privacy_consent_changed: {
    field: (value) => sanitizeEnum(value, PRIVACY_FIELDS),
    enabled: sanitizeBoolean
  },
  analytics_data_cleared: {
    outcome: (value) => sanitizeEnum(value, new Set(['completed', 'failed']))
  },
  options_opened: {
    source: (value) =>
      sanitizeEnum(value, new Set(['browser_action', 'runtime', 'link', 'unknown']))
  },
  options_section_viewed: { section: (value) => sanitizeEnum(value, OPTIONS_SECTIONS) },
  options_action_completed: {
    action: (value) => sanitizeIdentifier(value, 64),
    outcome: (value) => sanitizeEnum(value, new Set(['completed', 'failed'])),
    section: (value) => sanitizeEnum(value, OPTIONS_SECTIONS)
  },
  options_theme_changed: { theme: (value) => sanitizeEnum(value, OPTIONS_THEMES) },
  options_language_changed: { language: sanitizeLanguage },
  config_export_completed: {
    outcome: (value) => sanitizeEnum(value, new Set(['completed', 'failed']))
  },
  config_import_completed: {
    outcome: (value) => sanitizeEnum(value, new Set(['completed', 'failed'])),
    analytics_payload_present: sanitizeBoolean
  },
  experimental_feature_toggled: {
    feature_key: (value) => sanitizeIdentifier(value, 64),
    enabled: sanitizeBoolean
  },
  clip_started: {
    operation_id: sanitizeOperationId,
    source: (value) => sanitizeEnum(value, ANALYTICS_SOURCES),
    content_type: (value) => sanitizeEnum(value, CONTENT_TYPES)
  },
  clip_prompt_opened: {
    operation_id: sanitizeOperationId,
    content_type: (value) => sanitizeEnum(value, CONTENT_TYPES)
  },
  clip_prompt_submitted: {
    operation_id: sanitizeOperationId,
    content_type: (value) => sanitizeEnum(value, CONTENT_TYPES)
  },
  clip_prompt_cancelled: {
    operation_id: sanitizeOperationId,
    content_type: (value) => sanitizeEnum(value, CONTENT_TYPES)
  },
  extraction_completed: {
    operation_id: sanitizeOperationId,
    content_type: (value) => sanitizeEnum(value, CONTENT_TYPES),
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS),
    attachment_count_bucket: (value) => sanitizeEnum(value, COUNT_BUCKETS)
  },
  background_stage_completed: {
    operation_id: sanitizeOperationId,
    stage: (value) => sanitizeEnum(value, BACKGROUND_STAGES),
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS)
  },
  clip_save_completed: {
    operation_id: sanitizeOperationId,
    storage_target: (value) => sanitizeEnum(value, STORAGE_TARGETS),
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS)
  },
  clip_save_failed: {
    operation_id: sanitizeOperationId,
    storage_target: (value) => sanitizeEnum(value, STORAGE_TARGETS),
    failure_category: (value) => sanitizeEnum(value, FAILURE_CATEGORIES)
  },
  ai_chat_detected: {
    platform: (value) => sanitizeEnum(value, PLATFORMS),
    message_count_bucket: (value) => sanitizeEnum(value, COUNT_BUCKETS)
  },
  ai_chat_exported: {
    platform: (value) => sanitizeEnum(value, PLATFORMS),
    message_count_bucket: (value) => sanitizeEnum(value, COUNT_BUCKETS),
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS)
  },
  connection_test_completed: {
    storage_target: (value) => sanitizeEnum(value, STORAGE_TARGETS),
    outcome: (value) => sanitizeEnum(value, new Set(['completed', 'failed'])),
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS),
    failure_category: (value) => sanitizeEnum(value, FAILURE_CATEGORIES)
  },
  local_vault_permission_prompted: {
    source: (value) => sanitizeEnum(value, new Set(['clip', 'options']))
  },
  local_vault_permission_resolved: {
    outcome: (value) => sanitizeEnum(value, new Set(['completed', 'failed', 'cancelled']))
  },
  vault_write_completed: {
    storage_target: (value) => sanitizeEnum(value, STORAGE_TARGETS),
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS)
  },
  vault_write_failed: {
    storage_target: (value) => sanitizeEnum(value, STORAGE_TARGETS),
    failure_category: (value) => sanitizeEnum(value, FAILURE_CATEGORIES)
  },
  reader_session_started: { source: (value) => sanitizeEnum(value, ANALYTICS_SOURCES) },
  reader_highlight_added: {
    selection_length_bucket: (value) => sanitizeEnum(value, COUNT_BUCKETS),
    highlight_count_bucket: (value) => sanitizeEnum(value, COUNT_BUCKETS)
  },
  reader_exported: {
    destination: (value) => sanitizeEnum(value, EXPORT_DESTINATIONS),
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS)
  },
  reader_export_failed: {
    destination: (value) => sanitizeEnum(value, EXPORT_DESTINATIONS),
    failure_category: (value) => sanitizeEnum(value, FAILURE_CATEGORIES)
  },
  reader_session_cancelled: {
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS)
  },
  video_session_started: {
    platform: (value) => sanitizeEnum(value, PLATFORMS),
    source: (value) => sanitizeEnum(value, ANALYTICS_SOURCES)
  },
  video_timestamp_added: { capture_count_bucket: (value) => sanitizeEnum(value, COUNT_BUCKETS) },
  video_fragment_added: { capture_count_bucket: (value) => sanitizeEnum(value, COUNT_BUCKETS) },
  video_screenshot_captured: {
    screenshot_count_bucket: (value) => sanitizeEnum(value, COUNT_BUCKETS)
  },
  video_capture_removed: { capture_count_bucket: (value) => sanitizeEnum(value, COUNT_BUCKETS) },
  video_exported: {
    platform: (value) => sanitizeEnum(value, PLATFORMS),
    destination: (value) => sanitizeEnum(value, EXPORT_DESTINATIONS),
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS)
  },
  video_export_failed: {
    platform: (value) => sanitizeEnum(value, PLATFORMS),
    destination: (value) => sanitizeEnum(value, EXPORT_DESTINATIONS),
    failure_category: (value) => sanitizeEnum(value, FAILURE_CATEGORIES)
  },
  video_session_cancelled: {
    platform: (value) => sanitizeEnum(value, PLATFORMS),
    duration_bucket: (value) => sanitizeEnum(value, DURATION_BUCKETS)
  }
};

export function isAllowedAnalyticsEventName(eventName: unknown): eventName is AnalyticsEventName {
  return typeof eventName === 'string' && eventName in ANALYTICS_EVENT_CATALOG;
}

export function isAllowedUsageEventName(eventName: unknown): eventName is UsageEventName {
  return (
    isAllowedAnalyticsEventName(eventName) && ANALYTICS_EVENT_CATALOG[eventName].runtimeAllowed
  );
}

export function sanitizeAnalyticsEventParams<EventName extends AnalyticsEventName>(
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

export function sanitizeUsageEventParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: unknown
): Record<string, AnalyticsPrimitive> {
  return sanitizeAnalyticsEventParams(eventName, params);
}

export function parseAnalyticsEventParams<EventName extends AnalyticsEventName>(
  eventName: EventName,
  params: unknown
): AnalyticsEventParamMap[EventName] | null {
  const sanitizedParams = sanitizeAnalyticsEventParams(eventName, params);
  if (!hasRequiredAnalyticsEventParams(eventName, sanitizedParams)) {
    return null;
  }
  return sanitizedParams as AnalyticsEventParamMap[EventName];
}

export function parseUsageEventParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: unknown
): UsageEventParamMap[EventName] | null {
  return parseAnalyticsEventParams(eventName, params) as UsageEventParamMap[EventName] | null;
}

export function hasRequiredAnalyticsEventParams<EventName extends AnalyticsEventName>(
  eventName: EventName,
  params: Record<string, AnalyticsPrimitive>
): boolean {
  return ANALYTICS_REQUIRED_PARAMS[eventName].every((key) => params[key] !== undefined);
}

export function hasRequiredUsageEventParams<EventName extends UsageEventName>(
  eventName: EventName,
  params: Record<string, AnalyticsPrimitive>
): boolean {
  return hasRequiredAnalyticsEventParams(eventName, params);
}

function sanitizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function sanitizeEnum<const Value extends string>(
  value: unknown,
  allowedValues: ReadonlySet<Value> | ReadonlySet<string>
): Value | undefined {
  if (typeof value !== 'string' || hasForbiddenStringShape(value)) {
    return undefined;
  }
  return (allowedValues as ReadonlySet<string>).has(value) ? (value as Value) : undefined;
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
    hasForbiddenStringShape(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function sanitizeOperationId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return OPERATION_ID_PATTERN.test(normalized) ? normalized : undefined;
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

function sanitizeNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function sanitizePositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasForbiddenStringShape(value: string): boolean {
  const lowerValue = value.toLowerCase();
  return (
    lowerValue.includes('://') ||
    lowerValue.startsWith('www.') ||
    lowerValue.startsWith('/') ||
    lowerValue.includes('\\') ||
    lowerValue.includes('?') ||
    lowerValue.includes('#') ||
    lowerValue.includes('\n') ||
    lowerValue.includes('```') ||
    lowerValue.includes('---') ||
    SECRET_PATTERN.test(lowerValue)
  );
}
