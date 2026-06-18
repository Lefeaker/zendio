import {
  booleanValue,
  enumValue,
  identifier,
  languageTag,
  literalValue,
  nonNegativeInteger,
  operationId,
  positiveInteger,
  runtimeHarnessSource,
  type AnalyticsParamPrimitive,
  type AnalyticsParamValidator
} from './analyticsParamValidators';

export type AnalyticsPrimitive = AnalyticsParamPrimitive;
export type AnalyticsEventClassification =
  | 'emitted'
  | 'error'
  | 'dev-only'
  | 'contract-only'
  | 'future'
  | 'inventory-only'
  | 'docs-only';
export type FeatureArea =
  | 'activation'
  | 'ai_chat'
  | 'clip'
  | 'connection'
  | 'error'
  | 'i18n'
  | 'onboarding'
  | 'options'
  | 'privacy'
  | 'reader'
  | 'runtime'
  | 'storage'
  | 'support'
  | 'usage'
  | 'video';
export type AnalyticsOutcome = 'started' | 'completed' | 'cancelled' | 'failed' | 'skipped';
export const DURATION_BUCKETS = [
  'under_100ms',
  '100ms_to_499ms',
  '500ms_to_999ms',
  '1s_to_2s',
  '3s_to_9s',
  '10s_to_29s',
  '30s_to_119s',
  '2m_plus'
] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];
export const COUNT_BUCKETS = [
  'zero',
  'one',
  'two_to_five',
  'six_to_ten',
  'eleven_to_twenty',
  'twenty_one_to_fifty',
  'fifty_one_plus'
] as const;
export type CountBucket = (typeof COUNT_BUCKETS)[number];
export const ACTIVE_DAY_BUCKETS = [
  'day_0',
  'day_1',
  'day_2_to_6',
  'day_7_to_29',
  'day_30_plus'
] as const;
export type ActiveDayBucket = (typeof ACTIVE_DAY_BUCKETS)[number];
export const CONTENT_TYPES = [
  'article',
  'selection',
  'ai_chat',
  'reader',
  'video',
  'other'
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const STORAGE_TARGETS = ['downloads', 'local_folder', 'rest_api', 'unknown'] as const;
export type StorageTarget = (typeof STORAGE_TARGETS)[number];
export const EXPORT_DESTINATIONS = [
  'downloads',
  'local_folder',
  'rest_api',
  'clipboard',
  'unknown'
] as const;
export type ExportDestination = (typeof EXPORT_DESTINATIONS)[number];
export const FAILURE_CATEGORIES = [
  'permission',
  'connection',
  'validation',
  'classification',
  'extraction',
  'write',
  'timeout',
  'unsupported',
  'unknown'
] as const;
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];
export const ACTIVATION_MILESTONES = [
  'onboarding_completed',
  'first_clip_saved',
  'first_reader_exported',
  'first_video_exported'
] as const;
export type ActivationMilestone = (typeof ACTIVATION_MILESTONES)[number];
export const BROWSER_FAMILIES = [
  'chrome',
  'edge',
  'firefox',
  'safari',
  'other',
  'unknown'
] as const;
export type BrowserFamily = (typeof BROWSER_FAMILIES)[number];
export const SUPPORT_LINK_TARGETS = ['ko-fi', 'afdian'] as const;
export type SupportLinkTarget = (typeof SUPPORT_LINK_TARGETS)[number];
export const SUPPORT_TOAST_VARIANTS = ['first', 'returning', 'acknowledged'] as const;
export type SupportToastVariant = (typeof SUPPORT_TOAST_VARIANTS)[number];
export const USAGE_DASHBOARD_CATEGORIES = ['ai_chat', 'fragment', 'article'] as const;
export type UsageDashboardCategory = (typeof USAGE_DASHBOARD_CATEGORIES)[number];
export const ANALYTICS_SOURCES = [
  'menu',
  'toolbar',
  'shortcut',
  'runtime-observability-harness',
  'unknown'
] as const;
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];
export const ANALYTICS_PLATFORMS = [
  'youtube',
  'bilibili',
  'chatgpt',
  'claude',
  'gemini',
  'other',
  'unknown'
] as const;
export type AnalyticsPlatform = (typeof ANALYTICS_PLATFORMS)[number];
export const ANALYTICS_SECTIONS = [
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
] as const;
export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number];
export type AnalyticsConsentScope = 'analytics' | 'errorReporting' | 'none';

const I18N_COMPONENTS = ['button', 'label', 'hint', 'title'] as const;
const I18N_PRIORITIES = ['high', 'medium', 'low'] as const;
const COMPLETED_FAILED_OUTCOMES = ['completed', 'failed'] as const;
const LOCAL_VAULT_OUTCOMES = ['completed', 'failed', 'cancelled'] as const;
const ONBOARDING_STEPS = ['welcome', 'vault', 'privacy', 'shortcut', 'finish'] as const;
const ONBOARDING_ACTIONS = ['contact', 'feedback', 'docs'] as const;
const PRIVACY_FIELDS = ['analytics', 'errorReporting', 'debugMode'] as const;
const OPTIONS_THEMES = ['light', 'dark', 'system'] as const;
const BACKGROUND_STAGES = [
  'classify',
  'route',
  'write_attachments',
  'write_markdown',
  'record_usage'
] as const;
const OPTIONS_OPEN_SOURCES = ['browser_action', 'runtime', 'link', 'unknown'] as const;
const LOCAL_VAULT_PROMPT_SOURCES = ['clip', 'options'] as const;

export type AnalyticsParamDefinition<
  Validator extends AnalyticsParamValidator = AnalyticsParamValidator,
  IsRequired extends boolean = boolean
> = { readonly required: IsRequired; readonly validator: Validator };
type AnalyticsParamDefinitions = Record<string, AnalyticsParamDefinition>;
export type AnalyticsEventSchemaDefinition<
  ParamDefinitions extends AnalyticsParamDefinitions = AnalyticsParamDefinitions
> = {
  readonly featureArea: FeatureArea;
  readonly classification: AnalyticsEventClassification;
  readonly runtimeAllowed: boolean;
  readonly consentScope: AnalyticsConsentScope;
  readonly emittedKind: 'usage' | 'product' | 'none';
  readonly params: ParamDefinitions;
};
type AnalyticsSchemaDefinition = Record<string, AnalyticsEventSchemaDefinition>;
type EventParamDefinitions<
  Schema extends AnalyticsSchemaDefinition,
  EventName extends keyof Schema & string
> = Schema[EventName]['params'];
type ParamValue<Definition extends AnalyticsParamDefinition> =
  Definition['validator'] extends AnalyticsParamValidator<infer Value> ? Value : never;
type RequiredParamNames<ParamDefinitions extends AnalyticsParamDefinitions> = Extract<
  {
    [ParamName in keyof ParamDefinitions]: ParamDefinitions[ParamName]['required'] extends true
      ? ParamName
      : never;
  }[keyof ParamDefinitions],
  string
>;
type OptionalParamNames<ParamDefinitions extends AnalyticsParamDefinitions> = Extract<
  {
    [ParamName in keyof ParamDefinitions]: ParamDefinitions[ParamName]['required'] extends false
      ? ParamName
      : never;
  }[keyof ParamDefinitions],
  string
>;
type AnalyticsParamsFromDefinitions<ParamDefinitions extends AnalyticsParamDefinitions> =
  keyof ParamDefinitions extends never
    ? Record<string, never>
    : {
        [ParamName in RequiredParamNames<ParamDefinitions>]: ParamValue<
          ParamDefinitions[ParamName]
        >;
      } & {
        [ParamName in OptionalParamNames<ParamDefinitions>]?: ParamValue<
          ParamDefinitions[ParamName]
        >;
      };

export type AnalyticsEventParamMapFromSchema<Schema extends AnalyticsSchemaDefinition> = {
  [EventName in keyof Schema & string]: AnalyticsParamsFromDefinitions<
    EventParamDefinitions<Schema, EventName>
  >;
};
export type AnalyticsRequiredParamMapFromSchema<Schema extends AnalyticsSchemaDefinition> = {
  readonly [EventName in keyof Schema & string]: readonly RequiredParamNames<
    EventParamDefinitions<Schema, EventName>
  >[];
};
export type AnalyticsOptionalParamMapFromSchema<Schema extends AnalyticsSchemaDefinition> = {
  readonly [EventName in keyof Schema & string]: readonly OptionalParamNames<
    EventParamDefinitions<Schema, EventName>
  >[];
};
export type AnalyticsEventNamesMatching<
  Schema extends AnalyticsSchemaDefinition,
  Criteria extends Partial<Omit<AnalyticsEventSchemaDefinition, 'params'>>
> = Extract<
  {
    [EventName in keyof Schema & string]: Schema[EventName] extends Criteria ? EventName : never;
  }[keyof Schema & string],
  string
>;

const req = <const Validator extends AnalyticsParamValidator>(validator: Validator) =>
  ({ required: true, validator }) as const;
const opt = <const Validator extends AnalyticsParamValidator>(validator: Validator) =>
  ({ required: false, validator }) as const;
const event = <
  const Params extends AnalyticsParamDefinitions,
  const Classification extends AnalyticsEventClassification,
  const RuntimeAllowed extends boolean,
  const ConsentScope extends AnalyticsConsentScope,
  const EmittedKind extends 'usage' | 'product' | 'none'
>(
  featureArea: FeatureArea,
  classification: Classification,
  runtimeAllowed: RuntimeAllowed,
  consentScope: ConsentScope,
  emittedKind: EmittedKind,
  params: Params
) => ({ featureArea, classification, runtimeAllowed, consentScope, emittedKind, params });
const usageEvent = <const Params extends AnalyticsParamDefinitions>(
  featureArea: FeatureArea,
  params: Params
) => event(featureArea, 'emitted', true, 'analytics', 'usage', params);
const productEvent = <const Params extends AnalyticsParamDefinitions>(
  featureArea: FeatureArea,
  params: Params
) => event(featureArea, 'emitted', true, 'analytics', 'product', params);
const errorEvent = <const Params extends AnalyticsParamDefinitions>(
  featureArea: FeatureArea,
  params: Params
) => event(featureArea, 'error', false, 'errorReporting', 'none', params);
const devOnlyEvent = <const Params extends AnalyticsParamDefinitions>(
  featureArea: FeatureArea,
  params: Params
) => event(featureArea, 'dev-only', true, 'analytics', 'none', params);
const contractOnlyEvent = <const Params extends AnalyticsParamDefinitions>(
  featureArea: FeatureArea,
  params: Params
) => event(featureArea, 'contract-only', true, 'analytics', 'none', params);

export function defineAnalyticsSchema<const Schema extends AnalyticsSchemaDefinition>(
  schema: Schema
): Schema {
  return schema;
}

export const ANALYTICS_SCHEMA = defineAnalyticsSchema({
  extension_error: errorEvent('error', {
    error_code: req(identifier(80)),
    error_domain: req(identifier(80)),
    error_category: opt(identifier(80)),
    error_severity: req(identifier(32)),
    error_recoverable: req(booleanValue()),
    extension_version: opt(identifier(32)),
    browser_name: opt(identifier(32)),
    browser_version: opt(identifier(16)),
    failure_category: opt(enumValue(FAILURE_CATEGORIES))
  }),
  support_link_clicked: usageEvent('support', { target: req(enumValue(SUPPORT_LINK_TARGETS)) }),
  support_like_clicked: usageEvent('support', { variant: req(enumValue(SUPPORT_TOAST_VARIANTS)) }),
  support_dislike_clicked: usageEvent('support', {}),
  support_review_link_clicked: usageEvent('support', {
    variant: opt(enumValue(SUPPORT_TOAST_VARIANTS))
  }),
  support_review_acknowledged_clicked: usageEvent('support', {
    variant: opt(enumValue(SUPPORT_TOAST_VARIANTS))
  }),
  support_dislike_reddit_clicked: usageEvent('support', {}),
  support_github_feedback_clicked: usageEvent('support', {}),
  support_like_toast_shown: usageEvent('support', {
    variant: req(enumValue(SUPPORT_TOAST_VARIANTS))
  }),
  support_dislike_toast_shown: usageEvent('support', {}),
  i18n_text_overflow: usageEvent('i18n', {
    key: req(identifier(80)),
    language: req(languageTag()),
    component: opt(enumValue(I18N_COMPONENTS)),
    priority: opt(enumValue(I18N_PRIORITIES)),
    length: req(nonNegativeInteger()),
    limit: opt(nonNegativeInteger()),
    used_short: req(booleanValue())
  }),
  clear_stats: usageEvent('usage', { timestamp: req(nonNegativeInteger()) }),
  usage_dashboard_increment: usageEvent('usage', {
    category: req(enumValue(USAGE_DASHBOARD_CATEGORIES)),
    increment: req(positiveInteger()),
    total_after: req(nonNegativeInteger())
  }),
  runtime_harness_open: devOnlyEvent('runtime', { source: req(runtimeHarnessSource()) }),
  video_started: contractOnlyEvent('video', { source: req(literalValue('menu')) }),
  extension_installed: productEvent('activation', {
    source: req(literalValue('install')),
    browser_family: opt(enumValue(BROWSER_FAMILIES))
  }),
  extension_active_day: productEvent('activation', {
    day_index_bucket: req(enumValue(ACTIVE_DAY_BUCKETS))
  }),
  activation_milestone_completed: productEvent('activation', {
    milestone: req(enumValue(ACTIVATION_MILESTONES))
  }),
  onboarding_started: productEvent('onboarding', {
    source: req(enumValue(['install', 'options'] as const))
  }),
  onboarding_step_completed: productEvent('onboarding', {
    step: req(enumValue(ONBOARDING_STEPS)),
    duration_bucket: req(enumValue(DURATION_BUCKETS))
  }),
  onboarding_skipped: productEvent('onboarding', { step: req(enumValue(ONBOARDING_STEPS)) }),
  onboarding_support_action: productEvent('onboarding', {
    action: req(enumValue(ONBOARDING_ACTIONS))
  }),
  onboarding_completed: productEvent('onboarding', {
    duration_bucket: req(enumValue(DURATION_BUCKETS))
  }),
  privacy_consent_changed: productEvent('privacy', {
    field: req(enumValue(PRIVACY_FIELDS)),
    enabled: req(booleanValue())
  }),
  analytics_data_cleared: productEvent('privacy', {
    outcome: req(enumValue(COMPLETED_FAILED_OUTCOMES))
  }),
  options_opened: productEvent('options', { source: req(enumValue(OPTIONS_OPEN_SOURCES)) }),
  options_section_viewed: productEvent('options', { section: req(enumValue(ANALYTICS_SECTIONS)) }),
  options_action_completed: productEvent('options', {
    action: req(identifier(64)),
    outcome: req(enumValue(COMPLETED_FAILED_OUTCOMES)),
    section: opt(enumValue(ANALYTICS_SECTIONS))
  }),
  options_theme_changed: productEvent('options', { theme: req(enumValue(OPTIONS_THEMES)) }),
  options_language_changed: productEvent('options', { language: req(languageTag()) }),
  config_export_completed: productEvent('options', {
    outcome: req(enumValue(COMPLETED_FAILED_OUTCOMES))
  }),
  config_import_completed: productEvent('options', {
    outcome: req(enumValue(COMPLETED_FAILED_OUTCOMES)),
    analytics_payload_present: req(booleanValue())
  }),
  experimental_feature_toggled: productEvent('options', {
    feature_key: req(identifier(64)),
    enabled: req(booleanValue())
  }),
  clip_started: productEvent('clip', {
    operation_id: req(operationId()),
    source: req(enumValue(ANALYTICS_SOURCES)),
    content_type: req(enumValue(CONTENT_TYPES))
  }),
  clip_prompt_opened: productEvent('clip', {
    operation_id: req(operationId()),
    content_type: req(enumValue(CONTENT_TYPES))
  }),
  clip_prompt_submitted: productEvent('clip', {
    operation_id: req(operationId()),
    content_type: req(enumValue(CONTENT_TYPES))
  }),
  clip_prompt_cancelled: productEvent('clip', {
    operation_id: req(operationId()),
    content_type: req(enumValue(CONTENT_TYPES))
  }),
  extraction_completed: productEvent('clip', {
    operation_id: req(operationId()),
    content_type: req(enumValue(CONTENT_TYPES)),
    duration_bucket: req(enumValue(DURATION_BUCKETS)),
    attachment_count_bucket: opt(enumValue(COUNT_BUCKETS))
  }),
  extraction_failed: productEvent('clip', {
    operation_id: req(operationId()),
    content_type: req(enumValue(CONTENT_TYPES)),
    failure_category: req(enumValue(FAILURE_CATEGORIES)),
    duration_bucket: opt(enumValue(DURATION_BUCKETS))
  }),
  background_stage_completed: productEvent('clip', {
    operation_id: req(operationId()),
    stage: req(enumValue(BACKGROUND_STAGES)),
    duration_bucket: req(enumValue(DURATION_BUCKETS))
  }),
  clip_save_completed: productEvent('clip', {
    operation_id: req(operationId()),
    storage_target: req(enumValue(STORAGE_TARGETS)),
    duration_bucket: req(enumValue(DURATION_BUCKETS)),
    attachment_count_bucket: opt(enumValue(COUNT_BUCKETS))
  }),
  clip_save_failed: productEvent('clip', {
    operation_id: req(operationId()),
    storage_target: req(enumValue(STORAGE_TARGETS)),
    failure_category: req(enumValue(FAILURE_CATEGORIES))
  }),
  ai_chat_detected: productEvent('ai_chat', {
    platform: req(enumValue(ANALYTICS_PLATFORMS)),
    message_count_bucket: req(enumValue(COUNT_BUCKETS))
  }),
  ai_chat_exported: productEvent('ai_chat', {
    platform: req(enumValue(ANALYTICS_PLATFORMS)),
    message_count_bucket: req(enumValue(COUNT_BUCKETS)),
    duration_bucket: req(enumValue(DURATION_BUCKETS))
  }),
  connection_test_completed: productEvent('connection', {
    storage_target: req(enumValue(STORAGE_TARGETS)),
    outcome: req(enumValue(COMPLETED_FAILED_OUTCOMES)),
    duration_bucket: req(enumValue(DURATION_BUCKETS)),
    failure_category: opt(enumValue(FAILURE_CATEGORIES))
  }),
  local_vault_permission_prompted: productEvent('storage', {
    source: req(enumValue(LOCAL_VAULT_PROMPT_SOURCES))
  }),
  local_vault_permission_resolved: productEvent('storage', {
    outcome: req(enumValue(LOCAL_VAULT_OUTCOMES))
  }),
  vault_write_completed: productEvent('storage', {
    storage_target: req(enumValue(STORAGE_TARGETS)),
    duration_bucket: req(enumValue(DURATION_BUCKETS))
  }),
  vault_write_failed: productEvent('storage', {
    storage_target: req(enumValue(STORAGE_TARGETS)),
    failure_category: req(enumValue(FAILURE_CATEGORIES))
  }),
  reader_session_started: productEvent('reader', { source: req(enumValue(ANALYTICS_SOURCES)) }),
  reader_draft_restored: productEvent('reader', {
    highlight_count_bucket: req(enumValue(COUNT_BUCKETS)),
    outcome: req(enumValue(COMPLETED_FAILED_OUTCOMES)),
    detached_highlight_count_bucket: opt(enumValue(COUNT_BUCKETS)),
    duration_bucket: opt(enumValue(DURATION_BUCKETS))
  }),
  reader_highlight_added: productEvent('reader', {
    selection_length_bucket: req(enumValue(COUNT_BUCKETS)),
    highlight_count_bucket: req(enumValue(COUNT_BUCKETS))
  }),
  reader_exported: productEvent('reader', {
    destination: req(enumValue(EXPORT_DESTINATIONS)),
    duration_bucket: req(enumValue(DURATION_BUCKETS)),
    highlight_count_bucket: opt(enumValue(COUNT_BUCKETS))
  }),
  reader_export_failed: productEvent('reader', {
    destination: req(enumValue(EXPORT_DESTINATIONS)),
    failure_category: req(enumValue(FAILURE_CATEGORIES))
  }),
  reader_session_cancelled: productEvent('reader', {
    duration_bucket: req(enumValue(DURATION_BUCKETS))
  }),
  video_session_started: productEvent('video', {
    platform: req(enumValue(ANALYTICS_PLATFORMS)),
    source: req(enumValue(ANALYTICS_SOURCES))
  }),
  video_draft_restored: productEvent('video', {
    capture_count_bucket: req(enumValue(COUNT_BUCKETS)),
    screenshot_count_bucket: req(enumValue(COUNT_BUCKETS)),
    outcome: req(enumValue(COMPLETED_FAILED_OUTCOMES)),
    stale_screenshot_ref_count_bucket: opt(enumValue(COUNT_BUCKETS)),
    duration_bucket: opt(enumValue(DURATION_BUCKETS))
  }),
  video_timestamp_added: productEvent('video', {
    capture_count_bucket: req(enumValue(COUNT_BUCKETS))
  }),
  video_fragment_added: productEvent('video', {
    capture_count_bucket: req(enumValue(COUNT_BUCKETS))
  }),
  video_screenshot_captured: productEvent('video', {
    screenshot_count_bucket: req(enumValue(COUNT_BUCKETS))
  }),
  video_capture_removed: productEvent('video', {
    capture_count_bucket: req(enumValue(COUNT_BUCKETS))
  }),
  video_exported: productEvent('video', {
    platform: req(enumValue(ANALYTICS_PLATFORMS)),
    destination: req(enumValue(EXPORT_DESTINATIONS)),
    duration_bucket: req(enumValue(DURATION_BUCKETS)),
    capture_count_bucket: opt(enumValue(COUNT_BUCKETS)),
    screenshot_count_bucket: opt(enumValue(COUNT_BUCKETS))
  }),
  video_export_failed: productEvent('video', {
    platform: req(enumValue(ANALYTICS_PLATFORMS)),
    destination: req(enumValue(EXPORT_DESTINATIONS)),
    failure_category: req(enumValue(FAILURE_CATEGORIES))
  }),
  video_session_cancelled: productEvent('video', {
    platform: req(enumValue(ANALYTICS_PLATFORMS)),
    duration_bucket: req(enumValue(DURATION_BUCKETS))
  })
});
