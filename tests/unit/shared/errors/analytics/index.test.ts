import { beforeEach, describe, expect, it, vi } from 'vitest';

const currentAnalyticsConfig = vi.hoisted(() => ({
  enabled: true,
  debugMode: false,
  measurementId: 'G-LIVE456',
  transportMode: 'proxy' as const,
  proxyEndpoint: 'https://analytics.example.test/live',
  clientId: 'client-live',
  sessionId: 'session-live',
  userConsent: {
    analytics: true,
    errorReporting: true,
    timestamp: 200,
    version: '1.0'
  },
  reportingInterval: 30000,
  maxErrorsPerSession: 50,
  batchSize: 10
}));
const initializeAnalyticsConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    enabled: true,
    debugMode: false,
    measurementId: 'G-123',
    transportMode: 'proxy' as const,
    proxyEndpoint: 'https://analytics.example.test/ga4',
    clientId: 'client-1',
    sessionId: 'session-1',
    userConsent: {
      analytics: true,
      errorReporting: true,
      timestamp: 100,
      version: '1.0'
    },
    reportingInterval: 30000,
    batchSize: 10
  }))
);
const getAnalyticsConfigManagerMock = vi.hoisted(() =>
  vi.fn(() => ({
    getConfig: () => currentAnalyticsConfig
  }))
);
const shouldReportErrorsMock = vi.hoisted(() => vi.fn(() => true));
const createGoogleAnalyticsReporterMock = vi.hoisted(() => vi.fn(() => ({ id: 'ga' })));
const createSentryErrorReporterMock = vi.hoisted(() => vi.fn(() => ({ id: 'sentry' })));
const getSentryBuildConfigMock = vi.hoisted(() =>
  vi.fn(() => ({
    enabled: true,
    dsn: 'https://public@example.ingest.sentry.io/123456',
    environment: 'test',
    release: '1.2.3'
  }))
);
const getErrorHandlerInstanceMock = vi.hoisted(() =>
  vi.fn(() => ({
    addReporter: vi.fn(() => vi.fn())
  }))
);

vi.mock('../../../../../src/shared/errors/analytics/analyticsConfig', () => ({
  getAnalyticsConfigManager: getAnalyticsConfigManagerMock,
  initializeAnalyticsConfig: initializeAnalyticsConfigMock,
  shouldReportErrors: shouldReportErrorsMock
}));

vi.mock('../../../../../src/shared/errors/analytics/googleAnalyticsReporter', () => ({
  createGoogleAnalyticsReporter: createGoogleAnalyticsReporterMock
}));

vi.mock('../../../../../src/shared/errors/analytics/sentryReporter', () => ({
  createSentryErrorReporter: createSentryErrorReporterMock
}));

vi.mock('../../../../../src/shared/errors/analytics/sentryConfig', () => ({
  getSentryBuildConfig: getSentryBuildConfigMock
}));

vi.mock('../../../../../src/shared/errors/index', () => ({
  getErrorHandlerInstance: getErrorHandlerInstanceMock,
  handleError: vi.fn()
}));

describe('error analytics initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as { __errorReporterUnregisters?: unknown }).__errorReporterUnregisters;
  });

  it('registers GA and sentry reporters with stable session config across repeated initialization', async () => {
    const unregisterGa1 = vi.fn();
    const unregisterSentry1 = vi.fn();
    const unregisterGa2 = vi.fn();
    const unregisterSentry2 = vi.fn();
    const addReporter = vi
      .fn<() => () => void>()
      .mockReturnValueOnce(unregisterGa1)
      .mockReturnValueOnce(unregisterSentry1)
      .mockReturnValueOnce(unregisterGa2)
      .mockReturnValueOnce(unregisterSentry2);

    const module = await import('../../../../../src/shared/errors/analytics');
    await module.initializeErrorAnalytics({ addReporter });
    await module.initializeErrorAnalytics({ addReporter });

    expect(createGoogleAnalyticsReporterMock).toHaveBeenCalledTimes(2);
    expect(createGoogleAnalyticsReporterMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        measurementId: 'G-123',
        transportMode: 'proxy',
        proxyEndpoint: 'https://analytics.example.test/ga4',
        clientId: 'client-1',
        sessionId: 'session-1',
        userConsent: {
          analytics: true,
          errorReporting: true,
          timestamp: 100,
          version: '1.0'
        },
        resolveAnalyticsConfig: expect.any(Function)
      })
    );
    expect(createGoogleAnalyticsReporterMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        measurementId: 'G-123',
        transportMode: 'proxy',
        proxyEndpoint: 'https://analytics.example.test/ga4',
        clientId: 'client-1',
        sessionId: 'session-1',
        userConsent: {
          analytics: true,
          errorReporting: true,
          timestamp: 100,
          version: '1.0'
        },
        resolveAnalyticsConfig: expect.any(Function)
      })
    );
    const firstReporterConfig = createGoogleAnalyticsReporterMock.mock.calls[0]?.[0];
    expect(firstReporterConfig?.resolveAnalyticsConfig()).toBe(currentAnalyticsConfig);
    expect(createSentryErrorReporterMock).toHaveBeenCalledTimes(2);
    expect(addReporter).toHaveBeenCalledTimes(4);
    expect(unregisterGa1).toHaveBeenCalledTimes(1);
    expect(unregisterSentry1).toHaveBeenCalledTimes(1);
    expect(module.getErrorAnalyticsStatus()).toMatchObject({
      enabled: true,
      hasReporter: true,
      reporters: expect.arrayContaining(['ga', 'sentry'])
    });
  });

  it('requires errorReporting consent even when analytics consent keeps config enabled', async () => {
    const addReporter = vi.fn(() => () => undefined);
    shouldReportErrorsMock.mockReturnValueOnce(false);

    const module = await import('../../../../../src/shared/errors/analytics');
    await module.initializeErrorAnalytics({ addReporter });

    expect(addReporter).not.toHaveBeenCalled();
    expect(createGoogleAnalyticsReporterMock).not.toHaveBeenCalled();
    expect(createSentryErrorReporterMock).not.toHaveBeenCalled();
    expect(module.getErrorAnalyticsStatus()).toMatchObject({
      hasReporter: false
    });
  });

  it('reinitializes against the provided handler when consent is restored without active reporters', async () => {
    const targetAddReporter = vi.fn(() => vi.fn());
    const targetErrorHandler = { addReporter: targetAddReporter };
    getSentryBuildConfigMock.mockReturnValueOnce({
      enabled: false,
      dsn: undefined,
      environment: 'test',
      release: '1.2.3'
    });

    const module = await import('../../../../../src/shared/errors/analytics');
    await module.updateErrorAnalyticsConfig(true, targetErrorHandler);

    expect(targetAddReporter).toHaveBeenCalledTimes(1);
    expect(getErrorHandlerInstanceMock).not.toHaveBeenCalled();
  });
});
