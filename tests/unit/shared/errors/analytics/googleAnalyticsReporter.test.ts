/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorSeverity } from '@shared/errors/types';

const getServiceMock = vi.hoisted(() => vi.fn());
const sanitizeErrorForAnalyticsMock = vi.hoisted(() => vi.fn((error: unknown) => error));
const manifest: chrome.runtime.Manifest = {
  manifest_version: 3,
  name: 'AiiinOB Test',
  version: '3.2.1'
};

vi.mock('../../../../../src/shared/di', () => ({ getService: getServiceMock }));
vi.mock('../../../../../src/shared/errors/analytics/dataSanitizer', () => ({
  sanitizeErrorForAnalytics: sanitizeErrorForAnalyticsMock
}));

describe('GoogleAnalyticsReporter', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    getServiceMock.mockReturnValue({ runtime: { getManifest: () => manifest } });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Chrome/123.0 Safari/537.36'
    });
  });

  it('does nothing when disabled', async () => {
    const { GoogleAnalyticsReporter } = await import(
      '../../../../../src/shared/errors/analytics/googleAnalyticsReporter'
    );
    const reporter = new GoogleAnalyticsReporter({ enabled: false, measurementId: 'G-123' });
    await reporter.report({
      code: 'NETWORK_TIMEOUT',
      domain: 'background',
      severity: ErrorSeverity.CRITICAL,
      recoverable: true,
      message: 'oops',
      timestamp: Date.now()
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends sanitized error payloads and exposes config helpers', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue({ ok: true, text: () => Promise.resolve('{"ok":true}') });
    const { GoogleAnalyticsReporter } = await import(
      '../../../../../src/shared/errors/analytics/googleAnalyticsReporter'
    );
    const reporter = new GoogleAnalyticsReporter({
      enabled: true,
      measurementId: 'G-123',
      debugMode: true,
      clientId: 'client',
      sessionId: 'session'
    });

    await reporter.report({
      code: 'NETWORK_TIMEOUT',
      domain: 'background',
      severity: ErrorSeverity.CRITICAL,
      recoverable: true,
      message: 'oops',
      timestamp: Date.now(),
      context: {
        extractor: 'reader',
        url: 'https://example.com/path?token=abc',
        stack: 'Error\n at fn (https://example.com/file.js:12:8)'
      }
    });

    expect(sanitizeErrorForAnalyticsMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('debug/mp/collect?measurement_id=G-123'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(reporter.getConfig().measurementId).toBe('G-123');
    expect(reporter.isEnabled()).toBe(true);
    reporter.updateConfig({ enabled: false });
    expect(reporter.isEnabled()).toBe(false);
    reporter.renewSession();
    expect(consoleLogSpy).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });

  it('swallows reporting failures and falls back when manifest lookup fails', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getServiceMock.mockImplementation(() => {
      throw new Error('missing service');
    });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Broken',
      text: () => Promise.resolve('')
    });
    const { GoogleAnalyticsReporter } = await import(
      '../../../../../src/shared/errors/analytics/googleAnalyticsReporter'
    );
    const reporter = new GoogleAnalyticsReporter({ enabled: true, measurementId: 'G-123' });

    await reporter.report({
      code: 'UNKNOWN',
      domain: 'background',
      severity: ErrorSeverity.INFO,
      recoverable: false,
      message: 'bad',
      timestamp: Date.now()
    });
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
