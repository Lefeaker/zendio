import { getConsentScopeForAnalyticsEvent, type AnalyticsConsentScope } from './analyticsConsent';
import {
  ANALYTICS_EVENT_CATALOG,
  getAnalyticsAllowedParams,
  type AnalyticsEventClassification,
  type AnalyticsEventName
} from './eventCatalog';
import { ANALYTICS_SCHEMA } from './schema/analyticsSchema';
import type { AnalyticsParamValidator } from './schema/analyticsParamValidators';

export interface AnalyticsProxyEventContract {
  name: AnalyticsEventName;
  classification: AnalyticsEventClassification;
  consentScope: AnalyticsConsentScope;
  runtimeAllowed: boolean;
  requiredParams: readonly string[];
  optionalParams: readonly string[];
  allowedParams: readonly string[];
  paramValidators: Readonly<Record<string, string>>;
}

export interface AnalyticsProxyContract {
  version: number;
  generatedAtSource: 'extension-schema';
  transports: readonly ['proxy', 'directDebug'];
  measurementIdPattern: string;
  events: readonly AnalyticsProxyEventContract[];
}

export const ANALYTICS_PROXY_CONTRACT_VERSION = 1;
export const ANALYTICS_PROXY_CONTRACT_TRANSPORTS = ['proxy', 'directDebug'] as const;
export const ANALYTICS_PROXY_MEASUREMENT_ID_PATTERN = '^G-[A-Z0-9-]{4,48}$';

const PARAM_VALIDATOR_LABELS = Object.freeze({
  attachment_count_bucket: 'enum:count_bucket',
  capture_count_bucket: 'enum:count_bucket',
  category: 'enum:usage_dashboard_category',
  component: 'enum:i18n_component',
  content_type: 'enum:content_type',
  destination: 'enum:export_destination',
  duration_bucket: 'enum:duration_bucket',
  failure_category: 'enum:failure_category',
  field: 'enum:privacy_field',
  highlight_count_bucket: 'enum:count_bucket',
  message_count_bucket: 'enum:count_bucket',
  platform: 'enum:analytics_platform',
  priority: 'enum:i18n_priority',
  screenshot_count_bucket: 'enum:count_bucket',
  section: 'enum:analytics_section',
  selection_length_bucket: 'enum:count_bucket',
  stage: 'enum:background_stage',
  storage_target: 'enum:storage_target',
  step: 'enum:onboarding_step',
  target: 'enum:support_link_target',
  theme: 'enum:options_theme',
  variant: 'enum:support_toast_variant'
} satisfies Record<string, string>);

const EVENT_PARAM_VALIDATOR_LABEL_OVERRIDES = Object.freeze({
  'analytics_data_cleared.outcome': 'enum:completed_failed_outcome',
  'clip_started.source': 'enum:analytics_source',
  'config_export_completed.outcome': 'enum:completed_failed_outcome',
  'config_import_completed.outcome': 'enum:completed_failed_outcome',
  'connection_test_completed.outcome': 'enum:completed_failed_outcome',
  'experimental_feature_toggled.feature_key': 'identifier:64',
  'extension_installed.source': 'literal:install',
  'i18n_text_overflow.key': 'identifier:80',
  'local_vault_permission_prompted.source': 'enum:local_vault_prompt_source',
  'local_vault_permission_resolved.outcome': 'enum:local_vault_outcome',
  'onboarding_started.source': 'enum:onboarding_source',
  'onboarding_support_action.action': 'enum:onboarding_action',
  'options_action_completed.action': 'identifier:64',
  'options_action_completed.outcome': 'enum:completed_failed_outcome',
  'options_opened.source': 'enum:options_open_source',
  'reader_session_started.source': 'enum:analytics_source',
  'runtime_harness_open.source': 'literal:runtime-observability-harness',
  'video_session_started.source': 'enum:analytics_source',
  'video_started.source': 'literal:menu'
} satisfies Record<string, string>);

const PARAM_VALIDATOR_LABEL_LOOKUP = PARAM_VALIDATOR_LABELS as Readonly<Record<string, string>>;
const EVENT_PARAM_VALIDATOR_LABEL_OVERRIDE_LOOKUP =
  EVENT_PARAM_VALIDATOR_LABEL_OVERRIDES as Readonly<Record<string, string>>;

export function buildAnalyticsProxyContract(): AnalyticsProxyContract {
  const events = Object.entries(ANALYTICS_EVENT_CATALOG).map(([eventName, definition]) => {
    const allowedParams = [...getAnalyticsAllowedParams(eventName as AnalyticsEventName)];
    const paramValidators = Object.freeze(
      Object.fromEntries(
        allowedParams.map((paramName) => [
          paramName,
          getAnalyticsProxyParamValidatorLabel(eventName as AnalyticsEventName, paramName)
        ])
      )
    );

    return {
      name: eventName as AnalyticsEventName,
      classification: definition.classification,
      consentScope: getConsentScopeForAnalyticsEvent(eventName as AnalyticsEventName),
      runtimeAllowed: definition.runtimeAllowed,
      requiredParams: [...definition.requiredParams],
      optionalParams: [...definition.optionalParams],
      allowedParams,
      paramValidators
    } satisfies AnalyticsProxyEventContract;
  });

  return {
    version: ANALYTICS_PROXY_CONTRACT_VERSION,
    generatedAtSource: 'extension-schema',
    transports: ANALYTICS_PROXY_CONTRACT_TRANSPORTS,
    measurementIdPattern: ANALYTICS_PROXY_MEASUREMENT_ID_PATTERN,
    events
  };
}

export function getAnalyticsProxyParamValidatorLabel(
  eventName: AnalyticsEventName,
  paramName: string
): string {
  const overrideKey = `${eventName}.${paramName}`;
  const overrideLabel = EVENT_PARAM_VALIDATOR_LABEL_OVERRIDE_LOOKUP[overrideKey];
  if (overrideLabel) {
    return overrideLabel;
  }

  const paramLabel = PARAM_VALIDATOR_LABEL_LOOKUP[paramName];
  if (paramLabel) {
    return paramLabel;
  }

  const schemaParams = ANALYTICS_SCHEMA[eventName].params as Readonly<
    Record<string, { validator: AnalyticsParamValidator }>
  >;
  const validator = schemaParams[paramName]?.validator;
  if (!validator) {
    throw new Error(`Unknown analytics proxy contract param: ${eventName}.${paramName}`);
  }

  if (isBooleanValidator(validator)) {
    return 'boolean';
  }

  if (isPositiveIntegerValidator(validator)) {
    return 'positive_integer';
  }

  if (isNonNegativeIntegerValidator(validator)) {
    return 'non_negative_integer';
  }

  if (isOperationIdValidator(validator)) {
    return 'operation_id';
  }

  if (isLanguageTagValidator(validator)) {
    return 'language_tag';
  }

  const identifierLabel = inferIdentifierLabel(validator);
  if (identifierLabel) {
    return identifierLabel;
  }

  throw new Error(`Unsupported analytics proxy validator for ${eventName}.${paramName}`);
}

export const ANALYTICS_PROXY_CONTRACT = buildAnalyticsProxyContract();

function isBooleanValidator(validator: AnalyticsParamValidator): boolean {
  return accepts(validator, true) && accepts(validator, false) && !accepts(validator, 'true');
}

function isPositiveIntegerValidator(validator: AnalyticsParamValidator): boolean {
  return (
    accepts(validator, 1) &&
    accepts(validator, 99) &&
    !accepts(validator, 0) &&
    !accepts(validator, -1) &&
    !accepts(validator, 1.5) &&
    !accepts(validator, '1')
  );
}

function isNonNegativeIntegerValidator(validator: AnalyticsParamValidator): boolean {
  return (
    accepts(validator, 0) &&
    accepts(validator, 1) &&
    !accepts(validator, -1) &&
    !accepts(validator, 1.5) &&
    !accepts(validator, '1')
  );
}

function isOperationIdValidator(validator: AnalyticsParamValidator): boolean {
  return accepts(validator, 'op_abcdef') && !accepts(validator, 'abcdef');
}

function isLanguageTagValidator(validator: AnalyticsParamValidator): boolean {
  return (
    accepts(validator, 'en') &&
    accepts(validator, 'zh-CN') &&
    !accepts(validator, 'runtime-observability-harness') &&
    !accepts(validator, 'invalid/language-tag')
  );
}

function inferIdentifierLabel(validator: AnalyticsParamValidator): string | undefined {
  if (
    !accepts(validator, 'a') ||
    !accepts(validator, 'alpha-1:beta.gamma') ||
    accepts(validator, 'alpha beta') ||
    accepts(validator, 'https://example.test/value')
  ) {
    return undefined;
  }

  let maxLength = 0;
  for (let length = 1; length <= 128; length += 1) {
    if (!accepts(validator, 'a'.repeat(length))) {
      break;
    }
    maxLength = length;
  }

  if (maxLength === 0 || accepts(validator, 'a'.repeat(maxLength + 1))) {
    return undefined;
  }

  return `identifier:${maxLength}`;
}

function accepts(validator: AnalyticsParamValidator, value: unknown): boolean {
  return validator(value) !== undefined;
}
