import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RestClient, RestConnection } from '@shared/interfaces/restClient';
import { createFetchRestClient } from '../../../src/infrastructure/restClient';
import { testPlatformHarness } from '../../setup/globalSetup';

const resetHarnessStorage = (): void => {
  const syncStorage = testPlatformHarness.storage
    .sync as typeof testPlatformHarness.storage.sync & {
    resetAll?: () => void;
  };
  syncStorage.resetAll?.();
};

describe('Business Interfaces', () => {
  beforeEach(() => {
    testPlatformHarness.configure();
    resetHarnessStorage();
  });

  describe('RestClient Interface', () => {
    it('should create FetchRestClient instance', () => {
      const mockFetch = vi.fn();
      const client = createFetchRestClient(mockFetch);
      expect(client).toBeDefined();
      expect(typeof client.writeFile).toBe('function');
    });

    it('should implement RestClient contract', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('success')
      });

      const client: RestClient = createFetchRestClient(mockFetch);

      const config: RestConnection = {
        baseUrl: 'https://test.com',
        vault: 'test-vault',
        apiKey: 'test-key'
      };

      await expect(client.writeFile(config, 'test.md', 'content')).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
