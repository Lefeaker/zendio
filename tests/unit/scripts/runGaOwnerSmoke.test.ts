import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';

const ownerSmokeScript = 'scripts/run-ga-owner-smoke.mjs';

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

async function runOwnerSmoke(
  args: string[],
  env: Record<string, string | undefined> = {}
): Promise<SmokeRunResult> {
  const child = spawn(process.execPath, [ownerSmokeScript, ...args], {
    cwd: '/Users/mac/Documents/Dev/AI2OB_Plg/.worktrees/AiiinOB/codex/aiiinob-ga-p08-owner-smoke-harness-2026-06-13',
    env: {
      ...process.env,
      AIIINOB_GA_MEASUREMENT_ID: 'G-TEST1234',
      AIIINOB_GA_TRANSPORT_MODE: 'proxy',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));
  const [status] = await once(child, 'close');

  return {
    status: typeof status === 'number' ? status : null,
    stdout: Buffer.concat(stdoutChunks).toString('utf8'),
    stderr: Buffer.concat(stderrChunks).toString('utf8')
  };
}

async function startProxyFixture(responseSpec: FixtureResponseSpec = {}): Promise<ProxyFixture> {
  const requests: FixtureRequest[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const bodyChunks: Buffer[] = [];
    for await (const chunk of request) {
      bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    requests.push({
      method: request.method ?? 'GET',
      url: request.url ?? '/',
      headers: request.headers,
      bodyText: Buffer.concat(bodyChunks).toString('utf8')
    });

    response.writeHead(responseSpec.status ?? 200, {
      'content-type': 'application/json',
      ...(responseSpec.headers ?? {})
    });
    response.end(responseSpec.body ?? '{"ok":true}');
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

    const requestBody = JSON.parse(request?.bodyText ?? '{}');
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
    const requestBody = JSON.parse(request?.bodyText ?? '{}');
    expect(requestBody.validation_behavior).toBe('ENFORCE_RECOMMENDATIONS');

    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('validationSummary');
    expect(output).toContain('messageCount');
    expect(output).not.toContain('should-not-be-logged');
  });
});
