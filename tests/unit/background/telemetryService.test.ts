import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsConfig } from '../../../src/shared/errors/analytics/analyticsConfig';
import type { RuntimeService } from '../../../src/platform/interfaces/runtime';

const initializeAnalyticsConfigMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const refreshFromStorageMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const renewSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const getConfigMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/shared/errors/analytics/analyticsConfig', () => ({
  initializeAnalyticsConfig: initializeAnalyticsConfigMock,
  getAnalyticsConfigManager: () => ({
    getConfig: getConfigMock,
    refreshFromStorage: refreshFromStorageMock,
    renewSession: renewSessionMock
  })
}));

function createRuntimeStub(version = '9.9.9'): RuntimeService {
  return {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    getManifest: vi.fn(() => ({ version })),
    openOptionsPage: vi.fn(() => Promise.resolve(undefined)),
    onInstalled: vi.fn(() => () => undefined),
    onStartup: vi.fn(() => () => undefined)
  };
}

async function configureRuntime(version?: string): Promise<void> {
  const { configurePlatformServices } = await import('../../../src/platform');
  configurePlatformServices({
    runtime: createRuntimeStub(version)
  });
}

async function resetRuntime(): Promise<void> {
  const { resetPlatformServices } = await import('../../../src/platform');
  resetPlatformServices();
}

function createConfig(overrides: Partial<AnalyticsConfig> = {}): AnalyticsConfig {
  return {
    enabled: true,
    debugMode: false,
    measurementId: 'G-1234',
    transportMode: 'relay',
    relayEndpoint: 'https://relay.example/collect',
    clientId: 'client-1',
    sessionId: 'session-1',
    userConsent: {
      analytics: true,
      errorReporting: false,
      timestamp: 1_717_171_717_171,
      version: '1.0'
    },
    reportingInterval: 30_000,
    maxErrorsPerSession: 50,
    batchSize: 10,
    ...overrides
  };
}

function createFetchResponse(options: {
  ok: boolean;
  status?: number;
  statusText?: string;
  body?: string;
}): Response {
  const body = options.body ?? '';
  return {
    ok: options.ok,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    text: vi.fn(() => Promise.resolve(body)),
    clone: vi.fn(() => ({
      text: () => Promise.resolve(body)
    }))
  } as unknown as Response;
}

describe('telemetryService', () => {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('rejects disabled or incomplete configs before transport with stable reason buckets', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { trackTelemetryEvent } =
      await import('../../../src/background/services/telemetryService');
    const scenarios = [
      {
        config: createConfig({ enabled: false }),
        reason: 'config-disabled',
        transportMode: 'relay'
      },
      {
        config: createConfig({
          userConsent: {
            analytics: false,
            errorReporting: false,
            timestamp: 1_717_171_717_171,
            version: '1.0'
          }
        }),
        reason: 'no-consent',
        transportMode: 'relay'
      },
      {
        config: createConfig({ transportMode: 'disabled' }),
        reason: 'transport-disabled',
        transportMode: 'disabled'
      },
      {
        config: createConfig({ measurementId: '' }),
        reason: 'invalid-measurement-id',
        transportMode: 'relay'
      },
      {
        config: createConfig({ measurementId: 'G-XXXXXXXXXX' }),
        reason: 'invalid-measurement-id',
        transportMode: 'relay'
      },
      {
        config: createConfig({ clientId: undefined }),
        reason: 'missing-client-id',
        transportMode: 'relay'
      },
      {
        config: createConfig({ relayEndpoint: undefined }),
        reason: 'missing-relay-endpoint',
        transportMode: 'relay'
      }
    ] as const;

    for (const scenario of scenarios) {
      getConfigMock.mockReturnValueOnce(scenario.config);
      await trackTelemetryEvent('support_dislike_clicked');
    }

    expect(refreshFromStorageMock).toHaveBeenCalledTimes(scenarios.length);
    expect(fetchMock).not.toHaveBeenCalled();

    const skippedCalls = consoleWarnSpy.mock.calls.filter(
      ([label]) => label === '[telemetry-service] skipped'
    );
    expect(skippedCalls).toHaveLength(scenarios.length);

    scenarios.forEach((scenario, index) => {
      expect(skippedCalls[index]?.[1]).toEqual(
        expect.objectContaining({
          eventName: 'support_dislike_clicked',
          reason: scenario.reason,
          transportMode: scenario.transportMode
        })
      );
    });
    expect(JSON.stringify(consoleWarnSpy.mock.calls)).not.toContain('https://');

    consoleWarnSpy.mockRestore();
  });

  it('rejects unknown usage params before transport and keeps logs sanitized', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getConfigMock.mockReturnValue(createConfig());

    const { trackTelemetryEvent } =
      await import('../../../src/background/services/telemetryService');
    await trackTelemetryEvent('support_link_clicked', {
      target: 'ko-fi',
      url: 'https://ko-fi.com/xiannian?user=reader'
    } as never);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[telemetry-service] skipped',
      expect.objectContaining({
        eventName: 'support_link_clicked',
        reason: 'invalid-params',
        transportMode: 'relay'
      })
    );
    expect(JSON.stringify(consoleWarnSpy.mock.calls)).not.toContain('https://ko-fi.com');

    consoleWarnSpy.mockRestore();
  });

  it('rejects retired-contract events before any transport call', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getConfigMock.mockReturnValue(createConfig());

    const { trackTelemetryEvent } =
      await import('../../../src/background/services/telemetryService');
    await trackTelemetryEvent('video_started', { source: 'menu' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[telemetry-service] skipped',
      expect.objectContaining({
        eventName: 'video_started',
        reason: 'disallowed-event',
        transportMode: 'relay'
      })
    );

    consoleWarnSpy.mockRestore();
  });

  it('uses errorReporting consent for extension_error events', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getConfigMock.mockReturnValue(
      createConfig({
        userConsent: {
          analytics: true,
          errorReporting: false,
          timestamp: 1_717_171_717_171,
          version: '1.0'
        }
      })
    );

    const { trackTelemetryEvent } =
      await import('../../../src/background/services/telemetryService');
    await trackTelemetryEvent('extension_error', {
      error_code: 'NETWORK_TIMEOUT',
      error_domain: 'network',
      error_category: 'transport',
      error_severity: 'high',
      error_severity_level: 3,
      error_recoverable: true,
      error_description: 'network_timeout',
      extension_version: 'test-version',
      timestamp: 1_717_171_717_171
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[telemetry-service] skipped',
      expect.objectContaining({
        eventName: 'extension_error',
        reason: 'no-consent',
        transportMode: 'relay'
      })
    );

    consoleWarnSpy.mockRestore();
  });

  it('posts relay payloads and treats validationMessages: [] as a debug success', async () => {
    await configureRuntime('2.3.4');
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    getConfigMock.mockReturnValue(
      createConfig({
        debugMode: true
      })
    );
    fetchMock.mockResolvedValue(
      createFetchResponse({
        ok: true,
        status: 202,
        statusText: 'Accepted',
        body: '{"validationMessages":[]}'
      })
    );

    const { trackTelemetryEvent } =
      await import('../../../src/background/services/telemetryService');
    await trackTelemetryEvent('support_like_clicked', { variant: 'first' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example/collect',
      expect.objectContaining({ method: 'POST' })
    );

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String(requestInit?.body)) as {
      mode: string;
      debug: boolean;
      measurementId: string;
      clientId: string;
      events: Array<{ name: string; params: Record<string, unknown> }>;
    };
    expect(payload).toMatchObject({
      mode: 'collect',
      debug: true,
      measurementId: 'G-1234',
      clientId: 'client-1'
    });
    expect(payload.events[0]).toEqual({
      name: 'support_like_clicked',
      params: {
        variant: 'first',
        extension_version: '2.3.4',
        engagement_time_msec: 1,
        session_id: 'session-1',
        debug_mode: true
      }
    });
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[telemetry-service] sent',
      expect.objectContaining({
        eventName: 'support_like_clicked',
        transportMode: 'relay',
        statusCode: 202,
        validationMessageCount: 0
      })
    );
    expect(JSON.stringify(consoleInfoSpy.mock.calls)).not.toContain('"variant":"first"');

    consoleInfoSpy.mockRestore();
    await resetRuntime();
  });

  it('logs validation failures without exposing raw validation bodies', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getConfigMock.mockReturnValue(
      createConfig({
        debugMode: true
      })
    );
    fetchMock.mockResolvedValue(
      createFetchResponse({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({
          validationMessages: [
            {
              fieldPath: 'events[0].params.variant',
              description: 'bad variant'
            }
          ]
        })
      })
    );

    const { trackTelemetryEvent } =
      await import('../../../src/background/services/telemetryService');
    await trackTelemetryEvent('support_like_clicked', { variant: 'first' });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[telemetry-service] validation-error',
      expect.objectContaining({
        eventName: 'support_like_clicked',
        transportMode: 'relay',
        statusCode: 200,
        validationMessageCount: 1,
        reason: 'validation-error'
      })
    );
    expect(JSON.stringify(consoleWarnSpy.mock.calls)).not.toContain('fieldPath');
    expect(JSON.stringify(consoleWarnSpy.mock.calls)).not.toContain('bad variant');

    consoleWarnSpy.mockRestore();
  });

  it('uses directDebug only when explicitly configured and never builds the production GA collect URL', async () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    getConfigMock.mockReturnValue(
      createConfig({
        transportMode: 'directDebug',
        debugMode: true
      })
    );
    fetchMock.mockResolvedValue(
      createFetchResponse({
        ok: true,
        status: 204,
        statusText: 'No Content',
        body: ''
      })
    );

    const { trackTelemetryEvent } =
      await import('../../../src/background/services/telemetryService');
    await trackTelemetryEvent('support_dislike_clicked');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.google-analytics.com/debug/mp/collect?measurement_id=G-1234',
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(
      'https://www.google-analytics.com/mp/collect?'
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[telemetry-service] sent',
      expect.objectContaining({
        eventName: 'support_dislike_clicked',
        transportMode: 'directDebug',
        statusCode: 204
      })
    );

    consoleInfoSpy.mockRestore();
  });
});
