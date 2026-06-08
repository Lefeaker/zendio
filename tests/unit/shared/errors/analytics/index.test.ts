import { beforeEach, describe, expect, it, vi } from 'vitest';

const initializeAnalyticsConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    enabled: true,
    debugMode: false,
    measurementId: 'G-123',
    clientId: 'client-1',
    sessionId: 'session-1'
  }))
);
const shouldReportErrorsMock = vi.hoisted(() => vi.fn(() => true));
const createGoogleAnalyticsReporterMock = vi.hoisted(() => vi.fn(() => ({ id: 'ga' })));
const createSentryErrorReporterMock = vi.hoisted(() => vi.fn(() => ({ id: 'sentry' })));
const addReporterMock = vi.hoisted(() => vi.fn(() => () => undefined));
const getErrorHandlerInstanceMock = vi.hoisted(() =>
  vi.fn(() => ({
    addReporter: addReporterMock
  }))
);
const getSentryBuildConfigMock = vi.hoisted(() =>
  vi.fn(() => ({
    enabled: true,
    dsn: 'https://public@example.ingest.sentry.io/123456',
    environment: 'test',
    release: '1.2.3'
  }))
);

vi.mock('../../../../../src/shared/errors/analytics/analyticsConfig', () => ({
  getAnalyticsConfigManager: vi.fn(() => ({
    getConfig: () => ({ enabled: true, clientId: 'client-1' })
  })),
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
  handleError: vi.fn(async () => undefined)
}));

describe('error analytics initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('registers GA and sentry reporters on the provided handler', async () => {
    const addReporter = vi.fn(() => () => undefined);
    const emitTelemetryEvent = vi.fn(() => Promise.resolve(undefined));

    const module = await import('../../../../../src/shared/errors/analytics');
    await module.initializeErrorAnalytics({ addReporter }, { emitTelemetryEvent });

    expect(createGoogleAnalyticsReporterMock).toHaveBeenCalledTimes(1);
    expect(createGoogleAnalyticsReporterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        measurementId: 'G-123',
        enabled: true,
        debugMode: false,
        clientId: 'client-1',
        sessionId: 'session-1'
      }),
      emitTelemetryEvent
    );
    expect(createSentryErrorReporterMock).toHaveBeenCalledTimes(1);
    expect(addReporter).toHaveBeenCalledTimes(2);
    expect(module.getErrorAnalyticsStatus()).toMatchObject({
      enabled: true,
      hasReporter: true,
      reporters: expect.arrayContaining(['ga', 'sentry'])
    });
  });

  it('clears reporters when disabled', async () => {
    const addReporter = vi.fn(() => () => undefined);
    shouldReportErrorsMock.mockReturnValueOnce(false);

    const module = await import('../../../../../src/shared/errors/analytics');
    await module.initializeErrorAnalytics({ addReporter }, { emitTelemetryEvent: vi.fn() });

    expect(addReporter).not.toHaveBeenCalled();
    expect(module.getErrorAnalyticsStatus()).toMatchObject({
      hasReporter: false
    });
  });

  it('reuses the last injected emitter when config updates rebuild the reporter', async () => {
    const emitTelemetryEvent = vi.fn(() => Promise.resolve(undefined));

    const module = await import('../../../../../src/shared/errors/analytics');
    await module.initializeErrorAnalytics({ addReporter: addReporterMock }, { emitTelemetryEvent });
    module.disableErrorAnalytics();
    createGoogleAnalyticsReporterMock.mockClear();
    createSentryErrorReporterMock.mockClear();
    addReporterMock.mockClear();

    await module.updateErrorAnalyticsConfig(true);

    expect(createGoogleAnalyticsReporterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        measurementId: 'G-123',
        enabled: true,
        debugMode: false,
        clientId: 'client-1',
        sessionId: 'session-1'
      }),
      emitTelemetryEvent
    );
    expect(addReporterMock).toHaveBeenCalledTimes(2);
    expect(createSentryErrorReporterMock).toHaveBeenCalledTimes(1);
  });
});
