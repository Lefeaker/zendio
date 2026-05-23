import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeYamlRepository } from '../../../src/infrastructure/repositories/ChromeYamlRepository';
import { RepositoryError } from '@shared/errors';
import type { IOptionsRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';

type OptionsListener = (options: CompleteOptions) => void;

describe('ChromeYamlRepository', () => {
  let repo: ChromeYamlRepository;
  const subscribers = new Set<OptionsListener>();
  let unsubscribeOptionsSpy: ReturnType<typeof vi.fn<(...args: []) => void>>;

  const mockGet = vi.fn<(...args: []) => Promise<CompleteOptions>>();
  const mockSet = vi.fn<(...args: [Partial<CompleteOptions>]) => Promise<void>>();
  const mockOnChange = vi.fn<(...args: [OptionsListener]) => () => void>();

  const mockOptionsRepository = {
    get: mockGet,
    set: mockSet,
    onChange: mockOnChange
  } satisfies Pick<IOptionsRepository, 'get' | 'set' | 'onChange'>;

  const emitOptionsChange = (options: CompleteOptions): void => {
    subscribers.forEach((listener) => listener(options));
  };

  beforeEach(() => {
    subscribers.clear();
    vi.resetAllMocks();
    mockGet.mockReset();
    mockSet.mockReset();
    mockOnChange.mockReset();
    mockGet.mockResolvedValue({} as CompleteOptions);
    mockSet.mockResolvedValue();
    unsubscribeOptionsSpy = vi.fn<(...args: []) => void>();
    mockOnChange.mockImplementation((listener) => {
      subscribers.add(listener);
      return unsubscribeOptionsSpy;
    });
    repo = new ChromeYamlRepository(mockOptionsRepository);
  });

  describe('getOverrides', () => {
    it('returns overrides from options repository', async () => {
      const overrides: YamlConfigOverrides = {
        globalFields: [{ name: 'tags', type: 'array', enabled: true }]
      };
      mockOptionsRepository.get.mockResolvedValueOnce({ yamlConfig: overrides } as CompleteOptions);

      const result = await repo.getOverrides();

      expect(result).toEqual(overrides);
      expect(result).not.toBe(overrides);
      expect(mockOptionsRepository.get).toHaveBeenCalledTimes(1);
    });

    it('returns null when no overrides stored', async () => {
      mockOptionsRepository.get.mockResolvedValueOnce({} as CompleteOptions);

      const result = await repo.getOverrides();

      expect(result).toBeNull();
    });

    it('falls back to JSON cloning when structuredClone is unavailable', async () => {
      const globalRef = globalThis as typeof globalThis & { structuredClone?: <T>(value: T) => T };
      const originalStructuredClone = globalRef.structuredClone;
      Reflect.deleteProperty(globalRef, 'structuredClone');

      const overrides: YamlConfigOverrides = {
        contentTypes: {
          article: {
            customFields: [{ name: 'notes', type: 'text', enabled: true }]
          }
        }
      };
      mockOptionsRepository.get.mockResolvedValueOnce({ yamlConfig: overrides } as CompleteOptions);

      const result = await repo.getOverrides();

      expect(result).toEqual(overrides);
      expect(result).not.toBe(overrides);

      globalRef.structuredClone = originalStructuredClone;
    });
  });

  describe('setOverrides', () => {
    it('updates options via optionsRepository.set', async () => {
      const overrides: YamlConfigOverrides = {
        globalFields: [{ name: 'workspace', type: 'text', enabled: true }]
      };

      await repo.setOverrides(overrides);

      expect(mockOptionsRepository.set).toHaveBeenCalledTimes(1);
      const payload = mockOptionsRepository.set.mock.calls[0]?.[0];
      expect(payload?.yamlConfig).toEqual(overrides);
      expect(payload?.yamlConfig).not.toBe(overrides);
    });

    it('wraps errors as RepositoryError', async () => {
      const overrides: YamlConfigOverrides = {
        globalFields: [{ name: 'workspace', type: 'text', enabled: true }]
      };
      mockOptionsRepository.set.mockRejectedValueOnce(new Error('boom'));

      await expect(repo.setOverrides(overrides)).rejects.toBeInstanceOf(RepositoryError);
    });

    it('gracefully handles null overrides input', async () => {
      await repo.setOverrides(null as unknown as YamlConfigOverrides);

      expect(mockOptionsRepository.set).toHaveBeenCalledWith(
        expect.objectContaining({ yamlConfig: null })
      );
    });
  });

  describe('onChange', () => {
    it('emits initial overrides and listens for changes', async () => {
      const overrides: YamlConfigOverrides = {
        globalFields: [{ name: 'workspace', type: 'text', enabled: true, defaultValue: 'dev' }]
      };
      mockOptionsRepository.get.mockResolvedValueOnce({ yamlConfig: overrides } as CompleteOptions);

      const callback = vi.fn<(...args: [overrides: YamlConfigOverrides | null]) => void>();
      const unsubscribe = repo.onChange(callback);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      });
      expect(callback.mock.calls[0]?.[0]).toEqual(overrides);

      const updated: CompleteOptions = {
        yamlConfig: {
          globalFields: [{ name: 'workspace', type: 'text', enabled: true, defaultValue: 'prod' }]
        }
      } as CompleteOptions;
      emitOptionsChange(updated);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(2);
      });

      // No extra event when overrides unchanged
      emitOptionsChange(updated);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(callback).toHaveBeenCalledTimes(2);

      unsubscribe();
      emitOptionsChange({ yamlConfig: null } as CompleteOptions);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('subscription lifecycle', () => {
    it('registers optionsRepository.onChange only once', () => {
      repo.onChange(vi.fn());
      repo.onChange(vi.fn());

      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from options repository when last listener is removed', () => {
      const unsubscribe1 = repo.onChange(vi.fn());
      const unsubscribe2 = repo.onChange(vi.fn());

      unsubscribe1();
      expect(unsubscribeOptionsSpy).not.toHaveBeenCalled();

      unsubscribe2();
      expect(unsubscribeOptionsSpy).toHaveBeenCalledTimes(1);
    });

    it('does not emit duplicate events when overrides unchanged', async () => {
      const overrides: YamlConfigOverrides = {
        globalFields: [{ name: 'tags', type: 'array', enabled: true }]
      };
      mockOptionsRepository.get.mockResolvedValueOnce({ yamlConfig: overrides } as CompleteOptions);

      const callback = vi.fn();
      repo.onChange(callback);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      });
      callback.mockClear();

      emitOptionsChange({ yamlConfig: overrides } as CompleteOptions);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(callback).not.toHaveBeenCalled();

      const updated: CompleteOptions = {
        yamlConfig: {
          globalFields: [{ name: 'tags', type: 'array', enabled: true, defaultValue: ['dev'] }]
        }
      } as CompleteOptions;
      emitOptionsChange(updated);
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
      });
    });

    it('logs errors thrown by listeners but continues notifying others', async () => {
      const overrides: YamlConfigOverrides = {
        globalFields: [{ name: 'level', type: 'text', enabled: true }]
      };
      mockOptionsRepository.get.mockResolvedValueOnce({ yamlConfig: overrides } as CompleteOptions);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const faulty = vi.fn(() => {
        throw new Error('listener boom');
      });
      const healthy = vi.fn();

      repo.onChange(faulty);
      repo.onChange(healthy);
      await vi.waitFor(() => {
        expect(healthy).toHaveBeenCalledTimes(1);
      });
      healthy.mockClear();

      emitOptionsChange({
        yamlConfig: {
          globalFields: [{ name: 'level', type: 'text', enabled: true, defaultValue: 'prod' }]
        }
      } as CompleteOptions);

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[ChromeYamlRepository] onChange callback error:',
          expect.any(Error)
        );
        expect(healthy).toHaveBeenCalledTimes(1);
      });

      consoleSpy.mockRestore();
    });

    it('logs error when initial optionsRepository.get fails', async () => {
      const error = new Error('init failed');
      mockOptionsRepository.get.mockRejectedValueOnce(error);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      repo.onChange(vi.fn());

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[ChromeYamlRepository] Failed to emit initial overrides:',
          error
        );
      });

      consoleSpy.mockRestore();
    });
  });
});
