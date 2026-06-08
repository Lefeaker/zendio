import { describe, expect, it } from 'vitest';
import {
  TELEMETRY_EVENT_CATALOG,
  TELEMETRY_EVENT_LIST,
  TELEMETRY_EVENT_NAMES
} from '../../../src/shared/analytics';
import { isAllowedUsageEventName } from '../../../src/shared/types/analytics';

describe('telemetry event catalog', () => {
  it('defines the canonical telemetry event list and scopes from one source', () => {
    expect(
      TELEMETRY_EVENT_LIST.map(({ event, scope }) => ({
        event,
        scope
      }))
    ).toEqual([
      { event: 'support_link_clicked', scope: 'production' },
      { event: 'support_like_clicked', scope: 'production' },
      { event: 'support_dislike_clicked', scope: 'production' },
      { event: 'support_review_link_clicked', scope: 'production' },
      { event: 'support_review_acknowledged_clicked', scope: 'production' },
      { event: 'support_dislike_reddit_clicked', scope: 'production' },
      { event: 'support_github_feedback_clicked', scope: 'production' },
      { event: 'support_like_toast_shown', scope: 'production' },
      { event: 'support_dislike_toast_shown', scope: 'production' },
      { event: 'clear_stats', scope: 'production' },
      { event: 'i18n_text_overflow', scope: 'production' },
      { event: 'extension_error', scope: 'production' },
      { event: 'usage_dashboard_increment', scope: 'contract-helper' },
      { event: 'runtime_harness_open', scope: 'dev-only' },
      { event: 'video_started', scope: 'retired-contract' }
    ]);

    expect(TELEMETRY_EVENT_NAMES).toEqual(TELEMETRY_EVENT_LIST.map(({ event }) => event));
    expect(TELEMETRY_EVENT_NAMES).not.toContain('support_dislike_qr_clicked');
    expect(TELEMETRY_EVENT_NAMES).not.toContain('extension_usage');
    expect(TELEMETRY_EVENT_NAMES).not.toContain('extension_performance');
  });

  it('keeps consent and GA param metadata alongside required and allowed params', () => {
    expect(TELEMETRY_EVENT_CATALOG.extension_error.consent).toBe('errorReporting');
    expect(TELEMETRY_EVENT_CATALOG.i18n_text_overflow.requiredParams).toEqual([
      'key',
      'language',
      'length',
      'used_short'
    ]);
    expect(TELEMETRY_EVENT_CATALOG.i18n_text_overflow.allowedParams).toEqual([
      'key',
      'language',
      'component',
      'priority',
      'length',
      'limit',
      'used_short'
    ]);
    expect(TELEMETRY_EVENT_CATALOG.i18n_text_overflow.gaCustomDefinitionKinds).toMatchObject({
      key: 'dimension',
      language: 'dimension',
      length: 'metric',
      limit: 'metric',
      used_short: 'dimension'
    });
  });

  it('classifies helper, dev-only, and retired events without promoting them to live production usage events', () => {
    expect(TELEMETRY_EVENT_CATALOG.usage_dashboard_increment.scope).toBe('contract-helper');
    expect(TELEMETRY_EVENT_CATALOG.runtime_harness_open.scope).toBe('dev-only');
    expect(TELEMETRY_EVENT_CATALOG.video_started.scope).toBe('retired-contract');

    expect(isAllowedUsageEventName('extension_error')).toBe(false);
    expect(isAllowedUsageEventName('usage_dashboard_increment')).toBe(true);
    expect(isAllowedUsageEventName('runtime_harness_open')).toBe(true);
    expect(isAllowedUsageEventName('video_started')).toBe(false);
  });

  it('exposes the same catalog through the shared analytics barrel for later doc sync consumers', async () => {
    const analytics = await import('../../../src/shared/analytics');

    expect(analytics.TELEMETRY_EVENT_CATALOG).toBe(TELEMETRY_EVENT_CATALOG);
    expect(analytics.TELEMETRY_EVENT_LIST.map(({ event }) => event)).toEqual(TELEMETRY_EVENT_NAMES);
  });
});
