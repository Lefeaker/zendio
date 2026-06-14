import { describe, expect, it, vi } from 'vitest';
import { parseAnalyticsEventParams } from '../../../src/shared/analytics';

const analyticsDeliverySmokeModuleUrl = new URL(
  '../../../scripts/analytics-delivery-smoke.mjs',
  import.meta.url
);

type FetchResponse = {
  ok: boolean;
  status?: number;
  clone: () => { text: () => Promise<string> };
};

type FetchMock = ReturnType<
  typeof vi.fn<(input: string, init?: RequestInit) => Promise<FetchResponse>>
>;
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type LogValue = Parameters<StringConstructor>[0];
type SmokePayload = {
  client_id: string;
  measurement_id: string;
  events: Array<{ name: string; params: Record<string, JsonValue> }>;
  validation_behavior?: string;
};

type SmokeModule = {
  DEFAULT_DELIVERY_SMOKE_EVENT_NAME: string;
  buildSyntheticSmokeEvent: (eventName?: string) => {
    eventName: string;
    params: Record<string, JsonValue>;
  };
  runAnalyticsDeliverySmoke: (options?: {
    argv?: string[];
    env?: NodeJS.ProcessEnv;
    fetchImpl?: (input: string, init?: RequestInit) => Promise<FetchResponse>;
    now?: () => number;
    stdout?: (...args: LogValue[]) => void;
    stderr?: (...args: LogValue[]) => void;
  }) => Promise<{
    status: string;
    exitCode: number;
    responseStatus?: number;
    summary?: Record<string, JsonValue>;
  }>;
};

function createEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ZENDIO_GA_MEASUREMENT_ID: '',
    ZENDIO_GA_TRANSPORT_MODE: '',
    ZENDIO_GA_PROXY_ENDPOINT: '',
    AIIINOB_GA_MEASUREMENT_ID: '',
    AIIINOB_GA_TRANSPORT_MODE: '',
    AIIINOB_GA_PROXY_ENDPOINT: '',
    GA4_API_SECRET: '',
    ZENDIO_GA_API_SECRET: '',
    AIIINOB_GA_API_SECRET: '',
    ZENDIO_GA_SECRET: '',
    AIIINOB_GA_SECRET: '',
    ...overrides
  };
}

function createLogger() {
  const messages: string[] = [];
  const write = (...args: LogValue[]) => {
    messages.push(args.map((value) => String(value)).join(' '));
  };
  return {
    messages,
    stdout: write,
    stderr: write
  };
}

async function loadModule(): Promise<SmokeModule> {
  return (await import(analyticsDeliverySmokeModuleUrl.href)) as SmokeModule;
}

function parseSmokePayload(body: BodyInit | null | undefined): SmokePayload {
  const payload = JSON.parse(String(body)) as SmokePayload;
  if (
    typeof payload.client_id !== 'string' ||
    typeof payload.measurement_id !== 'string' ||
    !Array.isArray(payload.events)
  ) {
    throw new Error('Expected analytics smoke request payload.');
  }
  return payload;
}

describe('analytics-delivery-smoke script', () => {
  it('keeps the default synthetic event aligned with current analytics sanitizers', async () => {
    const module = await loadModule();

    const syntheticEvent = module.buildSyntheticSmokeEvent(
      module.DEFAULT_DELIVERY_SMOKE_EVENT_NAME
    );

    expect(
      parseAnalyticsEventParams(
        syntheticEvent.eventName as Parameters<typeof parseAnalyticsEventParams>[0],
        syntheticEvent.params
      )
    ).toEqual(syntheticEvent.params);
  });

  it('skips cleanly when public GA env is incomplete by default', async () => {
    const module = await loadModule();
    const logger = createLogger();
    const fetchMock: FetchMock = vi.fn();

    const result = await module.runAnalyticsDeliverySmoke({
      env: createEnv(),
      fetchImpl: fetchMock,
      stdout: logger.stdout,
      stderr: logger.stderr
    });

    expect(result.status).toBe('skipped');
    expect(result.exitCode).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.messages.join('\n')).toContain('Skipped analytics delivery smoke');
  });

  it('fails when --require-env is used and public GA env is incomplete', async () => {
    const module = await loadModule();
    const logger = createLogger();
    const fetchMock: FetchMock = vi.fn();

    const result = await module.runAnalyticsDeliverySmoke({
      argv: ['--require-env'],
      env: createEnv(),
      fetchImpl: fetchMock,
      stdout: logger.stdout,
      stderr: logger.stderr
    });

    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.messages.join('\n')).toContain('--require-env');
  });

  it('prints only a redacted summary in dry-run mode', async () => {
    const module = await loadModule();
    const logger = createLogger();
    const fetchMock: FetchMock = vi.fn();

    const result = await module.runAnalyticsDeliverySmoke({
      argv: ['--dry-run'],
      env: createEnv({
        AIIINOB_GA_MEASUREMENT_ID: 'G-SMOKE1234',
        AIIINOB_GA_TRANSPORT_MODE: 'proxy',
        AIIINOB_GA_PROXY_ENDPOINT: 'https://analytics.example.test/ga4'
      }),
      fetchImpl: fetchMock,
      now: () => 1234,
      stdout: logger.stdout,
      stderr: logger.stderr
    });

    const output = logger.messages.join('\n');

    expect(result.status).toBe('dry-run');
    expect(result.exitCode).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(output).toContain('options_action_completed');
    expect(output).toContain('proxy');
    expect(output).not.toContain('G-SMOKE1234');
    expect(output).not.toContain('analytics.example.test');
    expect(output).not.toContain('owner_smoke');
    expect(output).not.toContain('client_id');
  });

  it('rejects direct Google Measurement Protocol endpoints', async () => {
    const module = await loadModule();
    const logger = createLogger();
    const fetchMock: FetchMock = vi.fn();

    const result = await module.runAnalyticsDeliverySmoke({
      env: createEnv({
        AIIINOB_GA_MEASUREMENT_ID: 'G-SMOKE1234',
        AIIINOB_GA_TRANSPORT_MODE: 'proxy',
        AIIINOB_GA_PROXY_ENDPOINT: 'https://www.google-analytics.com/mp/collect'
      }),
      fetchImpl: fetchMock,
      stdout: logger.stdout,
      stderr: logger.stderr
    });

    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.messages.join('\n')).not.toContain('google-analytics.com');
  });

  it('sends a sanitized synthetic payload through the owner proxy', async () => {
    const module = await loadModule();
    const logger = createLogger();
    const fetchMock: FetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      clone: () => ({
        text: () => Promise.resolve('{"validationMessages":[{"description":"ok"}]}')
      })
    });

    const result = await module.runAnalyticsDeliverySmoke({
      env: createEnv({
        AIIINOB_GA_MEASUREMENT_ID: 'G-SMOKE1234',
        AIIINOB_GA_TRANSPORT_MODE: 'proxy',
        AIIINOB_GA_PROXY_ENDPOINT: 'https://analytics.example.test/ga4'
      }),
      fetchImpl: fetchMock,
      now: () => 1234,
      stdout: logger.stdout,
      stderr: logger.stderr
    });

    expect(result.status).toBe('sent');
    expect(result.exitCode).toBe(0);
    expect(result.responseStatus).toBe(202);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://analytics.example.test/ga4',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const payload = parseSmokePayload(requestInit?.body);

    expect(payload.validation_behavior).toBeUndefined();
    expect(payload.client_id).toMatch(/^owner-smoke-/);
    expect(payload.measurement_id).toBe('G-SMOKE1234');
    expect(payload.events).toEqual([
      {
        name: 'options_action_completed',
        params: expect.objectContaining({
          action: 'owner_smoke',
          outcome: 'completed',
          section: 'privacy',
          engagement_time_msec: 1
        })
      }
    ]);
    expect(payload.events[0]?.params).not.toHaveProperty('url');
    expect(payload.events[0]?.params).not.toHaveProperty('title');
    expect(payload.events[0]?.params).not.toHaveProperty('vault_path');
    expect(JSON.stringify(payload)).not.toMatch(/api_secret|proxyEndpoint|screenshot|noteText/i);
  });

  it('reports a redacted failure summary when the owner proxy rejects the request', async () => {
    const module = await loadModule();
    const logger = createLogger();
    const fetchMock: FetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      clone: () => ({
        text: () =>
          Promise.resolve('{"validationMessages":[{"field":"event_name","description":"bad"}]}')
      })
    });

    const result = await module.runAnalyticsDeliverySmoke({
      env: createEnv({
        AIIINOB_GA_MEASUREMENT_ID: 'G-SMOKE1234',
        AIIINOB_GA_TRANSPORT_MODE: 'directDebug',
        AIIINOB_GA_PROXY_ENDPOINT: 'https://analytics.example.test/ga4-debug'
      }),
      fetchImpl: fetchMock,
      now: () => 1234,
      stdout: logger.stdout,
      stderr: logger.stderr
    });

    const output = logger.messages.join('\n');

    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
    expect(result.responseStatus).toBe(502);
    expect(output).toContain('options_action_completed');
    expect(output).toContain('directDebug');
    expect(output).toContain('502');
    expect(output).toContain('validationMessageCount');
    expect(output).not.toContain('G-SMOKE1234');
    expect(output).not.toContain('analytics.example.test');
    expect(output).not.toContain('owner_smoke');
  });

  it('fails fast when forbidden GA secret env vars are present', async () => {
    const module = await loadModule();
    const logger = createLogger();
    const fetchMock: FetchMock = vi.fn();

    const result = await module.runAnalyticsDeliverySmoke({
      env: createEnv({
        AIIINOB_GA_MEASUREMENT_ID: 'G-SMOKE1234',
        AIIINOB_GA_TRANSPORT_MODE: 'proxy',
        AIIINOB_GA_PROXY_ENDPOINT: 'https://analytics.example.test/ga4',
        AIIINOB_GA_API_SECRET: 'super-secret-owner-value'
      }),
      fetchImpl: fetchMock,
      stdout: logger.stdout,
      stderr: logger.stderr
    });

    const output = logger.messages.join('\n');

    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(output).toContain('AIIINOB_GA_API_SECRET');
    expect(output).not.toContain('super-secret-owner-value');
  });
});
