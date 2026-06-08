import { describe, expect, it } from 'vitest';
import {
  isTrackTelemetryEventMessage,
  isAllowedUsageEventName,
  isTrackUsageEventMessage,
  parseUsageEventParams,
  sanitizeUsageEventParams
} from '../../../src/shared/types/analytics';

describe('usage telemetry contract', () => {
  const extensionErrorParams = {
    error_code: 'NETWORK_TIMEOUT',
    error_domain: 'network',
    error_category: 'transport',
    error_severity: 'high',
    error_severity_level: 3,
    error_recoverable: true,
    error_description: 'network_timeout',
    timestamp: 1_717_171_717_171
  } as const;

  it('accepts TRACK_USAGE_EVENT and legacy track messages for current allowlisted usage events', () => {
    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'support_like_clicked',
        params: { variant: 'first' }
      })
    ).toBe(true);

    expect(
      isTrackUsageEventMessage({
        type: 'track',
        event: 'clear_stats',
        params: { timestamp: 1_717_171_717_171 }
      })
    ).toBe(true);

    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_TELEMETRY_EVENT',
        event: 'support_like_clicked',
        params: { variant: 'first' }
      })
    ).toBe(true);

    expect(
      isTrackTelemetryEventMessage({
        type: 'TRACK_TELEMETRY_EVENT',
        event: 'support_like_clicked',
        params: { variant: 'first' }
      })
    ).toBe(true);

    expect(
      isTrackTelemetryEventMessage({
        type: 'TRACK_TELEMETRY_EVENT',
        event: 'extension_error',
        params: extensionErrorParams
      })
    ).toBe(true);
  });

  it('rejects retired and unknown runtime usage events', () => {
    expect(isAllowedUsageEventName('runtime_harness_open')).toBe(true);
    expect(isAllowedUsageEventName('usage_dashboard_increment')).toBe(true);
    expect(isAllowedUsageEventName('video_started')).toBe(false);

    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'runtime_harness_open',
        params: { source: 'runtime-observability-harness' }
      })
    ).toBe(true);

    expect(
      isTrackUsageEventMessage({
        type: 'track',
        event: 'usage_dashboard_increment',
        params: {
          category: 'article',
          increment: 1,
          total_after: 2
        }
      })
    ).toBe(true);

    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'extension_error',
        params: { error_code: 'NETWORK_TIMEOUT' }
      })
    ).toBe(false);

    expect(
      isTrackTelemetryEventMessage({
        type: 'track',
        event: 'extension_error',
        params: extensionErrorParams
      })
    ).toBe(false);

    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'video_started',
        params: { source: 'menu' }
      })
    ).toBe(false);

    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'support_dislike_qr_clicked',
        params: {}
      })
    ).toBe(false);

    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'arbitrary_event',
        params: { source: 'toolbar' }
      })
    ).toBe(false);

    expect(
      isTrackTelemetryEventMessage({
        type: 'TRACK_TELEMETRY_EVENT',
        event: 'arbitrary_event',
        params: { source: 'toolbar' }
      })
    ).toBe(false);

    expect(
      isTrackTelemetryEventMessage({
        type: 'TRACK_TELEMETRY_EVENT',
        event: 'extension_error',
        params: {
          ...extensionErrorParams,
          unexpected: 'field'
        }
      })
    ).toBe(false);
  });

  it('rejects messages when unsafe params were present in the original payload', () => {
    expect(
      isTrackUsageEventMessage({
        type: 'track',
        event: 'support_link_clicked',
        params: { url: 'https://ko-fi.com/xiannian?user=reader' }
      })
    ).toBe(false);
  });

  it('rejects object and array params', () => {
    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'support_like_clicked',
        params: { variant: ['first'] }
      })
    ).toBe(false);

    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'support_like_clicked',
        params: { variant: { value: 'first' } }
      })
    ).toBe(false);
  });

  it('drops unsafe params during final sender sanitization', () => {
    expect(
      sanitizeUsageEventParams('support_link_clicked', {
        target: 'ko-fi',
        url: 'https://ko-fi.com/xiannian'
      })
    ).toEqual({ target: 'ko-fi' });

    expect(
      sanitizeUsageEventParams('i18n_text_overflow', {
        key: 'clipButton',
        language: 'en',
        component: 'button',
        priority: 'high',
        length: 24,
        limit: 10,
        used_short: false,
        page: '/options/index.html'
      })
    ).toEqual({
      key: 'clipButton',
      language: 'en',
      component: 'button',
      priority: 'high',
      length: 24,
      limit: 10,
      used_short: false
    });

    expect(
      parseUsageEventParams('i18n_text_overflow', {
        key: 'https://example.com/not-safe',
        language: 'en',
        length: 24,
        used_short: false
      })
    ).toBeNull();
  });
});
