import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENT_CATALOG,
  getAnalyticsAllowedParams,
  type AnalyticsEventName
} from '../../../src/shared/analytics/eventCatalog';
import { getConsentScopeForAnalyticsEvent } from '../../../src/shared/analytics/analyticsConsent';

const forbiddenTransportPattern = /google-analytics\.com|debug\/mp\/collect|mp\/collect/i;
const forbiddenSecretKeyPattern =
  /api[_-]?secret|ga4?_api_secret|client_id|session_id|measurement_id|secret|token|password/i;

describe('analytics proxy contract', () => {
  it('derives public allowlist rows from the analytics schema', async () => {
    const { ANALYTICS_PROXY_CONTRACT } =
      await import('../../../src/shared/analytics/analyticsProxyContract');

    expect(ANALYTICS_PROXY_CONTRACT.generatedAtSource).toBe('extension-schema');
    expect(ANALYTICS_PROXY_CONTRACT.transports).toEqual(['proxy', 'directDebug']);
    expect(ANALYTICS_PROXY_CONTRACT.measurementIdPattern).toBe('^G-[A-Z0-9-]{4,48}$');
    expect(ANALYTICS_PROXY_CONTRACT.events).toHaveLength(
      Object.keys(ANALYTICS_EVENT_CATALOG).length
    );

    const eventRows = new Map(
      ANALYTICS_PROXY_CONTRACT.events.map((eventContract) => [eventContract.name, eventContract])
    );

    for (const [eventName, definition] of Object.entries(ANALYTICS_EVENT_CATALOG) as Array<
      [AnalyticsEventName, (typeof ANALYTICS_EVENT_CATALOG)[AnalyticsEventName]]
    >) {
      const contractRow = eventRows.get(eventName);
      expect(contractRow).toBeDefined();
      expect(contractRow).toMatchObject({
        name: eventName,
        classification: definition.classification,
        consentScope: getConsentScopeForAnalyticsEvent(eventName),
        runtimeAllowed: definition.runtimeAllowed,
        requiredParams: [...definition.requiredParams],
        optionalParams: [...definition.optionalParams],
        allowedParams: [...getAnalyticsAllowedParams(eventName)]
      });
      expect(Object.keys(contractRow?.paramValidators ?? {}).sort()).toEqual(
        [...getAnalyticsAllowedParams(eventName)].sort()
      );
    }

    expect(eventRows.get('support_like_clicked')?.paramValidators).toMatchObject({
      variant: 'enum:support_toast_variant'
    });
    expect(eventRows.get('onboarding_step_completed')?.paramValidators).toMatchObject({
      step: 'enum:onboarding_step',
      duration_bucket: 'enum:duration_bucket'
    });
    expect(eventRows.get('privacy_consent_changed')?.paramValidators).toMatchObject({
      field: 'enum:privacy_field',
      enabled: 'boolean'
    });
    expect(eventRows.get('clear_stats')?.paramValidators).toMatchObject({
      timestamp: 'non_negative_integer'
    });
    expect(eventRows.get('usage_dashboard_increment')?.paramValidators).toMatchObject({
      increment: 'positive_integer',
      total_after: 'non_negative_integer'
    });
    expect(eventRows.get('clip_started')?.paramValidators).toMatchObject({
      operation_id: 'operation_id',
      source: 'enum:analytics_source',
      content_type: 'enum:content_type'
    });
    expect(eventRows.get('options_language_changed')?.paramValidators).toMatchObject({
      language: 'language_tag'
    });
    expect(eventRows.get('extension_error')?.paramValidators).toMatchObject({
      error_code: 'identifier:80',
      error_domain: 'identifier:80',
      error_severity: 'identifier:32'
    });
    expect(eventRows.get('runtime_harness_open')?.paramValidators).toMatchObject({
      source: 'literal:runtime-observability-harness'
    });
    expect(eventRows.get('video_started')?.paramValidators).toMatchObject({
      source: 'literal:menu'
    });
    expect(eventRows.get('extension_installed')?.paramValidators).toMatchObject({
      source: 'literal:install'
    });
  });

  it('contains no secret-like keys, client identifiers, or direct endpoints', async () => {
    const { ANALYTICS_PROXY_CONTRACT } =
      await import('../../../src/shared/analytics/analyticsProxyContract');

    const serialized = JSON.stringify(ANALYTICS_PROXY_CONTRACT);

    expect(serialized).not.toMatch(forbiddenTransportPattern);
    expect(serialized).not.toMatch(forbiddenSecretKeyPattern);
    expect(serialized).not.toMatch(/https?:\/\//i);
    expect(serialized).not.toContain('G-ABCD1234');
    expect(serialized).not.toContain('session-1');
    expect(serialized).not.toContain('client-1');
  });
});
