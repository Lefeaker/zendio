import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENT_CATALOG,
  CONTRACT_ONLY_EVENT_NAMES,
  isTrackUsageEventMessage,
  sanitizeUsageEventParams
} from '../../../src/shared/types/analytics';

describe('usage telemetry contract', () => {
  it('accepts allowlisted events with allowlisted params', () => {
    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'support_like_clicked',
        params: { variant: 'first' }
      })
    ).toBe(true);
  });

  it('rejects unknown events and raw support URLs', () => {
    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'arbitrary_event',
        params: { source: 'toolbar' }
      })
    ).toBe(false);

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

  it('keeps legacy track messages accepted for current runtime events', () => {
    expect(
      isTrackUsageEventMessage({
        type: 'track',
        event: 'support_dislike_clicked'
      })
    ).toBe(true);

    expect(
      isTrackUsageEventMessage({
        type: 'track',
        event: 'usage_dashboard_increment',
        params: { category: 'ai_chat', increment: 1, total_after: 5 }
      })
    ).toBe(true);
  });

  it('classifies contract-only video_started without claiming a production emitter', () => {
    expect(CONTRACT_ONLY_EVENT_NAMES).toEqual(['video_started']);
    expect(ANALYTICS_EVENT_CATALOG.video_started.classification).toBe('contract-only');
    expect(
      isTrackUsageEventMessage({
        type: 'TRACK_USAGE_EVENT',
        event: 'video_started',
        params: { source: 'menu' }
      })
    ).toBe(true);
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
