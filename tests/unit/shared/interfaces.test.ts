import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { OptionsRepository } from '@shared/interfaces/optionsRepository';
import type { RestClient, RestConnection } from '@shared/interfaces/restClient';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import {
  adaptOptionsRepository,
  createCompatibilityOptionsRepository
} from '../../../src/infrastructure/optionsRepository';
import { createFetchRestClient } from '../../../src/infrastructure/restClient';
import { testPlatformHarness } from '../../setup/globalSetup';
import type { StoredOptions } from '@shared/types/options';

const resetHarnessStorage = (): void => {
  const syncStorage = testPlatformHarness.storage.sync as typeof testPlatformHarness.storage.sync & {
    resetAll?: () => void;
  };
  syncStorage.resetAll?.();
};

describe('Business Interfaces', () => {
  beforeEach(() => {
    testPlatformHarness.configure();
    resetHarnessStorage();
  });

  describe('OptionsRepository Interface', () => {
    it('should create compatibility options repository instance', () => {
      const repository = createCompatibilityOptionsRepository(testPlatformHarness.storage);
      expect(repository).toBeDefined();
      expect(typeof repository.load).toBe('function');
      expect(typeof repository.save).toBe('function');
      expect(typeof repository.snapshot).toBe('function');
      expect(typeof repository.subscribe).toBe('function');
    });

    it('should implement OptionsRepository contract', async () => {
      const repository: OptionsRepository = createCompatibilityOptionsRepository(testPlatformHarness.storage);
      
      // Test load returns empty options initially
      const loaded = await repository.load();
      expect(loaded).toEqual({});
      
      // Test snapshot returns null initially
      expect(repository.snapshot()).toBeNull();
      
      // Test save and load cycle
      const testOptions: StoredOptions = { rest: { baseUrl: 'https://test.com', vault: 'test', apiKey: 'key' } };
      await repository.save(testOptions);
      
      const reloaded = await repository.load();
      expect(reloaded).toEqual(testOptions);
      expect(reloaded).not.toBe(testOptions); // Should be deep cloned
      
      // Test snapshot after save
      const snapshot = repository.snapshot();
      expect(snapshot).toEqual(testOptions);
      expect(snapshot).not.toBe(testOptions); // Should be deep cloned
      
      // Test subscription
      const listener = vi.fn();
      const unsubscribe = repository.subscribe(listener);
      
      await repository.save({ rest: { baseUrl: 'https://updated.com', vault: 'test', apiKey: 'key' } });
      expect(listener).toHaveBeenCalled();
      
      unsubscribe();
    });

    it('should adapt IOptionsRepository to legacy OptionsRepository contract', async () => {
      const onChangeListeners = new Set<(options: StoredOptions) => void>();
      const sourceRepository: IOptionsRepository = {
        get: vi.fn().mockResolvedValue({
          rest: { baseUrl: 'https://initial.test', vault: 'vault', apiKey: 'key' }
        }),
        set: vi.fn().mockImplementation(async (partial: Partial<StoredOptions>) => {
          onChangeListeners.forEach((listener) => listener(partial as StoredOptions));
        }),
        onChange: vi.fn().mockImplementation((listener: (options: StoredOptions) => void) => {
          onChangeListeners.add(listener);
          return () => {
            onChangeListeners.delete(listener);
          };
        })
      };

      const repository: OptionsRepository = adaptOptionsRepository(sourceRepository);

      expect(await repository.load()).toEqual({
        rest: { baseUrl: 'https://initial.test', vault: 'vault', apiKey: 'key' }
      });
      expect(repository.snapshot()).toEqual({
        rest: { baseUrl: 'https://initial.test', vault: 'vault', apiKey: 'key' }
      });

      const listener = vi.fn();
      const unsubscribe = repository.subscribe(listener);
      await repository.save({
        rest: { baseUrl: 'https://updated.test', vault: 'vault', apiKey: 'key' }
      });

      expect(sourceRepository.set).toHaveBeenCalledWith({
        rest: { baseUrl: 'https://updated.test', vault: 'vault', apiKey: 'key' }
      });
      expect(listener).toHaveBeenCalledWith({
        rest: { baseUrl: 'https://updated.test', vault: 'vault', apiKey: 'key' }
      });

      unsubscribe();
      repository.reset();
      expect(repository.snapshot()).toBeNull();
    });
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
