import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENT_CATALOG,
  ANALYTICS_EVENT_MESSAGE,
  CONTRACT_ONLY_EVENT_NAMES,
  createAnalyticsEventMessage,
  isAnalyticsRuntimeEventMessage,
  sanitizeUsageEventParams
} from '../../../src/shared/types/analytics';

describe('usage telemetry contract', () => {
  it('creates typed analytics event messages with the canonical runtime type', () => {
    expect(createAnalyticsEventMessage('support_like_clicked', { variant: 'first' })).toEqual({
      type: ANALYTICS_EVENT_MESSAGE,
      event: 'support_like_clicked',
      params: { variant: 'first' }
    });
  });

  it('accepts allowlisted analytics runtime events with allowlisted params', () => {
    expect(
      isAnalyticsRuntimeEventMessage({
        type: ANALYTICS_EVENT_MESSAGE,
        event: 'support_like_clicked',
        params: { variant: 'first' }
      })
    ).toBe(true);
  });

  it('keeps legacy runtime message types accepted for the compatibility boundary', () => {
    expect(
      isAnalyticsRuntimeEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'support_dislike_clicked'
      })
    ).toBe(true);

    expect(
      isAnalyticsRuntimeEventMessage({
        type: 'track',
        event: 'usage_dashboard_increment',
        params: { category: 'ai_chat', increment: 1, total_after: 5 }
      })
    ).toBe(true);
  });

  it('rejects unknown events and raw support URLs', () => {
    expect(
      isAnalyticsRuntimeEventMessage({
        type: ANALYTICS_EVENT_MESSAGE,
        event: 'arbitrary_event',
        params: { source: 'toolbar' }
      })
    ).toBe(false);

    expect(
      isAnalyticsRuntimeEventMessage({
        type: 'track',
        event: 'support_link_clicked',
        params: { url: 'https://ko-fi.com/xiannian?user=reader' }
      })
    ).toBe(false);
  });

  it('rejects object and array params', () => {
    expect(
      isAnalyticsRuntimeEventMessage({
        type: ANALYTICS_EVENT_MESSAGE,
        event: 'support_like_clicked',
        params: { variant: ['first'] }
      })
    ).toBe(false);

    expect(
      isAnalyticsRuntimeEventMessage({
        type: ANALYTICS_EVENT_MESSAGE,
        event: 'support_like_clicked',
        params: { variant: { value: 'first' } }
      })
    ).toBe(false);
  });

  it('classifies contract-only video_started without claiming a production emitter', () => {
    expect(CONTRACT_ONLY_EVENT_NAMES).toEqual(['video_started']);
    expect(ANALYTICS_EVENT_CATALOG.video_started.classification).toBe('contract-only');
    expect(
      isAnalyticsRuntimeEventMessage({
        type: ANALYTICS_EVENT_MESSAGE,
        event: 'video_started',
        params: { source: 'menu' }
      })
    ).toBe(true);
  });

  it('accepts sanitized runtime product-event messages', () => {
    expect(
      isAnalyticsRuntimeEventMessage({
        type: ANALYTICS_EVENT_MESSAGE,
        event: 'clip_started',
        params: {
          operation_id: 'op_abcdef',
          source: 'toolbar',
          content_type: 'article'
        }
      })
    ).toBe(true);

    expect(
      isAnalyticsRuntimeEventMessage({
        type: ANALYTICS_EVENT_MESSAGE,
        event: 'reader_session_started',
        params: { source: 'unknown' }
      })
    ).toBe(true);
  });

  it('rejects unsafe runtime product-event params', () => {
    expect(
      isAnalyticsRuntimeEventMessage({
        type: ANALYTICS_EVENT_MESSAGE,
        event: 'clip_started',
        params: {
          operation_id: 'op_abcdef',
          source: 'toolbar',
          content_type: 'article',
          url: 'https://example.com/private'
        }
      })
    ).toBe(false);

    expect(
      isAnalyticsRuntimeEventMessage({
        type: ANALYTICS_EVENT_MESSAGE,
        event: 'video_session_started',
        params: {
          platform: 'youtube',
          source: 'popup-button'
        }
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
  });
});
