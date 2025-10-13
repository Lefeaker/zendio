import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const getOptionsMock = vi.fn();

vi.mock('../../src/background/store', () => ({
  getOptions: getOptionsMock
}));

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
      ok: true,
      text: () => Promise.resolve('OK')
    }) as unknown as typeof globalThis.fetch;

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
      .mockResolvedValueOnce({ status: 200, ok: true, text: () => Promise.resolve('OK') });

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

  it('returns failure when server responds with non-2xx status', async () => {
    const { handleVaultConnectionTest } = await import('../../src/background/pipelines/connectionTest');

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      text: () => Promise.resolve('Unauthorized')
    }) as unknown as typeof globalThis.fetch;

    const result = await handleVaultConnectionTest({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-auth',
      vault: {
        id: 'vault-auth',
        name: 'Auth Vault',
        httpsUrl: 'https://api.example.com',
        httpUrl: undefined,
        vault: 'Auth',
        apiKey: 'bad-token',
        isDefault: false
      }
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('HTTP 401');
  });

  it('fails fast when API key is missing', async () => {
    const { handleVaultConnectionTest } = await import('../../src/background/pipelines/connectionTest');

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    globalThis.fetch = vi.fn();

    const result = await handleVaultConnectionTest({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-unsaved',
      vault: {
        id: 'vault-unsaved',
        name: 'Unsaved Vault',
        httpsUrl: 'https://api.example.com',
        httpUrl: '',
        vault: 'Unsaved',
        apiKey: '',
        isDefault: false
      }
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('未配置 API Key');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('tests vault connection using provided config without saving first', async () => {
    const { handleVaultConnectionTest } = await import('../../src/background/pipelines/connectionTest');

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: () => Promise.resolve('OK')
    }) as unknown as typeof globalThis.fetch;

    const result = await handleVaultConnectionTest({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-unsaved',
      vault: {
        id: 'vault-unsaved',
        name: 'Unsaved Vault',
        httpsUrl: 'https://api.example.com',
        httpUrl: 'http://api.example.com',
        vault: 'Unsaved',
        apiKey: 'secret',
        isDefault: false
      }
    });

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/api\.example\.com\/?$/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' })
      })
    );
  });

  it('tests vault connection using stored configuration when payload has no vault', async () => {
    const { handleVaultConnectionTest } = await import('../../src/background/pipelines/connectionTest');

    getOptionsMock.mockResolvedValue(createOptions(
      { baseUrl: 'https://default.example/' },
      {
        vaults: [
          {
            id: 'vault-1',
            name: 'Stored Vault',
            httpsUrl: 'https://stored.example.com',
            httpUrl: 'http://stored.example.com',
            vault: 'Stored',
            apiKey: 'stored-token',
            isDefault: false
          }
        ]
      }
    ));

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: () => Promise.resolve('OK')
    }) as unknown as typeof globalThis.fetch;

    const result = await handleVaultConnectionTest({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-1'
    });

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/stored\.example\.com\/?$/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer stored-token' })
      })
    );
  });

  it('fails when additional vault is missing URLs', async () => {
    const { handleVaultConnectionTest } = await import('../../src/background/pipelines/connectionTest');

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    globalThis.fetch = vi.fn();

    const result = await handleVaultConnectionTest({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-no-url',
      vault: {
        id: 'vault-no-url',
        name: 'No URL',
        httpsUrl: '',
        httpUrl: '',
        vault: 'NoUrl',
        apiKey: 'token',
        isDefault: false
      }
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('未配置可用的地址');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

function createOptions(
  restOverrides: Partial<{ baseUrl: string; httpsUrl?: string; httpUrl?: string }>,
  vaultOverrides?: { vaults: Array<{
    id: string;
    name: string;
    httpsUrl: string;
    httpUrl: string;
    vault: string;
    apiKey: string;
    isDefault?: boolean;
  }> }
) {
  return {
    rest: {
      baseUrl: restOverrides.baseUrl ?? 'https://127.0.0.1:27124/',
      httpsUrl: restOverrides.httpsUrl,
      httpUrl: restOverrides.httpUrl,
      apiKey: 'token',
      vault: 'Vault'
    },
    vaultRouter: vaultOverrides ?? { vaults: [] }
  } as const;
}
