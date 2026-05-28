import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getRestDefaults } from '../../utils/restDefaults';

const REST_DEFAULTS = getRestDefaults();
const DEFAULT_ROOT_URL = withTrailingSlash(
  REST_DEFAULTS.httpsUrl ?? REST_DEFAULTS.baseUrl ?? REST_DEFAULTS.httpUrl
);
const DRAFT_HTTPS_URL = `https://draft.example:${REST_DEFAULTS.httpsPort}/`;
const BODY_STREAM_REUSE_ERROR = ['Body', 'is', 'unusable'].join(' ');

const getOptionsMock = vi.fn();
const queryPermissionMock = vi.fn();

vi.mock('../../../src/background/store', () => ({
  getOptions: getOptionsMock
}));

vi.mock('../../../src/shared/di', () => ({
  getService: () => ({
    fileSystemAccess: {
      queryPermission: queryPermissionMock
    }
  }),
  TOKENS: {
    platformServices: Symbol('platformServices')
  }
}));

describe('connectionTest pipeline', () => {
  beforeEach(() => {
    vi.resetModules();
    getOptionsMock.mockReset();
    queryPermissionMock.mockReset();
    queryPermissionMock.mockResolvedValue('missing');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  it('returns success when first candidate passes', async () => {
    const { handleConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(
      createOptions({
        baseUrl: REST_DEFAULTS.baseUrl,
        httpsUrl: REST_DEFAULTS.httpsUrl
      })
    );

    const fetchMock = setFetchMock();
    fetchMock.mockResolvedValue(createResponse('OK', { status: 200 }));

    const result = await handleConnectionTest();
    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = expectFetchCall(fetchMock, 0);
    expect(url).toBe(getDefaultRootUrl());
    expect(getAuthorizationHeader(init)).toBe('Bearer token');
  });

  it('tries multiple candidates until success', async () => {
    const { handleConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(
      createOptions({
        baseUrl: REST_DEFAULTS.baseUrl,
        httpsUrl: REST_DEFAULTS.httpsUrl,
        httpUrl: REST_DEFAULTS.httpUrl
      })
    );

    const fetchMock = setFetchMock();
    const error = Object.assign(new Error('Failed to fetch'), { message: 'Failed to fetch' });
    fetchMock.mockRejectedValueOnce(error);
    fetchMock.mockResolvedValueOnce(createResponse('OK', { status: 200 }));

    const result = await handleConnectionTest();
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl] = expectFetchCall(fetchMock, 0);
    expect(firstUrl).toBe(getDefaultRootUrl());
  });

  it('applies draft overrides when testing default REST configuration', async () => {
    const { handleConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(
      createOptions({
        baseUrl: 'https://stored.example/',
        httpsUrl: 'https://stored.example/'
      })
    );

    const fetchMock = setFetchMock();
    fetchMock.mockResolvedValue(createResponse('OK', { status: 200 }));

    const result = await handleConnectionTest({
      httpsUrl: DRAFT_HTTPS_URL,
      vault: 'DraftVault',
      apiKey: 'draft-token'
    });

    expect(result.success).toBe(true);
    const [url, init] = expectFetchCall(fetchMock, 0);
    expect(url).toBe(withTrailingSlash(DRAFT_HTTPS_URL));
    expect(getAuthorizationHeader(init)).toBe('Bearer draft-token');
  });

  it('returns failure summary when all candidates fail', async () => {
    const { handleConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(
      createOptions({
        baseUrl: 'https://service.example.com/',
        httpsUrl: undefined,
        httpUrl: undefined
      })
    );

    const fetchMock = setFetchMock();
    const failure = Object.assign(new Error('Failed to fetch'), { message: 'Failed to fetch' });
    fetchMock.mockRejectedValue(failure);

    const result = await handleConnectionTest();
    expect(result.success).toBe(false);
    expect(result.message).toContain('连接失败');
    expect(result.message).toContain('network error');
    expect(result.message).not.toContain(BODY_STREAM_REUSE_ERROR);
  });

  it('returns failure when server responds with non-2xx status', async () => {
    const { handleVaultConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    const fetchMock = setFetchMock();
    fetchMock.mockResolvedValue(
      createResponse('Unauthorized', { status: 401, statusText: 'Unauthorized' })
    );

    const result = await handleVaultConnectionTest({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-auth',
      vault: {
        id: 'vault-auth',
        name: 'Auth Vault',
        httpsUrl: 'https://api.example.com',
        httpUrl: '',
        vault: 'Auth',
        apiKey: 'bad-token',
        isDefault: false
      }
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('[Auth Vault] 连接失败');
    expect(result.message).toContain('HTTP error');
    expect(result.message).toContain('HTTP 401 - Unauthorized');
    expect(result.message).not.toContain(BODY_STREAM_REUSE_ERROR);
    const [url, init] = expectFetchCall(fetchMock, 0);
    expect(url).toBe(withTrailingSlash('https://api.example.com'));
    expect(getAuthorizationHeader(init)).toBe('Bearer bad-token');
  });

  it('fails when vault name does not exist on server', async () => {
    const { handleVaultConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    const fetchMock = setFetchMock();
    fetchMock.mockResolvedValue(
      createResponse('Vault not found', { status: 404, statusText: 'Not Found' })
    );

    const result = await handleVaultConnectionTest({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-missing',
      vault: {
        id: 'vault-missing',
        name: 'Missing Vault',
        httpsUrl: 'https://api.example.com',
        httpUrl: '',
        vault: 'Missing',
        apiKey: 'token',
        isDefault: false
      }
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('[Missing Vault] 连接失败');
    expect(result.message).toContain('HTTP error');
    expect(result.message).toContain('HTTP 404 - Vault not found');
    expect(result.message).not.toContain(BODY_STREAM_REUSE_ERROR);
    const [url, init] = expectFetchCall(fetchMock, 0);
    expect(url).toBe(withTrailingSlash('https://api.example.com'));
    expect(getAuthorizationHeader(init)).toBe('Bearer token');
  });

  it('fails fast when API key is missing', async () => {
    const { handleVaultConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    const fetchMock = setFetchMock();

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
    expect(result.message).toContain('config error');
    expect(result.message).toContain('未配置 API Key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tests vault connection using provided config without saving first', async () => {
    const { handleVaultConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    const fetchMock = setFetchMock();
    fetchMock.mockResolvedValue(createResponse('OK', { status: 200 }));

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
    const [url, init] = expectFetchCall(fetchMock, 0);
    expect(url).toBe(withTrailingSlash('https://api.example.com'));
    expect(getAuthorizationHeader(init)).toBe('Bearer secret');
  });

  it('includes local folder permission in a vault connection test when configured', async () => {
    const { handleVaultConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    const fetchMock = setFetchMock();
    fetchMock.mockResolvedValue(createResponse('OK', { status: 200 }));
    queryPermissionMock.mockResolvedValue('granted');

    const result = await handleVaultConnectionTest({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-local',
      vault: {
        id: 'vault-local',
        name: 'Local Vault',
        httpsUrl: 'https://api.example.com',
        httpUrl: '',
        vault: 'LocalVault',
        apiKey: 'secret',
        localFolderId: 'folder-local',
        localFolderName: 'LocalFolder',
        isDefault: false
      }
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('[Local Vault]');
    expect(result.message).toContain('REST API');
    expect(result.message).toContain('本地目录可用：LocalFolder');
    expect(queryPermissionMock).toHaveBeenCalledWith('folder-local');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails a vault connection test when the configured local folder needs reauthorization', async () => {
    const { handleVaultConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    const fetchMock = setFetchMock();
    fetchMock.mockResolvedValue(createResponse('OK', { status: 200 }));
    queryPermissionMock.mockResolvedValue('prompt');

    const result = await handleVaultConnectionTest({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-local',
      vault: {
        id: 'vault-local',
        name: 'Local Vault',
        httpsUrl: 'https://api.example.com',
        httpUrl: '',
        vault: 'LocalVault',
        apiKey: 'secret',
        localFolderId: 'folder-local',
        localFolderName: 'LocalFolder',
        isDefault: false
      }
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('REST API');
    expect(result.message).toContain('本地目录需要重新授权：LocalFolder');
    expect(result.error).toContain('本地目录需要重新授权：LocalFolder');
  });

  it('tests vault connection using stored configuration when payload has no vault', async () => {
    const { handleVaultConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(
      createOptions(
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
      )
    );

    const fetchMock = setFetchMock();
    fetchMock.mockResolvedValue(createResponse('OK', { status: 200 }));

    const result = await handleVaultConnectionTest({
      type: 'TEST_VAULT_CONNECTION',
      vaultId: 'vault-1'
    });

    expect(result.success).toBe(true);
    const [url, init] = expectFetchCall(fetchMock, 0);
    expect(url).toBe(withTrailingSlash('https://stored.example.com'));
    expect(getAuthorizationHeader(init)).toBe('Bearer stored-token');
  });

  it('fails when additional vault is missing URLs', async () => {
    const { handleVaultConnectionTest } = await import(
      '../../../src/background/pipelines/connectionTest'
    );

    getOptionsMock.mockResolvedValue(createOptions({ baseUrl: 'https://default.example/' }));

    const fetchMock = setFetchMock();

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
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function getDefaultRootUrl(): string {
  return DEFAULT_ROOT_URL;
}

function withTrailingSlash(url: string): string {
  if (!url) {
    return '/';
  }
  return url.replace(/\/+$/, '') + '/';
}

function createOptions(
  restOverrides: Partial<{ baseUrl: string; httpsUrl?: string; httpUrl?: string }>,
  vaultOverrides?: {
    vaults: Array<{
      id: string;
      name: string;
      httpsUrl: string;
      httpUrl: string;
      vault: string;
      apiKey: string;
      isDefault?: boolean;
    }>;
  }
) {
  return {
    rest: {
      baseUrl: restOverrides.baseUrl ?? REST_DEFAULTS.baseUrl,
      httpsUrl: restOverrides.httpsUrl ?? REST_DEFAULTS.httpsUrl,
      httpUrl: restOverrides.httpUrl ?? REST_DEFAULTS.httpUrl,
      apiKey: 'token',
      vault: REST_DEFAULTS.vault
    },
    vaultRouter: vaultOverrides ?? { vaults: [] }
  } as const;
}

type FetchParams = [input: RequestInfo | URL, init?: RequestInit];

function setFetchMock() {
  const fetchMock = vi.fn<(...args: FetchParams) => Promise<Response>>();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function createResponse(body: string, init: ResponseInit & { status: number }): Response {
  return new Response(body, init);
}

type FetchMock = ReturnType<typeof setFetchMock>;

function expectFetchCall(mock: FetchMock, index: number): FetchParams {
  const call = mock.mock.calls[index];
  expect(call).toBeDefined();
  return call as FetchParams;
}

function getAuthorizationHeader(init?: RequestInit): string | undefined {
  const headers = init?.headers;
  if (!headers) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get('Authorization') ?? undefined;
  }
  if (Array.isArray(headers)) {
    const match = headers.find(([key]) => key.toLowerCase() === 'authorization');
    return match?.[1];
  }
  if (isHeaderRecord(headers)) {
    return headers.Authorization ?? headers.authorization;
  }
  return undefined;
}

function isHeaderRecord(headers: HeadersInit): headers is Record<string, string> {
  return (
    typeof headers === 'object' &&
    headers !== null &&
    !Array.isArray(headers) &&
    !(headers instanceof Headers)
  );
}
