import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configProvider } from '../../../src/shared/config';
import {
  handleConnectionTest,
  handleVaultConnectionTest
} from '../../../src/background/pipelines/connectionTest';

const mocks = vi.hoisted(() => ({ getOptions: vi.fn(), queryPermission: vi.fn(), track: vi.fn() }));
vi.mock('../../../src/background/store', () => ({ getOptions: mocks.getOptions }));
vi.mock('../../../src/background/services/analyticsEvents', () => ({
  trackUsageEvent: mocks.track
}));
vi.mock('../../../src/shared/di', () => ({
  getService: () => ({ fileSystemAccess: { queryPermission: mocks.queryPermission } }),
  TOKENS: { platformServices: Symbol('platformServices') }
}));
const restDefaults = configProvider.getRestDefaults();
const httpsRoot = `${restDefaults.httpsUrl.replace(/\/+$/, '')}/`;
const httpRoot = `${restDefaults.httpUrl.replace(/\/+$/, '')}/`;
const status = { status: 'OK', service: 'Obsidian Local REST API', authenticated: true };
const vault = {
  id: 'probe',
  name: 'Probe',
  vault: 'Probe',
  apiKey: 'test-only',
  httpsUrl: '',
  httpUrl: 'http://probe.test'
};
const runVault = () =>
  handleVaultConnectionTest({ type: 'TEST_VAULT_CONNECTION', vaultId: vault.id, vault });
const runDefault = () => handleConnectionTest();

beforeEach(() => {
  mocks.track.mockClear();
  mocks.getOptions.mockResolvedValue({
    rest: { ...vault, baseUrl: vault.httpUrl },
    vaultRouter: { vaults: [vault] }
  });
  mocks.queryPermission.mockResolvedValue('granted');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each([
  ['default', runDefault],
  ['per-vault', runVault]
] as const)('%s bounded service check', (_name, run) => {
  it.each([
    '<html>unrelated server</html>',
    '{}',
    JSON.stringify({ ...status, authenticated: false }),
    JSON.stringify({ ...status, service: 'Other API' })
  ])('rejects reachable but invalid service/auth response %s', async (body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(body)))
    );
    const result = await run();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Obsidian Local REST API|authentication/);
  });
  it('accepts the stable 2.x signature without requiring optional newer metadata', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(status))));
    vi.stubGlobal('fetch', fetchMock);
    expect((await run()).success).toBe(true);
    expect(fetchMock.mock.calls).toHaveLength(1);
  });
  it.each(['headers', 'body'] as const)(
    'bounds %s and aborts the actual transport',
    async (phase) => {
      vi.useFakeTimers();
      let signal: AbortSignal | null | undefined;
      const response = new Response(JSON.stringify(status));
      vi.spyOn(response, 'text').mockImplementation(() => new Promise<string>(() => {}));
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
          signal = init?.signal;
          return phase === 'headers' ? new Promise<Response>(() => {}) : Promise.resolve(response);
        })
      );
      let settled = false;
      const pending = run().then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(20_001);
      expect(settled).toBe(true);
      expect(signal?.aborted).toBe(true);
      expect((await pending).success).toBe(false);
      expect((await pending).error).toContain('REQUEST_TIMEOUT');
    }
  );
});

it('bounds the whole pipeline even when options loading never finishes', async () => {
  vi.useFakeTimers();
  mocks.getOptions.mockImplementation(() => new Promise(() => {}));
  let settled = false;
  const pending = runVault().then((result) => {
    settled = true;
    return result;
  });
  await vi.advanceTimersByTimeAsync(20_001);
  expect(settled).toBe(true);
  expect((await pending).success).toBe(false);
});

it('does not publish late permission success or start REST after the operation expired', async () => {
  vi.useFakeTimers();
  let release = (_value: string): void => {};
  mocks.queryPermission.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      })
  );
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(status))));
  vi.stubGlobal('fetch', fetchMock);
  const pending = handleVaultConnectionTest({
    type: 'TEST_VAULT_CONNECTION',
    vaultId: vault.id,
    vault: { ...vault, localFolderId: 'isolated-test-folder' }
  });
  await vi.advanceTimersByTimeAsync(20_001);
  expect((await pending).success).toBe(false);
  release('granted');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mocks.track).toHaveBeenCalledTimes(1);
  expect(mocks.track).toHaveBeenCalledWith(
    'connection_test_completed',
    expect.objectContaining({ outcome: 'failed' })
  );
});

it('shares twenty seconds across the default fallback candidates', async () => {
  vi.useFakeTimers();
  mocks.getOptions.mockResolvedValue({
    rest: {
      baseUrl: httpsRoot,
      httpsUrl: httpsRoot,
      httpUrl: httpRoot,
      apiKey: 'test-only',
      vault: 'Probe'
    }
  });
  const signals: Array<AbortSignal | null | undefined> = [];
  const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
    signals.push(init?.signal);
    return new Promise<Response>((resolve) =>
      setTimeout(() => resolve(new Response('unavailable', { status: 503 })), 9_000)
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  const pending = runDefault();
  await vi.advanceTimersByTimeAsync(20_001);
  expect((await pending).success).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(signals[2]?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(mocks.track).toHaveBeenCalledTimes(1);
});

it.each(['valid', 'stalled'])(
  'continues after an HTTPS probe timeout with a %s HTTP candidate within the outer deadline',
  async (httpBehavior) => {
    vi.useFakeTimers();
    mocks.getOptions.mockResolvedValue({
      rest: {
        baseUrl: httpsRoot,
        httpsUrl: httpsRoot,
        httpUrl: httpRoot,
        apiKey: 'test-only',
        vault: 'Probe'
      }
    });
    const calls: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), signal: init?.signal });
        return String(url).startsWith('http:') && httpBehavior === 'valid'
          ? Promise.resolve(new Response(JSON.stringify(status)))
          : new Promise<Response>(() => {});
      })
    );
    let settled = false;
    const pending = runDefault().then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(10_001);
    expect(calls.map(({ url }) => url)).toEqual([httpsRoot, httpRoot]);
    expect(calls[0]?.signal?.aborted).toBe(true);
    expect(settled).toBe(httpBehavior === 'valid');
    if (httpBehavior === 'valid') {
      expect((await pending).success).toBe(true);
      expect((await pending).channels).toContainEqual(
        expect.objectContaining({ channel: 'http', success: true })
      );
    } else {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(settled).toBe(true);
      expect((await pending).success).toBe(false);
      expect((await pending).error).toContain('REQUEST_TIMEOUT');
      expect(calls[1]?.signal?.aborted).toBe(true);
    }
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toHaveLength(2);
    expect(mocks.track).toHaveBeenCalledTimes(1);
  }
);
