/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { registerGlobalErrorBoundary } from '@shared/errors/globalErrorBoundary';

describe('globalErrorBoundary', () => {
  it('reports unhandled error events through the provided handler', async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    const cleanup = registerGlobalErrorBoundary({
      domain: 'content',
      errorHandler: { handle },
      target: window,
      metadata: { extensionContext: 'content' }
    });

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'boom',
        error: new Error('boom'),
        filename: 'content.js',
        lineno: 12,
        colno: 4
      })
    );

    await Promise.resolve();

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'UNHANDLED_ERROR',
        domain: 'content',
        message: 'boom',
        recoverable: false,
        context: expect.objectContaining({
          extensionContext: 'content',
          eventType: 'error',
          filename: 'content.js',
          lineno: 12,
          colno: 4
        })
      }),
      { suppressNotifications: true }
    );

    cleanup();
  });

  it('reports unhandled promise rejections and removes listeners on cleanup', async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    const cleanup = registerGlobalErrorBoundary({
      domain: 'background',
      errorHandler: { handle },
      target: window,
      metadata: { extensionContext: 'background' }
    });

    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', {
      configurable: true,
      value: new Error('async boom')
    });
    window.dispatchEvent(event);

    await Promise.resolve();

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'UNHANDLED_REJECTION',
        domain: 'background',
        message: 'async boom',
        context: expect.objectContaining({
          extensionContext: 'background',
          eventType: 'unhandledrejection'
        })
      }),
      { suppressNotifications: true }
    );

    cleanup();
    handle.mockClear();
    window.dispatchEvent(event);
    await Promise.resolve();

    expect(handle).not.toHaveBeenCalled();
  });
});
