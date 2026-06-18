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
    expect(isAllowedUsageEventName('extension_active_day')).toBe(true);
    expect(isAllowedUsageEventName('activation_milestone_completed')).toBe(true);
    expect(isAllowedUsageEventName('extraction_failed')).toBe(true);
    expect(isAllowedUsageEventName('reader_draft_restored')).toBe(true);
    expect(isAllowedUsageEventName('video_draft_restored')).toBe(true);
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

    expect(
      parseAnalyticsEventParams('options_action_completed', {
        action: 'DailyNotes.md',
        outcome: 'completed'
      })
    ).toBeNull();

    expect(
      parseAnalyticsEventParams('options_action_completed', {
        action: 'vault/transcript',
        outcome: 'completed'
      })
    ).toBeNull();

    expect(
      parseAnalyticsEventParams('options_action_completed', {
        action: '```selected text```',
        outcome: 'completed'
      })
    ).toBeNull();

    expect(
      parseAnalyticsEventParams('options_action_completed', {
        action: 'bearer sk-live-secret',
        outcome: 'completed'
      })
    ).toBeNull();
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

    const validActivation = sanitizeAnalyticsEventParams('extension_active_day', {
      day_index_bucket: 'day_7_to_29'
    });
    expect(hasRequiredAnalyticsEventParams('extension_active_day', validActivation)).toBe(true);

    const invalidActivation = sanitizeAnalyticsEventParams('extension_active_day', {
      day_index_bucket: 'day_90'
    });
    expect(hasRequiredAnalyticsEventParams('extension_active_day', invalidActivation)).toBe(false);
  });

  it('allows unknown source only as the explicit low-cardinality fallback', () => {
    expect(
      parseAnalyticsEventParams('reader_session_started', {
        source: 'unknown'
      })
    ).toEqual({ source: 'unknown' });

    expect(
      parseAnalyticsEventParams('video_session_started', {
        platform: 'youtube',
        source: 'unknown'
      })
    ).toEqual({ platform: 'youtube', source: 'unknown' });

    expect(
      parseAnalyticsEventParams('clip_started', {
        operation_id: 'op_source1',
        source: 'popup-button',
        content_type: 'article'
      })
    ).toBeNull();
  });

  it('rejects transcript-like strings, file-ish identifiers, and unknown params while keeping canonical events valid', () => {
    expect(
      sanitizeAnalyticsEventParams('extension_error', {
        error_code: 'REST_TIMEOUT',
        error_domain: 'background',
        error_severity: 'critical',
        error_recoverable: true,
        browser_name: 'chrome',
        browser_version: '136.0.1',
        transcript:
          'This is a long user-selected transcript line that should never survive analytics sanitization.'
      })
    ).toEqual({
      error_code: 'REST_TIMEOUT',
      error_domain: 'background',
      error_severity: 'critical',
      error_recoverable: true,
      browser_name: 'chrome',
      browser_version: '136.0.1'
    });

    expect(
      parseAnalyticsEventParams('video_exported', {
        platform: 'youtube',
        destination: 'downloads',
        duration_bucket: '3s_to_9s',
        note_file: 'meeting-notes.md'
      })
    ).toEqual({
      platform: 'youtube',
      destination: 'downloads',
      duration_bucket: '3s_to_9s'
    });

    expect(
      parseAnalyticsEventParams('options_action_completed', {
        action: 'this transcript contains many words copied from a page and should not be accepted',
        outcome: 'completed'
      })
    ).toBeNull();
  });

  it('enforces bounded activation, restore, and browser-family params', () => {
    expect(
      parseAnalyticsEventParams('extension_active_day', {
        day_index_bucket: 'day_2_to_6',
        rawUrl: 'https://example.com/private'
      })
    ).toEqual({
      day_index_bucket: 'day_2_to_6'
    });

    expect(
      parseAnalyticsEventParams('activation_milestone_completed', {
        milestone: 'first_video_exported'
      })
    ).toEqual({
      milestone: 'first_video_exported'
    });

    expect(
      parseAnalyticsEventParams('activation_milestone_completed', {
        milestone: 'shared_with_friend'
      })
    ).toBeNull();

    expect(
      parseAnalyticsEventParams('reader_draft_restored', {
        highlight_count_bucket: 'two_to_five',
        outcome: 'completed',
        detached_highlight_count_bucket: 'one',
        duration_bucket: '1s_to_2s',
        pageTitle: 'private title'
      })
    ).toEqual({
      highlight_count_bucket: 'two_to_five',
      outcome: 'completed',
      detached_highlight_count_bucket: 'one',
      duration_bucket: '1s_to_2s'
    });

    expect(
      parseAnalyticsEventParams('reader_draft_restored', {
        highlight_count_bucket: 'two_to_five',
        outcome: 'cancelled'
      })
    ).toBeNull();

    expect(
      parseAnalyticsEventParams('video_draft_restored', {
        capture_count_bucket: 'two_to_five',
        screenshot_count_bucket: 'one',
        outcome: 'failed',
        stale_screenshot_ref_count_bucket: 'zero',
        duration_bucket: '3s_to_9s'
      })
    ).toEqual({
      capture_count_bucket: 'two_to_five',
      screenshot_count_bucket: 'one',
      outcome: 'failed',
      stale_screenshot_ref_count_bucket: 'zero',
      duration_bucket: '3s_to_9s'
    });

    expect(
      parseAnalyticsEventParams('extension_installed', {
        source: 'install',
        browser_family: 'firefox-mobile'
      })
    ).toEqual({
      source: 'install'
    });

    expect(
      parseAnalyticsEventParams('extension_installed', {
        source: 'install',
        browser_family: 'firefox'
      })
    ).toEqual({
      source: 'install',
      browser_family: 'firefox'
    });
  });
});
