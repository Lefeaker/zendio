import { describe, expect, it } from 'vitest';
import {
  hasRequiredAnalyticsEventParams,
  isAllowedAnalyticsEventName,
  isAllowedUsageEventName,
  parseAnalyticsEventParams,
  sanitizeAnalyticsEventParams,
  sanitizeUsageEventParams
} from '../../../src/shared/analytics';

describe('analytics sanitizers', () => {
  it('keeps current runtime usage event compatibility', () => {
    expect(isAllowedUsageEventName('support_like_clicked')).toBe(true);
    expect(isAllowedUsageEventName('runtime_harness_open')).toBe(true);
    expect(isAllowedUsageEventName('video_started')).toBe(true);
    expect(isAllowedUsageEventName('clip_started')).toBe(true);
    expect(isAllowedAnalyticsEventName('clip_started')).toBe(true);
  });

  it('sanitizes current emitted event params', () => {
    expect(
      sanitizeUsageEventParams('support_link_clicked', {
        target: 'ko-fi',
        url: 'https://ko-fi.com/xiannian'
      })
    ).toEqual({ target: 'ko-fi' });

    expect(
      sanitizeUsageEventParams('i18n_text_overflow', {
        key: 'clipButton',
        language: 'en-US',
        component: 'button',
        priority: 'high',
        length: 24,
        limit: 10,
        used_short: false,
        page: '/options/index.html'
      })
    ).toEqual({
      key: 'clipButton',
      language: 'en-US',
      component: 'button',
      priority: 'high',
      length: 24,
      limit: 10,
      used_short: false
    });
  });

  it('rejects forbidden strings and high-risk secret shapes', () => {
    expect(
      sanitizeAnalyticsEventParams('options_action_completed', {
        action: 'open_settings',
        outcome: 'completed',
        section: 'privacy',
        rawUrl: 'https://example.com/private?token=abc'
      })
    ).toEqual({ action: 'open_settings', outcome: 'completed', section: 'privacy' });

    expect(
      parseAnalyticsEventParams('options_action_completed', {
        action: 'Bearer sk-secret',
        outcome: 'completed'
      })
    ).toBeNull();

    expect(
      parseAnalyticsEventParams('clip_started', {
        operation_id: 'op_abc123',
        source: 'toolbar',
        content_type: 'article',
        title: '# Markdown title'
      })
    ).toEqual({
      operation_id: 'op_abc123',
      source: 'toolbar',
      content_type: 'article'
    });
  });

  it('validates required params after sanitization', () => {
    const valid = sanitizeAnalyticsEventParams('clip_save_failed', {
      operation_id: 'op_abc123',
      storage_target: 'rest_api',
      failure_category: 'connection'
    });
    expect(hasRequiredAnalyticsEventParams('clip_save_failed', valid)).toBe(true);

    const invalid = sanitizeAnalyticsEventParams('clip_save_failed', {
      operation_id: '/Users/mac/private.md',
      storage_target: 'rest_api',
      failure_category: 'connection'
    });
    expect(hasRequiredAnalyticsEventParams('clip_save_failed', invalid)).toBe(false);
  });
});
