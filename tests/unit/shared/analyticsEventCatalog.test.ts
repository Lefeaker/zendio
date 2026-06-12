import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_CATALOG_VERSION,
  ANALYTICS_EVENT_CATALOG,
  CONTRACT_ONLY_EVENT_NAMES,
  DEV_ONLY_EVENT_NAMES,
  DOCS_ONLY_EVENT_NAMES,
  EMITTED_PRODUCT_EVENT_NAMES,
  EMITTED_USAGE_EVENT_NAMES,
  ERROR_EVENT_NAMES,
  FUTURE_PRODUCT_EVENT_NAMES,
  INVENTORY_ONLY_EVENT_NAMES,
  RUNTIME_USAGE_EVENT_NAMES
} from '../../../src/shared/analytics';

describe('analytics event catalog', () => {
  it('records a stable catalog version and current emitted event classifications', () => {
    expect(ANALYTICS_CATALOG_VERSION).toBe(2);

    for (const eventName of EMITTED_USAGE_EVENT_NAMES) {
      expect(ANALYTICS_EVENT_CATALOG[eventName]).toMatchObject({
        classification: 'emitted',
        runtimeAllowed: true
      });
    }

    for (const eventName of EMITTED_PRODUCT_EVENT_NAMES) {
      expect(ANALYTICS_EVENT_CATALOG[eventName]).toMatchObject({
        classification: 'emitted',
        runtimeAllowed: true
      });
    }

    expect(ANALYTICS_EVENT_CATALOG.extension_error).toMatchObject({
      classification: 'error',
      runtimeAllowed: false
    });
  });

  it('keeps dev, contract, inventory, and stale docs names out of production event claims', () => {
    expect(DEV_ONLY_EVENT_NAMES).toEqual(['runtime_harness_open']);
    expect(CONTRACT_ONLY_EVENT_NAMES).toEqual(['video_started']);
    expect(INVENTORY_ONLY_EVENT_NAMES).toEqual(['extension_usage', 'extension_performance']);
    expect(DOCS_ONLY_EVENT_NAMES).toEqual(['support_dislike_qr_clicked']);

    expect(ANALYTICS_EVENT_CATALOG.runtime_harness_open.classification).toBe('dev-only');
    expect(ANALYTICS_EVENT_CATALOG.video_started.classification).toBe('contract-only');
  });

  it('keeps only inactive catalog rows classified as future while active product events stay emitted', () => {
    expect(FUTURE_PRODUCT_EVENT_NAMES).toContain('extension_installed');
    expect(FUTURE_PRODUCT_EVENT_NAMES).toContain('video_screenshot_captured');
    expect(FUTURE_PRODUCT_EVENT_NAMES).not.toContain('clip_started');
    expect(FUTURE_PRODUCT_EVENT_NAMES).not.toContain('privacy_consent_changed');
    expect(FUTURE_PRODUCT_EVENT_NAMES).not.toContain('reader_exported');
    expect(FUTURE_PRODUCT_EVENT_NAMES).not.toContain('video_session_started');

    expect(ANALYTICS_EVENT_CATALOG.clip_started).toMatchObject({
      classification: 'emitted',
      runtimeAllowed: true
    });
    expect(RUNTIME_USAGE_EVENT_NAMES).toContain('clip_started');
    expect(RUNTIME_USAGE_EVENT_NAMES).toContain('privacy_consent_changed');
    expect(RUNTIME_USAGE_EVENT_NAMES).toContain('reader_exported');
    expect(RUNTIME_USAGE_EVENT_NAMES).toContain('video_session_started');
  });

  it('declares required params for representative current and future events', () => {
    expect(ANALYTICS_EVENT_CATALOG.support_link_clicked.requiredParams).toEqual(['target']);
    expect(ANALYTICS_EVENT_CATALOG.i18n_text_overflow.requiredParams).toEqual([
      'key',
      'language',
      'length',
      'used_short'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.clip_started.requiredParams).toEqual([
      'operation_id',
      'source',
      'content_type'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.video_session_started.requiredParams).toEqual([
      'platform',
      'source'
    ]);
    expect(ERROR_EVENT_NAMES).toEqual(['extension_error']);
  });

  it('records optional params for events that declare optional analytics fields', () => {
    expect(ANALYTICS_EVENT_CATALOG.extension_error.optionalParams).toEqual([
      'error_category',
      'extension_version',
      'browser_name',
      'browser_version',
      'failure_category'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.support_review_link_clicked.optionalParams).toEqual(['variant']);
    expect(ANALYTICS_EVENT_CATALOG.support_review_acknowledged_clicked.optionalParams).toEqual([
      'variant'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.i18n_text_overflow.optionalParams).toEqual([
      'component',
      'priority',
      'limit'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.extension_installed.optionalParams).toEqual(['browser_family']);
    expect(ANALYTICS_EVENT_CATALOG.options_action_completed.optionalParams).toEqual(['section']);
    expect(ANALYTICS_EVENT_CATALOG.extraction_completed.optionalParams).toEqual([
      'attachment_count_bucket'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.connection_test_completed.optionalParams).toEqual([
      'failure_category'
    ]);
  });

  it('keeps required and optional params disjoint for every catalog event', () => {
    for (const definition of Object.values(ANALYTICS_EVENT_CATALOG)) {
      expect(
        definition.optionalParams.filter((param) => definition.requiredParams.includes(param))
      ).toEqual([]);
    }
  });
});
