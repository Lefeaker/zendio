/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { shouldReportContentGlobalError } from '@content/contentErrorSourcePolicy';
import type { GlobalErrorBoundaryReport } from '../../../src/shared/errors/globalErrorBoundary';

function createErrorEvent(filename: string): ErrorEvent {
  return new ErrorEvent('error', {
    message: 'boom',
    error: new Error('boom'),
    filename
  });
}

function createErrorEventWithReason(args: {
  filename: string;
  message: string;
  reason: GlobalErrorBoundaryReport['reason'];
}): ErrorEvent {
  return new ErrorEvent('error', {
    message: args.message,
    error: args.reason,
    filename: args.filename
  });
}

function createReport(
  overrides: Omit<GlobalErrorBoundaryReport, 'metadata'>
): GlobalErrorBoundaryReport {
  return {
    ...overrides,
    metadata: { eventType: overrides.eventType }
  };
}

describe('shouldReportContentGlobalError', () => {
  it('ignores page-origin script errors from content global listeners', () => {
    expect(
      shouldReportContentGlobalError({
        ...createReport({
          eventType: 'error',
          event: createErrorEvent('https://www.youtube.com/s/player/base.js'),
          reason: new Error('page boom')
        })
      })
    ).toBe(false);
  });

  it('reports extension-origin script errors', () => {
    expect(
      shouldReportContentGlobalError({
        ...createReport({
          eventType: 'error',
          event: createErrorEvent('moz-extension://extension-id/chunks/content.js'),
          reason: new Error('extension boom')
        })
      })
    ).toBe(true);
  });

  it('ignores browser ResizeObserver loop notifications even when Firefox attributes them to an extension chunk', () => {
    const message = 'ResizeObserver loop completed with undelivered notifications.';

    expect(
      shouldReportContentGlobalError({
        ...createReport({
          eventType: 'error',
          event: createErrorEventWithReason({
            filename: 'moz-extension://extension-id/chunks/content.js',
            message,
            reason: message
          }),
          reason: message
        })
      })
    ).toBe(false);
  });

  it('keeps no-filename errors reportable to avoid hiding extension failures', () => {
    expect(
      shouldReportContentGlobalError({
        ...createReport({
          eventType: 'error',
          event: createErrorEvent(''),
          reason: new Error('anonymous boom')
        })
      })
    ).toBe(true);
  });

  it('uses rejection stacks when Firefox omits an event filename', () => {
    const pageError = new Error('page rejection');
    pageError.stack = 'Error: page rejection\n    at https://developer.mozilla.org/page.js:1:1';
    const extensionError = new Error('extension rejection');
    extensionError.stack =
      'Error: extension rejection\n    at moz-extension://extension-id/chunks/content.js:1:1';

    expect(
      shouldReportContentGlobalError({
        ...createReport({
          eventType: 'unhandledrejection',
          event: new Event('unhandledrejection'),
          reason: pageError
        })
      })
    ).toBe(false);
    expect(
      shouldReportContentGlobalError({
        ...createReport({
          eventType: 'unhandledrejection',
          event: new Event('unhandledrejection'),
          reason: extensionError
        })
      })
    ).toBe(true);
  });

  it('uses structural rejection stacks when Firefox exposes page errors across realms', () => {
    const pageReason = {
      message: 'page rejection',
      stack: 'Error: page rejection\n    at https://www.youtube.com/s/player/base.js:1:1'
    };
    const extensionReason = {
      message: 'extension rejection',
      stack: 'Error: extension rejection\n    at moz-extension://extension-id/chunks/content.js:1:1'
    };

    expect(
      shouldReportContentGlobalError({
        ...createReport({
          eventType: 'unhandledrejection',
          event: new Event('unhandledrejection'),
          reason: pageReason
        })
      })
    ).toBe(false);
    expect(
      shouldReportContentGlobalError({
        ...createReport({
          eventType: 'unhandledrejection',
          event: new Event('unhandledrejection'),
          reason: extensionReason
        })
      })
    ).toBe(true);
  });
});
