import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentErrors } from '@shared/errors/contentErrors';

describe('contentErrors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds storage operation failures with merged context and cause', () => {
    const now = 1779110300000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const cause = new Error('storage unavailable');

    const error = contentErrors.storageOperationFailed(
      'set',
      'clipper-position',
      { component: 'ClipperDialog', url: 'https://example.com' },
      { cause }
    );

    expect(error).toMatchObject({
      code: 'CONTENT_STORAGE_OPERATION_FAILED',
      domain: 'content',
      message: 'Storage set operation failed for key: clipper-position',
      severity: 'warning',
      recoverable: true,
      userMessageDescriptor: { key: 'errorContentStorageOperationFailed' },
      context: {
        operation: 'set',
        key: 'clipper-position',
        component: 'ClipperDialog',
        url: 'https://example.com'
      },
      cause,
      timestamp: now
    });
  });

  it('builds content component and messaging failures with structured context', () => {
    const initError = contentErrors.componentInitializationFailed('SupportPrompt', {
      action: 'render'
    });
    const messagingError = contentErrors.messagingFailed('OPEN_OPTIONS', {
      selector: '#settings'
    });

    expect(initError).toMatchObject({
      code: 'CONTENT_COMPONENT_INITIALIZATION_FAILED',
      domain: 'content',
      message: 'Failed to initialize component: SupportPrompt',
      severity: 'error',
      recoverable: false,
      userMessageDescriptor: { key: 'errorContentComponentInitializationFailed' },
      context: {
        component: 'SupportPrompt',
        action: 'render'
      }
    });
    expect(messagingError).toMatchObject({
      code: 'CONTENT_MESSAGING_FAILED',
      domain: 'content',
      message: 'Failed to send message: OPEN_OPTIONS',
      severity: 'warning',
      recoverable: true,
      userMessageDescriptor: { key: 'errorContentMessagingFailed' },
      context: {
        messageType: 'OPEN_OPTIONS',
        selector: '#settings'
      }
    });
  });

  it('builds shortcut usage tracking failures as recoverable info errors', () => {
    const cause = new Error('analytics disabled');

    const error = contentErrors.shortcutUsageTrackingFailed(
      { action: 'keyboardShortcut' },
      { cause }
    );

    expect(error).toMatchObject({
      code: 'CONTENT_SHORTCUT_USAGE_TRACKING_FAILED',
      domain: 'content',
      message: 'Failed to track shortcut usage statistics',
      severity: 'info',
      recoverable: true,
      userMessageDescriptor: { key: 'errorContentShortcutUsageTrackingFailed' },
      context: { action: 'keyboardShortcut' },
      cause
    });
  });
});
