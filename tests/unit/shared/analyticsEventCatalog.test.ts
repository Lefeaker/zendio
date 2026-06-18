import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_CATALOG_VERSION,
  ANALYTICS_EVENT_CATALOG,
  ANALYTICS_OPTIONAL_PARAMS,
  ANALYTICS_REQUIRED_PARAMS,
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
import type { AnalyticsEventName } from '../../../src/shared/analytics/eventCatalog';
import { ANALYTICS_SCHEMA } from '../../../src/shared/analytics/schema/analyticsSchema';

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
    expect(FUTURE_PRODUCT_EVENT_NAMES).not.toContain('extension_installed');
    expect(FUTURE_PRODUCT_EVENT_NAMES).not.toContain('video_screenshot_captured');
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
    expect(EMITTED_PRODUCT_EVENT_NAMES).toContain('extension_installed');
    expect(EMITTED_PRODUCT_EVENT_NAMES).toContain('video_screenshot_captured');
    expect(EMITTED_PRODUCT_EVENT_NAMES).toContain('extension_active_day');
    expect(EMITTED_PRODUCT_EVENT_NAMES).toContain('activation_milestone_completed');
    expect(EMITTED_PRODUCT_EVENT_NAMES).toContain('extraction_failed');
    expect(EMITTED_PRODUCT_EVENT_NAMES).toContain('reader_draft_restored');
    expect(EMITTED_PRODUCT_EVENT_NAMES).toContain('video_draft_restored');
    expect(RUNTIME_USAGE_EVENT_NAMES).toContain('extension_active_day');
    expect(RUNTIME_USAGE_EVENT_NAMES).toContain('activation_milestone_completed');
    expect(RUNTIME_USAGE_EVENT_NAMES).toContain('extraction_failed');
    expect(RUNTIME_USAGE_EVENT_NAMES).toContain('reader_draft_restored');
    expect(RUNTIME_USAGE_EVENT_NAMES).toContain('video_draft_restored');
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
    expect(ANALYTICS_EVENT_CATALOG.extension_active_day.requiredParams).toEqual([
      'day_index_bucket'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.activation_milestone_completed.requiredParams).toEqual([
      'milestone'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.extraction_failed.requiredParams).toEqual([
      'operation_id',
      'content_type',
      'failure_category'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.reader_draft_restored.requiredParams).toEqual([
      'highlight_count_bucket',
      'outcome'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.video_draft_restored.requiredParams).toEqual([
      'capture_count_bucket',
      'screenshot_count_bucket',
      'outcome'
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
    expect(ANALYTICS_EVENT_CATALOG.clip_save_completed.optionalParams).toEqual([
      'attachment_count_bucket'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.extraction_failed.optionalParams).toEqual(['duration_bucket']);
    expect(ANALYTICS_EVENT_CATALOG.extraction_completed.optionalParams).toEqual([
      'attachment_count_bucket'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.reader_exported.optionalParams).toEqual([
      'highlight_count_bucket'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.reader_draft_restored.optionalParams).toEqual([
      'detached_highlight_count_bucket',
      'duration_bucket'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.connection_test_completed.optionalParams).toEqual([
      'failure_category'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.video_exported.optionalParams).toEqual([
      'capture_count_bucket',
      'screenshot_count_bucket'
    ]);
    expect(ANALYTICS_EVENT_CATALOG.video_draft_restored.optionalParams).toEqual([
      'stale_screenshot_ref_count_bucket',
      'duration_bucket'
    ]);
  });

  it('keeps required and optional params disjoint for every catalog event', () => {
    for (const definition of Object.values(ANALYTICS_EVENT_CATALOG)) {
      expect(
        definition.optionalParams.filter((param) => definition.requiredParams.includes(param))
      ).toEqual([]);
    }
  });

  it('derives classification and param tables from the schema source of truth', () => {
    for (const eventName of Object.keys(ANALYTICS_SCHEMA) as AnalyticsEventName[]) {
      const schemaDefinition = ANALYTICS_SCHEMA[eventName];
      const requiredParams = Object.entries(schemaDefinition.params)
        .filter(([, paramDefinition]) => paramDefinition.required)
        .map(([paramName]) => paramName);
      const optionalParams = Object.entries(schemaDefinition.params)
        .filter(([, paramDefinition]) => !paramDefinition.required)
        .map(([paramName]) => paramName);

      expect(ANALYTICS_EVENT_CATALOG[eventName].classification).toBe(
        schemaDefinition.classification
      );
      expect(ANALYTICS_REQUIRED_PARAMS[eventName]).toEqual(requiredParams);
      expect(ANALYTICS_OPTIONAL_PARAMS[eventName]).toEqual(optionalParams);
    }
  });
});
