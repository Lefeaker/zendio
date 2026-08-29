import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ownerSmokeScript = 'scripts/run-ga-owner-smoke.mjs';
const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type FixtureRequest = {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  bodyText: string;
};

type FixtureResponseSpec = {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
};

type ProxyFixture = {
  url: string;
  requests: FixtureRequest[];
  close: () => Promise<void>;
};

const fixtureClosers: Array<() => Promise<void>> = [];

type SmokeRunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

type GaOwnerSmokeRequestBody = {
  measurement_id?: string;
  events?: Array<{
    name?: string;
    params?: { source?: string };
  }>;
  validation_behavior?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGaOwnerSmokeRequestBody(value: unknown): value is GaOwnerSmokeRequestBody {
  if (!isRecord(value)) return false;
  if (value.measurement_id !== undefined && typeof value.measurement_id !== 'string') return false;
  if (value.validation_behavior !== undefined && typeof value.validation_behavior !== 'string')
    return false;
  if (value.events === undefined) return true;
  if (!Array.isArray(value.events)) return false;
  return value.events.every((event) => {
    if (!isRecord(event)) return false;
    if (event.name !== undefined && typeof event.name !== 'string') return false;
    if (event.params === undefined) return true;
    return (
      isRecord(event.params) &&
      (event.params.source === undefined || typeof event.params.source === 'string')
    );
  });
}

function parseGaOwnerSmokeRequestBody(bodyText: string): GaOwnerSmokeRequestBody {
  const value: unknown = JSON.parse(bodyText);
  if (!isGaOwnerSmokeRequestBody(value)) {
    throw new Error('Proxy fixture received an invalid GA owner-smoke request body');
  }
  return value;
}

async function runOwnerSmoke(
  args: string[],
  env: Record<string, string | undefined> = {}
): Promise<SmokeRunResult> {
  const child = spawn(process.execPath, [ownerSmokeScript, ...args], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      AIIINOB_GA_MEASUREMENT_ID: 'G-TEST1234',
      AIIINOB_GA_TRANSPORT_MODE: 'proxy',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const status = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });

  return {
    status,
    stdout,
    stderr
  };
}

async function startProxyFixture(responseSpec: FixtureResponseSpec = {}): Promise<ProxyFixture> {
  const requests: FixtureRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const bodyChunks: string[] = [];
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      bodyChunks.push(chunk);
    });
    request.once('end', () => {
      requests.push({
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        headers: request.headers,
        bodyText: bodyChunks.join('')
      });

      response.writeHead(responseSpec.status ?? 200, {
        'content-type': 'application/json',
        ...(responseSpec.headers ?? {})
      });
      response.end(responseSpec.body ?? '{"ok":true}');
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve proxy fixture address');
  }

  const close = async () => {
    server.close();
    await once(server, 'close');
  };
  fixtureClosers.push(close);

  return {
    url: `http://127.0.0.1:${address.port}/ga-owner-smoke`,
    requests,
    close
  };
}

afterEach(async () => {
  while (fixtureClosers.length > 0) {
    const close = fixtureClosers.pop();
    if (close) {
      await close();
    }
  }
});

describe('run-ga-owner-smoke script', () => {
  it('rejects proxy-backed runs when the proxy endpoint is missing', () => {
    const result = runOwnerSmoke(['--mode', 'proxy', '--event', 'runtime_harness_open'], {
      AIIINOB_GA_PROXY_ENDPOINT: '',
      ZENDIO_GA_PROXY_ENDPOINT: ''
    });

    return result.then((resolved) => {
      expect(resolved.status).not.toBe(0);
      expect(`${resolved.stdout}${resolved.stderr}`).toContain('proxy endpoint');
    });
  });

  it('rejects Google Measurement Protocol endpoints as owner proxy endpoints', async () => {
    const endpoints = [
      'https://www.google-analytics.com/debug/mp/collect',
      'https://www.google-analytics.com./mp/collect',
      'https://google-analytics.com./debug/mp/collect',
      'https://www.google-analytics.com/%6d%70/collect',
      'https://www.google-analytics.com/mp/%63ollect',
      'https://www.google-analytics.com/debug/%6d%70/collect'
    ];

    for (const endpoint of endpoints) {
      const result = await runOwnerSmoke(['--mode', 'proxy', '--event', 'runtime_harness_open'], {
        AIIINOB_GA_PROXY_ENDPOINT: endpoint,
        AIIINOB_GA_OWNER_SMOKE_TIMEOUT_MS: '25',
        ZENDIO_GA_PROXY_ENDPOINT: ''
      });

      const output = `${result.stdout}${result.stderr}`;
      expect(result.status).not.toBe(0);
      expect(output).toContain('invalid_configuration');
      expect(output).toContain('Google Measurement Protocol endpoint');
      expect(output).toContain('proxy endpoint');
      expect(output).not.toContain('network_error');
      expect(output).not.toContain('timed out');
    }
  });

  it('rejects server-only GA secrets in the local environment', async () => {
    const fixture = await startProxyFixture();

    const result = await runOwnerSmoke(['--mode', 'proxy', '--event', 'runtime_harness_open'], {
      AIIINOB_GA_PROXY_ENDPOINT: fixture.url,
      GA4_API_SECRET: 'owner-secret'
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('GA4_API_SECRET');
    expect(fixture.requests).toHaveLength(0);
  });

  it('sends only to the configured local proxy fixture and keeps proxy response summaries redacted', async () => {
    const fixture = await startProxyFixture({
      body: JSON.stringify({
        ok: true,
        requestId: 'proxy-request-1',
        token: 'server-side-secret'
      })
    });

    const result = await runOwnerSmoke(['--mode', 'proxy', '--event', 'runtime_harness_open'], {
      AIIINOB_GA_PROXY_ENDPOINT: fixture.url
    });

    expect(result.status).toBe(0);
    expect(fixture.requests).toHaveLength(1);

    const [request] = fixture.requests;
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('/ga-owner-smoke');
    expect(fixture.url).not.toContain('google-analytics.com');

    const requestBody = parseGaOwnerSmokeRequestBody(request?.bodyText ?? '{}');
    expect(requestBody.measurement_id).toBe('G-TEST1234');
    expect(requestBody.events?.[0]?.name).toBe('runtime_harness_open');
    expect(requestBody.events?.[0]?.params?.source).toBe('runtime-observability-harness');
    expect(requestBody.validation_behavior).toBeUndefined();

    const output = `${result.stdout}${result.stderr}`;
    expect(output).not.toContain('server-side-secret');
    expect(output).not.toContain('"token":"server-side-secret"');
    expect(output).toContain('responseSummary');
    expect(output).toContain('ownerOnlyChecks');
  });

  it('adds validation intent only in directDebug mode and emits a redacted validation summary', async () => {
    const fixture = await startProxyFixture({
      body: JSON.stringify({
        validationMessages: [
          {
            fieldPath: 'events[0].params.source',
            description: 'Validation warning',
            severity: 'WARNING'
          }
        ],
        requestId: 'debug-request-1',
        echoedSecret: 'should-not-be-logged'
      })
    });

    const result = await runOwnerSmoke(
      ['--mode', 'directDebug', '--event', 'runtime_harness_open'],
      {
        AIIINOB_GA_PROXY_ENDPOINT: fixture.url
      }
    );

    expect(result.status).toBe(0);
    expect(fixture.requests).toHaveLength(1);

    const [request] = fixture.requests;
    const requestBody = parseGaOwnerSmokeRequestBody(request?.bodyText ?? '{}');
    expect(requestBody.validation_behavior).toBe('ENFORCE_RECOMMENDATIONS');

    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('validationSummary');
    expect(output).toContain('messageCount');
    expect(output).not.toContain('should-not-be-logged');
  });
});
