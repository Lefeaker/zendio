import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFetchRestClient } from '../../../src/infrastructure/restClient';
import type { RestClient, RestConnection } from '@shared/interfaces/restClient';

type FetchParams = [input: RequestInfo | URL, init?: RequestInit];

describe('RestClient Implementation', () => {
  let restClient: RestClient;
  let mockFetch: ReturnType<typeof vi.fn<FetchParams, Promise<Response>>>;

  beforeEach(() => {
    mockFetch = vi.fn<FetchParams, Promise<Response>>();
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
    expect(firstCall?.[0]).toBe('https://test.com/test.md');
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

  it('should handle HTTP fallback when HTTPS fails', async () => {
    const connectionWithFallback: RestConnection = {
      ...mockConnection,
      httpsUrl: 'https://secure.test.com',
      httpUrl: 'http://fallback.test.com'
    };

    // First HTTPS call fails with network error
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    // Second HTTPS call (with vault path) also fails
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    // Third call (HTTP) succeeds
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200, statusText: 'OK' }));

    await restClient.writeFile(connectionWithFallback, 'test.md', 'content');

    // 验证确实尝试了三次调用：HTTPS, HTTPS(vault), HTTP
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenNthCalledWith(1,
      'https://secure.test.com/test.md',
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://secure.test.com/vault/test-vault/test.md',
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenNthCalledWith(3,
      'http://fallback.test.com/test.md',
      expect.any(Object)
    );
  });

  it('should handle HTTP error responses', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

    await expect(
      restClient.writeFile(mockConnection, 'test.md', 'content')
    ).rejects.toThrow();
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      restClient.writeFile(mockConnection, 'test.md', 'content')
    ).rejects.toThrow('Network error');
  });

  it('should properly encode file paths', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200, statusText: 'OK' }));

    await restClient.writeFile(mockConnection, 'folder/file with spaces.md', 'content');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.com/folder/file%20with%20spaces.md',
      expect.any(Object)
    );
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
