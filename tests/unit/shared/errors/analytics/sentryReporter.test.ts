/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorSeverity } from '@shared/errors/types';

const getServiceMock = vi.hoisted(() => vi.fn());
const sanitizeErrorForAnalyticsMock = vi.hoisted(() => vi.fn((error: unknown) => error));

vi.mock('../../../../../src/shared/di', () => ({
  getService: getServiceMock
}));

vi.mock('../../../../../src/shared/errors/analytics/dataSanitizer', () => ({
  sanitizeErrorForAnalytics: sanitizeErrorForAnalyticsMock
}));

describe('SentryErrorReporter', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    getServiceMock.mockReturnValue({
      runtime: {
        getManifest: () => ({ version: '9.9.9' })
      }
    });
  });

  it('does nothing when disabled', async () => {
    const { SentryErrorReporter } = await import('../../../../../src/shared/errors/analytics/sentryReporter');
    const reporter = new SentryErrorReporter({
      dsn: 'https://public@example.ingest.sentry.io/123456',
      enabled: false
    });

    await reporter.report({
      code: 'TEST',
      domain: 'background',
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      message: 'boom',
      timestamp: Date.now()
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends sanitized envelope payloads to sentry', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const { SentryErrorReporter } = await import('../../../../../src/shared/errors/analytics/sentryReporter');
    const reporter = new SentryErrorReporter({
      dsn: 'https://public@example.ingest.sentry.io/123456',
      enabled: true,
      environment: 'test',
      release: '1.2.3'
    });

    await reporter.report({
      code: 'REST_FAIL',
      domain: 'rest',
      severity: ErrorSeverity.CRITICAL,
      recoverable: true,
      message: 'write failed',
      timestamp: 1700000000000,
      context: {
        vault: 'Main'
      }
    });

    expect(sanitizeErrorForAnalyticsMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.ingest.sentry.io/api/123456/envelope/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'text/plain;charset=UTF-8'
        }),
        body: expect.stringContaining('"error_code":"REST_FAIL"')
      })
    );
  });

  it('swallows failed sentry requests', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Broken' });

    const { SentryErrorReporter } = await import('../../../../../src/shared/errors/analytics/sentryReporter');
    const reporter = new SentryErrorReporter({
      dsn: 'https://public@example.ingest.sentry.io/123456',
      enabled: true
    });

    await reporter.report({
      code: 'FAIL',
      domain: 'content',
      severity: ErrorSeverity.ERROR,
      recoverable: false,
      message: 'oops',
      timestamp: Date.now()
    });

    expect(warnSpy).toHaveBeenCalledWith('[Sentry Reporter] Failed to report error:', expect.any(Error));
    warnSpy.mockRestore();
  });
});
