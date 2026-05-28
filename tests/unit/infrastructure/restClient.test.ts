import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFetchRestClient } from '../../../src/infrastructure/restClient';
import type { RestClient, RestConnection } from '@shared/interfaces/restClient';

type FetchParams = [input: RequestInfo | URL, init?: RequestInit];
const ENGINE_PROPERTY_ERROR = ['Cannot read properties', 'of undefined'].join(' ');

describe('RestClient Implementation', () => {
  let restClient: RestClient;
  let mockFetch: ReturnType<typeof vi.fn<(...args: FetchParams) => Promise<Response>>>;

  beforeEach(() => {
    mockFetch = vi.fn<(...args: FetchParams) => Promise<Response>>();
    restClient = createFetchRestClient(mockFetch);
  });

  const mockConnection: RestConnection = {
    baseUrl: 'https://test.com',
    vault: 'test-vault',
    apiKey: 'test-key'
  };

  it('should successfully write file via HTTPS', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200, statusText: 'OK' }));

    await restClient.writeFile(mockConnection, 'test.md', 'content');

    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall?.[0]).toBe('https://test.com/vault/test.md');
    const requestInit = firstCall?.[1];
    expect(requestInit).toMatchObject({
      method: 'PUT',
      body: 'content'
    });
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Content-Type': 'text/markdown; charset=utf-8'
    });
  });

  it('writes binary attachments with their content type', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200, statusText: 'OK' }));
    const blob = new Blob(['image'], { type: 'image/jpeg' });

    await restClient.writeFile(mockConnection, 'assets/test/file.jpg', blob, {
      contentType: 'image/jpeg'
    });

    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall?.[0]).toBe('https://test.com/vault/assets/test/file.jpg');
    expect(firstCall?.[1]).toMatchObject({
      method: 'PUT',
      body: blob,
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'image/jpeg'
      }
    });
  });

  it('should handle HTTP fallback when HTTPS fails', async () => {
    const connectionWithFallback: RestConnection = {
      ...mockConnection,
      httpsUrl: 'https://secure.test.com',
      httpUrl: 'http://fallback.test.com'
    };

    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200, statusText: 'OK' }));

    await restClient.writeFile(connectionWithFallback, 'test.md', 'content');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://secure.test.com/vault/test.md',
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://fallback.test.com/vault/test.md',
      expect.any(Object)
    );
  });

  it('should handle HTTP error responses', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetch
      .mockResolvedValueOnce(new Response('Not Found', { status: 404, statusText: 'Not Found' }))
      .mockResolvedValueOnce(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

    await expect(restClient.writeFile(mockConnection, 'test.md', 'content')).rejects.toThrow(
      'Target vault is not reachable or misconfigured.'
    );

    const lastCall = warnSpy.mock.calls[warnSpy.mock.calls.length - 1];
    expect(lastCall?.[1]).toContain('HTTP error');
    warnSpy.mockRestore();
  });

  it('should handle network errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));

    await expect(restClient.writeFile(mockConnection, 'test.md', 'content')).rejects.toThrow(
      'Target vault is not reachable or misconfigured.'
    );

    const lastCall = warnSpy.mock.calls[warnSpy.mock.calls.length - 1];
    expect(lastCall?.[1]).toContain('network error');
    warnSpy.mockRestore();
  });

  it('should sanitize config-level failures instead of leaking engine errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce(new Error(`${ENGINE_PROPERTY_ERROR} (reading 'baz')`));

    try {
      await restClient.writeFile(mockConnection, 'test.md', 'content');
      throw new Error('Expected writeFile to fail');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message: unknown }).message)
            : String(error);
      expect(message).not.toContain(ENGINE_PROPERTY_ERROR);
    }

    const hasConfigErrorLog = warnSpy.mock.calls.some(
      ([, message]) => typeof message === 'string' && message.startsWith('config error')
    );
    expect(hasConfigErrorLog).toBe(true);
    warnSpy.mockRestore();
  });

  it('should properly encode file paths', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200, statusText: 'OK' }));

    await restClient.writeFile(mockConnection, 'folder/file with spaces.md', 'content');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.com/vault/folder/file%20with%20spaces.md',
      expect.any(Object)
    );
  });

  it.each(['../escape.md', 'folder/../escape.md'])(
    'rejects unsafe traversal path %j before making network requests',
    async (filePath) => {
      await expect(restClient.writeFile(mockConnection, filePath, 'content')).rejects.toThrow(
        'Vault-relative path must not contain traversal segments.'
      );

      expect(mockFetch).not.toHaveBeenCalled();
    }
  );

  it('preserves leading slash vault-prefix compatibility for safe paths', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200, statusText: 'OK' }));

    await restClient.writeFile({ ...mockConnection, vault: 'Vault' }, '/Vault/safe.md', 'content');

    expect(mockFetch).toHaveBeenCalledWith('https://test.com/vault/safe.md', expect.any(Object));
  });

  it('should handle empty API key', async () => {
    const connectionWithoutKey: RestConnection = {
      ...mockConnection,
      apiKey: ''
    };

    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200, statusText: 'OK' }));

    await restClient.writeFile(connectionWithoutKey, 'test.md', 'content');

    const firstCall = mockFetch.mock.calls[0];
    const requestInit = firstCall?.[1];
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer '
    });
  });
});
