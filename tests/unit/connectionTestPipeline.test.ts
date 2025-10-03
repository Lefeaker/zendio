import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const getOptionsMock = vi.fn();

vi.mock('../../src/background/store', () => ({
  getOptions: getOptionsMock
}));

declare global {
  // eslint-disable-next-line no-var
  var fetch: typeof globalThis.fetch;
}

describe('connectionTest pipeline', () => {
  beforeEach(() => {
    vi.resetModules();
    getOptionsMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete globalThis.fetch;
  });

  it('returns success when first candidate passes', async () => {
    const { handleConnectionTest } = await import('../../src/background/pipelines/connectionTest');

    getOptionsMock.mockResolvedValue(createOptions({
      baseUrl: 'https://127.0.0.1:27124/',
      httpsUrl: 'https://127.0.0.1:27124/'
    }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('OK')
    }) as unknown as typeof fetch;

    const result = await handleConnectionTest();
    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('tries multiple candidates until success', async () => {
    const { handleConnectionTest } = await import('../../src/background/pipelines/connectionTest');

    getOptionsMock.mockResolvedValue(createOptions({
      baseUrl: 'https://127.0.0.1:27124/',
      httpsUrl: 'https://127.0.0.1:27124/',
      httpUrl: 'http://127.0.0.1:27123/'
    }));

    const error = Object.assign(new Error('Failed to fetch'), { message: 'Failed to fetch' });
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('OK') });

    const result = await handleConnectionTest();
    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns failure summary when all candidates fail', async () => {
    const { handleConnectionTest } = await import('../../src/background/pipelines/connectionTest');

    getOptionsMock.mockResolvedValue(createOptions({
      baseUrl: 'https://service.example.com/',
      httpsUrl: undefined,
      httpUrl: undefined
    }));

    const failure = Object.assign(new Error('Failed to fetch'), { message: 'Failed to fetch' });
    globalThis.fetch = vi.fn().mockRejectedValue(failure);

    const result = await handleConnectionTest();
    expect(result.success).toBe(false);
    expect(result.message).toContain('连接失败');
  });
});

function createOptions(restOverrides: Partial<{ baseUrl: string; httpsUrl?: string; httpUrl?: string }>) {
  return {
    rest: {
      baseUrl: restOverrides.baseUrl ?? 'https://127.0.0.1:27124/',
      httpsUrl: restOverrides.httpsUrl,
      httpUrl: restOverrides.httpUrl,
      apiKey: 'token',
      vault: 'Vault'
    }
  } as const;
}
