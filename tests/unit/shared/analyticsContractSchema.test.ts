import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENT_CATALOG,
  ANALYTICS_OPTIONAL_PARAMS,
  ANALYTICS_REQUIRED_PARAMS,
  EMITTED_PRODUCT_EVENT_NAMES,
  FUTURE_PRODUCT_EVENT_NAMES,
  hasConsentForAnalyticsEvent,
  sanitizeAnalyticsEventParams
} from '../../../src/shared/analytics';
import { getConsentScopeForAnalyticsEvent } from '../../../src/shared/analytics/analyticsConsent';
import type { AnalyticsConfig } from '../../../src/shared/errors/analytics/analyticsConfig';
import type {
  AnalyticsEventDefinition,
  AnalyticsEventName,
  AnalyticsEventParamMap
} from '../../../src/shared/analytics/eventCatalog';
import { ANALYTICS_SCHEMA } from '../../../src/shared/analytics/schema/analyticsSchema';

type CatalogCoverageAssertion =
  Exclude<AnalyticsEventName, keyof typeof ANALYTICS_EVENT_CATALOG> extends never ? true : never;
type RequiredParamCoverageAssertion = {
  [EventName in AnalyticsEventName]: Exclude<
    (typeof ANALYTICS_REQUIRED_PARAMS)[EventName][number],
    keyof AnalyticsEventParamMap[EventName] & string
  > extends never
    ? true
    : never;
};
type OptionalParamCoverageAssertion = {
  [EventName in AnalyticsEventName]: Exclude<
    (typeof ANALYTICS_OPTIONAL_PARAMS)[EventName][number],
    keyof AnalyticsEventParamMap[EventName] & string
  > extends never
    ? true
    : never;
};
type TrackedAnalyticsSourceContract = {
  transportModes: string[];
  clientRuntimeContainsApiSecret: boolean;
  trackedConfigUsesPublicBuildConfigOnly: boolean;
  errorReporterUsesQueueTransportAndLiveConsent: boolean;
  runtimeCallsGoogleEndpointsDirectly: boolean;
  proxyBackedTransports: boolean;
  directDebugValidationIntent: boolean;
  consentHelperExists: boolean;
  queueUsesSharedConsentHelper: boolean;
  transportAppliesEventClassConsent: boolean;
  debugSuccessSummaryRedacted: boolean;
  successLoggingScopedToDirectDebug: boolean;
};
type AnalyticsValidationModule = {
  collectTrackedAnalyticsSourceContract: (projectRoot?: string) => TrackedAnalyticsSourceContract;
};

const CATALOG_COVERAGE_ASSERTION: CatalogCoverageAssertion = true;
const REQUIRED_PARAM_COVERAGE_ASSERTION: RequiredParamCoverageAssertion =
  {} as RequiredParamCoverageAssertion;
const OPTIONAL_PARAM_COVERAGE_ASSERTION: OptionalParamCoverageAssertion =
  {} as OptionalParamCoverageAssertion;
const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ANALYTICS_VALIDATOR_MODULE_URL = new URL(
  '../../../scripts/setup-error-analytics.js',
  import.meta.url
);

function sampleValueForParam(paramName: string): unknown {
  switch (paramName) {
    case 'action':
      return 'open_settings';
    case 'analytics_payload_present':
      return false;
    case 'attachment_count_bucket':
    case 'capture_count_bucket':
    case 'detached_highlight_count_bucket':
    case 'highlight_count_bucket':
    case 'message_count_bucket':
    case 'screenshot_count_bucket':
    case 'selection_length_bucket':
    case 'stale_screenshot_ref_count_bucket':
      return 'two_to_five';
    case 'browser_family':
      return 'chrome';
    case 'browser_name':
      return 'chrome';
    case 'browser_version':
      return '136';
    case 'category':
      return 'ai_chat';
    case 'component':
      return 'button';
    case 'content_type':
      return 'article';
    case 'day_index_bucket':
      return 'day_2_to_6';
    case 'destination':
      return 'downloads';
    case 'duration_bucket':
      return '1s_to_2s';
    case 'enabled':
    case 'error_recoverable':
    case 'used_short':
      return true;
    case 'error_category':
      return 'runtime';
    case 'error_code':
      return 'REST_TIMEOUT';
    case 'error_domain':
      return 'background';
    case 'error_severity':
      return 'warning';
    case 'extension_version':
      return '2.3.4';
    case 'failure_category':
      return 'connection';
    case 'feature_key':
      return 'video_capture';
    case 'field':
      return 'analytics';
    case 'increment':
    case 'length':
    case 'limit':
    case 'timestamp':
    case 'total_after':
      return 1;
    case 'key':
      return 'clipButton';
    case 'language':
      return 'en-US';
    case 'operation_id':
      return 'op_abc123';
    case 'milestone':
      return 'first_clip_saved';
    case 'outcome':
      return 'completed';
    case 'platform':
      return 'youtube';
    case 'priority':
      return 'high';
    case 'section':
      return 'privacy';
    case 'source':
      return 'toolbar';
    case 'stage':
      return 'route';
    case 'step':
      return 'welcome';
    case 'storage_target':
      return 'downloads';
    case 'target':
      return 'ko-fi';
    case 'theme':
      return 'dark';
    case 'variant':
      return 'first';
    default:
      throw new Error(`Missing canonical analytics sample for param: ${paramName}`);
  }
}

function buildCanonicalParams(
  definition: Pick<AnalyticsEventDefinition, 'requiredParams' | 'optionalParams'>
): Record<string, unknown> {
  const params = [...definition.requiredParams, ...definition.optionalParams].reduce<
    Record<string, unknown>
  >((accumulator, paramName) => {
    accumulator[paramName] = sampleValueForParam(paramName);
    return accumulator;
  }, {});
  params.unexpected_param = 'https://example.com/private?token=abc';
  return params;
}

function asCatalogEntries(): Array<[AnalyticsEventName, AnalyticsEventDefinition]> {
  return Object.entries(ANALYTICS_EVENT_CATALOG) as Array<
    [AnalyticsEventName, AnalyticsEventDefinition]
  >;
}

function createAnalyticsConfig(overrides: Partial<AnalyticsConfig> = {}): AnalyticsConfig {
  return {
    enabled: true,
    debugMode: false,
    measurementId: 'G-TEST1234',
    transportMode: 'proxy',
    proxyEndpoint: 'https://analytics.example.test/ga4',
    clientId: 'client-1',
    sessionId: 'session-1',
    reportingInterval: 30000,
    maxErrorsPerSession: 50,
    batchSize: 10,
    ...overrides
  };
}

async function importAnalyticsValidationModule(): Promise<AnalyticsValidationModule> {
  return (await import(ANALYTICS_VALIDATOR_MODULE_URL.href)) as AnalyticsValidationModule;
}

describe('analytics contract schema', () => {
  it('keeps the runtime catalog, required params, and optional params aligned with the typed map', () => {
    expect(CATALOG_COVERAGE_ASSERTION).toBe(true);
    expect(REQUIRED_PARAM_COVERAGE_ASSERTION).toBeDefined();
    expect(OPTIONAL_PARAM_COVERAGE_ASSERTION).toBeDefined();

    for (const [eventName, definition] of asCatalogEntries()) {
      expect(definition.name).toBe(eventName);
      expect(Array.isArray(definition.requiredParams)).toBe(true);
      expect(Array.isArray(definition.optionalParams)).toBe(true);
      expect(definition.requiredParams).toEqual(ANALYTICS_REQUIRED_PARAMS[eventName]);
      expect(definition.optionalParams).toEqual(ANALYTICS_OPTIONAL_PARAMS[eventName]);
    }
  });

  it('never lets the sanitizer emit params outside the catalog allowlist', () => {
    for (const [eventName, definition] of asCatalogEntries()) {
      const allowedParams = new Set([...definition.requiredParams, ...definition.optionalParams]);
      const sanitized = sanitizeAnalyticsEventParams(eventName, buildCanonicalParams(definition));
      expect(Object.keys(sanitized).every((paramName) => allowedParams.has(paramName))).toBe(true);
      expect(sanitized).not.toHaveProperty('unexpected_param');
    }
  });

  it('keeps actively emitted product events out of the future bucket', () => {
    for (const eventName of EMITTED_PRODUCT_EVENT_NAMES) {
      expect(FUTURE_PRODUCT_EVENT_NAMES).not.toContain(eventName);
      expect(ANALYTICS_EVENT_CATALOG[eventName].classification).toBe('emitted');
      expect(ANALYTICS_EVENT_CATALOG[eventName].runtimeAllowed).toBe(true);
    }
  });

  it('keeps extension_error scoped to error reporting instead of analytics consent', () => {
    expect(ANALYTICS_EVENT_CATALOG.extension_error.classification).toBe('error');
    expect(getConsentScopeForAnalyticsEvent('extension_error')).toBe('errorReporting');

    const errorOnlyConfig = createAnalyticsConfig({
      userConsent: {
        analytics: false,
        errorReporting: true,
        timestamp: 1,
        version: '1.0'
      }
    });
    const analyticsOnlyConfig = createAnalyticsConfig({
      userConsent: {
        analytics: true,
        errorReporting: false,
        timestamp: 1,
        version: '1.0'
      }
    });

    expect(hasConsentForAnalyticsEvent(errorOnlyConfig, 'extension_error')).toBe(true);
    expect(hasConsentForAnalyticsEvent(analyticsOnlyConfig, 'extension_error')).toBe(false);
  });

  it('fails closed for every event class when runtime is enabled without stored consent', () => {
    const missingConsentConfig = createAnalyticsConfig({
      enabled: true,
      userConsent: undefined
    });

    expect(hasConsentForAnalyticsEvent(missingConsentConfig, 'video_session_started')).toBe(false);
    expect(hasConsentForAnalyticsEvent(missingConsentConfig, 'extension_error')).toBe(false);
  });

  it('keeps analytics and error-reporting consent scoped to their event classes', () => {
    const analyticsOnlyConfig = createAnalyticsConfig({
      userConsent: {
        analytics: true,
        errorReporting: false,
        timestamp: 1,
        version: '1.0'
      }
    });
    const errorOnlyConfig = createAnalyticsConfig({
      userConsent: {
        analytics: false,
        errorReporting: true,
        timestamp: 1,
        version: '1.0'
      }
    });

    expect(hasConsentForAnalyticsEvent(analyticsOnlyConfig, 'video_session_started')).toBe(true);
    expect(hasConsentForAnalyticsEvent(analyticsOnlyConfig, 'extension_error')).toBe(false);
    expect(hasConsentForAnalyticsEvent(errorOnlyConfig, 'video_session_started')).toBe(false);
    expect(hasConsentForAnalyticsEvent(errorOnlyConfig, 'extension_error')).toBe(true);
  });

  it('keeps required and optional params derived directly from the schema rows', () => {
    for (const eventName of Object.keys(ANALYTICS_SCHEMA) as AnalyticsEventName[]) {
      const schemaDefinition = ANALYTICS_SCHEMA[eventName];
      const requiredParams = Object.entries(schemaDefinition.params)
        .filter(([, paramDefinition]) => paramDefinition.required)
        .map(([paramName]) => paramName);
      const optionalParams = Object.entries(schemaDefinition.params)
        .filter(([, paramDefinition]) => !paramDefinition.required)
        .map(([paramName]) => paramName);

      expect(ANALYTICS_REQUIRED_PARAMS[eventName]).toEqual(requiredParams);
      expect(ANALYTICS_OPTIONAL_PARAMS[eventName]).toEqual(optionalParams);
    }

    expect(getConsentScopeForAnalyticsEvent('video_session_started')).toBe('analytics');
  });

  it('keeps the production validator aligned with the tracked transport contract', async () => {
    const { collectTrackedAnalyticsSourceContract } = await importAnalyticsValidationModule();
    const trackedContract = collectTrackedAnalyticsSourceContract(PROJECT_ROOT);

    expect(trackedContract.transportModes).toEqual(['disabled', 'proxy', 'directDebug']);
    expect(trackedContract.clientRuntimeContainsApiSecret).toBe(false);
    expect(trackedContract.trackedConfigUsesPublicBuildConfigOnly).toBe(true);
    expect(trackedContract.errorReporterUsesQueueTransportAndLiveConsent).toBe(true);
    expect(trackedContract.runtimeCallsGoogleEndpointsDirectly).toBe(false);
    expect(trackedContract.proxyBackedTransports).toBe(true);
    expect(trackedContract.directDebugValidationIntent).toBe(true);
    expect(trackedContract.consentHelperExists).toBe(true);
    expect(trackedContract.queueUsesSharedConsentHelper).toBe(true);
    expect(trackedContract.transportAppliesEventClassConsent).toBe(true);
    expect(trackedContract.debugSuccessSummaryRedacted).toBe(true);
    expect(trackedContract.successLoggingScopedToDirectDebug).toBe(true);
  });
});
