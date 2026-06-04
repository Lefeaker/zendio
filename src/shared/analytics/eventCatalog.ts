export const ANALYTICS_CATALOG_VERSION = 1;

export type AnalyticsPrimitive = string | number | boolean;

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
export type DurationBucket =
  | 'under_100ms'
  | '100ms_to_499ms'
  | '500ms_to_999ms'
  | '1s_to_2s'
  | '3s_to_9s'
  | '10s_to_29s'
  | '30s_to_119s'
  | '2m_plus';
export type CountBucket =
  | 'zero'
  | 'one'
  | 'two_to_five'
  | 'six_to_ten'
  | 'eleven_to_twenty'
  | 'twenty_one_to_fifty'
  | 'fifty_one_plus';
export type ContentType = 'article' | 'selection' | 'ai_chat' | 'reader' | 'video' | 'other';
export type StorageTarget = 'downloads' | 'local_folder' | 'rest_api' | 'unknown';
export type ExportDestination = 'downloads' | 'local_folder' | 'rest_api' | 'clipboard' | 'unknown';
export type FailureCategory =
  | 'permission'
  | 'connection'
  | 'validation'
  | 'classification'
  | 'extraction'
  | 'write'
  | 'timeout'
  | 'unsupported'
  | 'unknown';

export type SupportLinkTarget = 'ko-fi' | 'afdian';
export type SupportToastVariant = 'first' | 'returning' | 'acknowledged';
export type UsageDashboardCategory = 'ai_chat' | 'fragment' | 'article';
export type AnalyticsSource = 'menu' | 'toolbar' | 'shortcut' | 'runtime-observability-harness';
export type AnalyticsPlatform =
  | 'youtube'
  | 'bilibili'
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'other'
  | 'unknown';
export type AnalyticsSection =
  | 'overview'
  | 'vault'
  | 'storage'
  | 'templates'
  | 'privacy'
  | 'onboarding'
  | 'usage'
  | 'video'
  | 'reader'
  | 'advanced';

export interface AnalyticsEventDefinition {
  readonly name: AnalyticsEventName;
  readonly featureArea: FeatureArea;
  readonly classification: AnalyticsEventClassification;
  readonly runtimeAllowed: boolean;
  readonly requiredParams: readonly string[];
  readonly optionalParams: readonly string[];
}

export interface AnalyticsEventParamMap {
  extension_error: {
    error_code: string;
    error_domain: string;
    error_category?: string;
    error_severity: string;
    error_recoverable: boolean;
    extension_version?: string;
    browser_name?: string;
    browser_version?: string;
    failure_category?: FailureCategory;
  };
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
  runtime_harness_open: { source: 'runtime-observability-harness' };
  video_started: { source: 'menu' };
  extension_installed: { source: 'install'; browser_family?: string };
  onboarding_started: { source: 'install' | 'options' };
  onboarding_step_completed: {
    step: 'welcome' | 'vault' | 'privacy' | 'shortcut' | 'finish';
    duration_bucket: DurationBucket;
  };
  onboarding_skipped: { step: 'welcome' | 'vault' | 'privacy' | 'shortcut' | 'finish' };
  onboarding_support_action: { action: 'contact' | 'feedback' | 'docs' };
  onboarding_completed: { duration_bucket: DurationBucket };
  privacy_consent_changed: {
    field: 'analytics' | 'errorReporting' | 'debugMode';
    enabled: boolean;
  };
  analytics_data_cleared: { outcome: Extract<AnalyticsOutcome, 'completed' | 'failed'> };
  options_opened: { source: 'browser_action' | 'runtime' | 'link' | 'unknown' };
  options_section_viewed: { section: AnalyticsSection };
  options_action_completed: {
    action: string;
    outcome: Extract<AnalyticsOutcome, 'completed' | 'failed'>;
    section?: AnalyticsSection;
  };
  options_theme_changed: { theme: 'light' | 'dark' | 'system' };
  options_language_changed: { language: string };
  config_export_completed: { outcome: Extract<AnalyticsOutcome, 'completed' | 'failed'> };
  config_import_completed: {
    outcome: Extract<AnalyticsOutcome, 'completed' | 'failed'>;
    analytics_payload_present: boolean;
  };
  experimental_feature_toggled: { feature_key: string; enabled: boolean };
  clip_started: { operation_id: string; source: AnalyticsSource; content_type: ContentType };
  clip_prompt_opened: { operation_id: string; content_type: ContentType };
  clip_prompt_submitted: { operation_id: string; content_type: ContentType };
  clip_prompt_cancelled: { operation_id: string; content_type: ContentType };
  extraction_completed: {
    operation_id: string;
    content_type: ContentType;
    duration_bucket: DurationBucket;
    attachment_count_bucket?: CountBucket;
  };
  background_stage_completed: {
    operation_id: string;
    stage: 'classify' | 'route' | 'write_attachments' | 'write_markdown' | 'record_usage';
    duration_bucket: DurationBucket;
  };
  clip_save_completed: {
    operation_id: string;
    storage_target: StorageTarget;
    duration_bucket: DurationBucket;
  };
  clip_save_failed: {
    operation_id: string;
    storage_target: StorageTarget;
    failure_category: FailureCategory;
  };
  ai_chat_detected: { platform: AnalyticsPlatform; message_count_bucket: CountBucket };
  ai_chat_exported: {
    platform: AnalyticsPlatform;
    message_count_bucket: CountBucket;
    duration_bucket: DurationBucket;
  };
  connection_test_completed: {
    storage_target: StorageTarget;
    outcome: Extract<AnalyticsOutcome, 'completed' | 'failed'>;
    duration_bucket: DurationBucket;
    failure_category?: FailureCategory;
  };
  local_vault_permission_prompted: { source: 'clip' | 'options' };
  local_vault_permission_resolved: {
    outcome: Extract<AnalyticsOutcome, 'completed' | 'failed' | 'cancelled'>;
  };
  vault_write_completed: { storage_target: StorageTarget; duration_bucket: DurationBucket };
  vault_write_failed: { storage_target: StorageTarget; failure_category: FailureCategory };
  reader_session_started: { source: AnalyticsSource };
  reader_highlight_added: {
    selection_length_bucket: CountBucket;
    highlight_count_bucket: CountBucket;
  };
  reader_exported: { destination: ExportDestination; duration_bucket: DurationBucket };
  reader_export_failed: { destination: ExportDestination; failure_category: FailureCategory };
  reader_session_cancelled: { duration_bucket: DurationBucket };
  video_session_started: { platform: AnalyticsPlatform; source: AnalyticsSource };
  video_timestamp_added: { capture_count_bucket: CountBucket };
  video_fragment_added: { capture_count_bucket: CountBucket };
  video_screenshot_captured: { screenshot_count_bucket: CountBucket };
  video_capture_removed: { capture_count_bucket: CountBucket };
  video_exported: {
    platform: AnalyticsPlatform;
    destination: ExportDestination;
    duration_bucket: DurationBucket;
  };
  video_export_failed: {
    platform: AnalyticsPlatform;
    destination: ExportDestination;
    failure_category: FailureCategory;
  };
  video_session_cancelled: { platform: AnalyticsPlatform; duration_bucket: DurationBucket };
}

export type AnalyticsEventName = keyof AnalyticsEventParamMap;

export const EMITTED_USAGE_EVENT_NAMES = [
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
  'usage_dashboard_increment'
] as const satisfies readonly AnalyticsEventName[];

export const ERROR_EVENT_NAMES = [
  'extension_error'
] as const satisfies readonly AnalyticsEventName[];
export const DEV_ONLY_EVENT_NAMES = [
  'runtime_harness_open'
] as const satisfies readonly AnalyticsEventName[];
export const CONTRACT_ONLY_EVENT_NAMES = [
  'video_started'
] as const satisfies readonly AnalyticsEventName[];
export const INVENTORY_ONLY_EVENT_NAMES = ['extension_usage', 'extension_performance'] as const;
export const DOCS_ONLY_EVENT_NAMES = ['support_dislike_qr_clicked'] as const;

export const FUTURE_PRODUCT_EVENT_NAMES = [
  'extension_installed',
  'onboarding_started',
  'onboarding_step_completed',
  'onboarding_skipped',
  'onboarding_support_action',
  'onboarding_completed',
  'privacy_consent_changed',
  'analytics_data_cleared',
  'options_opened',
  'options_section_viewed',
  'options_action_completed',
  'options_theme_changed',
  'options_language_changed',
  'config_export_completed',
  'config_import_completed',
  'experimental_feature_toggled',
  'clip_started',
  'clip_prompt_opened',
  'clip_prompt_submitted',
  'clip_prompt_cancelled',
  'extraction_completed',
  'background_stage_completed',
  'clip_save_completed',
  'clip_save_failed',
  'ai_chat_detected',
  'ai_chat_exported',
  'connection_test_completed',
  'local_vault_permission_prompted',
  'local_vault_permission_resolved',
  'vault_write_completed',
  'vault_write_failed',
  'reader_session_started',
  'reader_highlight_added',
  'reader_exported',
  'reader_export_failed',
  'reader_session_cancelled',
  'video_session_started',
  'video_timestamp_added',
  'video_fragment_added',
  'video_screenshot_captured',
  'video_capture_removed',
  'video_exported',
  'video_export_failed',
  'video_session_cancelled'
] as const satisfies readonly AnalyticsEventName[];

export const PRODUCT_USAGE_EVENT_NAMES = FUTURE_PRODUCT_EVENT_NAMES;

export type RuntimeUsageEventName =
  | (typeof EMITTED_USAGE_EVENT_NAMES)[number]
  | (typeof DEV_ONLY_EVENT_NAMES)[number]
  | (typeof CONTRACT_ONLY_EVENT_NAMES)[number]
  | (typeof PRODUCT_USAGE_EVENT_NAMES)[number];

export type UsageEventName = RuntimeUsageEventName;
export type UsageEventParamMap = Pick<AnalyticsEventParamMap, UsageEventName>;

type RequiredParamMap = {
  [EventName in AnalyticsEventName]: readonly (keyof AnalyticsEventParamMap[EventName] & string)[];
};

export const ANALYTICS_REQUIRED_PARAMS: RequiredParamMap = {
  extension_error: ['error_code', 'error_domain', 'error_severity', 'error_recoverable'],
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
  runtime_harness_open: ['source'],
  video_started: ['source'],
  extension_installed: ['source'],
  onboarding_started: ['source'],
  onboarding_step_completed: ['step', 'duration_bucket'],
  onboarding_skipped: ['step'],
  onboarding_support_action: ['action'],
  onboarding_completed: ['duration_bucket'],
  privacy_consent_changed: ['field', 'enabled'],
  analytics_data_cleared: ['outcome'],
  options_opened: ['source'],
  options_section_viewed: ['section'],
  options_action_completed: ['action', 'outcome'],
  options_theme_changed: ['theme'],
  options_language_changed: ['language'],
  config_export_completed: ['outcome'],
  config_import_completed: ['outcome', 'analytics_payload_present'],
  experimental_feature_toggled: ['feature_key', 'enabled'],
  clip_started: ['operation_id', 'source', 'content_type'],
  clip_prompt_opened: ['operation_id', 'content_type'],
  clip_prompt_submitted: ['operation_id', 'content_type'],
  clip_prompt_cancelled: ['operation_id', 'content_type'],
  extraction_completed: ['operation_id', 'content_type', 'duration_bucket'],
  background_stage_completed: ['operation_id', 'stage', 'duration_bucket'],
  clip_save_completed: ['operation_id', 'storage_target', 'duration_bucket'],
  clip_save_failed: ['operation_id', 'storage_target', 'failure_category'],
  ai_chat_detected: ['platform', 'message_count_bucket'],
  ai_chat_exported: ['platform', 'message_count_bucket', 'duration_bucket'],
  connection_test_completed: ['storage_target', 'outcome', 'duration_bucket'],
  local_vault_permission_prompted: ['source'],
  local_vault_permission_resolved: ['outcome'],
  vault_write_completed: ['storage_target', 'duration_bucket'],
  vault_write_failed: ['storage_target', 'failure_category'],
  reader_session_started: ['source'],
  reader_highlight_added: ['selection_length_bucket', 'highlight_count_bucket'],
  reader_exported: ['destination', 'duration_bucket'],
  reader_export_failed: ['destination', 'failure_category'],
  reader_session_cancelled: ['duration_bucket'],
  video_session_started: ['platform', 'source'],
  video_timestamp_added: ['capture_count_bucket'],
  video_fragment_added: ['capture_count_bucket'],
  video_screenshot_captured: ['screenshot_count_bucket'],
  video_capture_removed: ['capture_count_bucket'],
  video_exported: ['platform', 'destination', 'duration_bucket'],
  video_export_failed: ['platform', 'destination', 'failure_category'],
  video_session_cancelled: ['platform', 'duration_bucket']
};

const FEATURE_AREAS: Record<AnalyticsEventName, FeatureArea> = {
  extension_error: 'error',
  support_link_clicked: 'support',
  support_like_clicked: 'support',
  support_dislike_clicked: 'support',
  support_review_link_clicked: 'support',
  support_review_acknowledged_clicked: 'support',
  support_dislike_reddit_clicked: 'support',
  support_github_feedback_clicked: 'support',
  support_like_toast_shown: 'support',
  support_dislike_toast_shown: 'support',
  i18n_text_overflow: 'i18n',
  clear_stats: 'usage',
  usage_dashboard_increment: 'usage',
  runtime_harness_open: 'runtime',
  video_started: 'video',
  extension_installed: 'activation',
  onboarding_started: 'onboarding',
  onboarding_step_completed: 'onboarding',
  onboarding_skipped: 'onboarding',
  onboarding_support_action: 'onboarding',
  onboarding_completed: 'onboarding',
  privacy_consent_changed: 'privacy',
  analytics_data_cleared: 'privacy',
  options_opened: 'options',
  options_section_viewed: 'options',
  options_action_completed: 'options',
  options_theme_changed: 'options',
  options_language_changed: 'options',
  config_export_completed: 'options',
  config_import_completed: 'options',
  experimental_feature_toggled: 'options',
  clip_started: 'clip',
  clip_prompt_opened: 'clip',
  clip_prompt_submitted: 'clip',
  clip_prompt_cancelled: 'clip',
  extraction_completed: 'clip',
  background_stage_completed: 'clip',
  clip_save_completed: 'clip',
  clip_save_failed: 'clip',
  ai_chat_detected: 'ai_chat',
  ai_chat_exported: 'ai_chat',
  connection_test_completed: 'connection',
  local_vault_permission_prompted: 'storage',
  local_vault_permission_resolved: 'storage',
  vault_write_completed: 'storage',
  vault_write_failed: 'storage',
  reader_session_started: 'reader',
  reader_highlight_added: 'reader',
  reader_exported: 'reader',
  reader_export_failed: 'reader',
  reader_session_cancelled: 'reader',
  video_session_started: 'video',
  video_timestamp_added: 'video',
  video_fragment_added: 'video',
  video_screenshot_captured: 'video',
  video_capture_removed: 'video',
  video_exported: 'video',
  video_export_failed: 'video',
  video_session_cancelled: 'video'
};

function createDefinition<EventName extends AnalyticsEventName>(
  name: EventName,
  classification: AnalyticsEventClassification,
  runtimeAllowed: boolean
): AnalyticsEventDefinition {
  const requiredParams = ANALYTICS_REQUIRED_PARAMS[name];
  return {
    name,
    featureArea: FEATURE_AREAS[name],
    classification,
    runtimeAllowed,
    requiredParams,
    optionalParams: []
  };
}

export const ANALYTICS_EVENT_CATALOG = Object.freeze({
  ...Object.fromEntries(
    EMITTED_USAGE_EVENT_NAMES.map((name) => [name, createDefinition(name, 'emitted', true)])
  ),
  extension_error: createDefinition('extension_error', 'error', false),
  runtime_harness_open: createDefinition('runtime_harness_open', 'dev-only', true),
  video_started: createDefinition('video_started', 'contract-only', true),
  ...Object.fromEntries(
    FUTURE_PRODUCT_EVENT_NAMES.map((name) => [name, createDefinition(name, 'future', true)])
  )
}) as Readonly<Record<AnalyticsEventName, AnalyticsEventDefinition>>;

export const RUNTIME_USAGE_EVENT_NAMES = Object.freeze(
  Object.entries(ANALYTICS_EVENT_CATALOG)
    .filter(([, definition]) => definition.runtimeAllowed)
    .map(([name]) => name as UsageEventName)
);
