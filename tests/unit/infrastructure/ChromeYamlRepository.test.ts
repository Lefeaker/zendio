import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeYamlRepository } from '../../../src/infrastructure/repositories/ChromeYamlRepository';
import { RepositoryError } from '@shared/errors';
import type { IOptionsRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import type { OptionsPatch } from '@shared/types/optionsMutationMessages';
import { mergeOptions } from '@shared/config/optionsMerger';

type OptionsListener = (options: CompleteOptions) => void;

function isPatchBatch(
  value: OptionsPatch | readonly OptionsPatch[]
): value is readonly OptionsPatch[] {
  return Array.isArray(value);
}

describe('ChromeYamlRepository', () => {
  let repo: ChromeYamlRepository;
  const subscribers = new Set<OptionsListener>();
  let unsubscribeOptionsSpy: ReturnType<typeof vi.fn<(...args: []) => void>>;

  const mockGet = vi.fn<(...args: []) => Promise<CompleteOptions>>();
  const mockPatch =
    vi.fn<(...args: [OptionsPatch | readonly OptionsPatch[]]) => Promise<CompleteOptions>>();
  const mockReplace = vi.fn<IOptionsRepository['replace']>();
  const mockOnChange = vi.fn<(...args: [OptionsListener]) => () => void>();

  const mockOptionsRepository = {
    get: mockGet,
    patch: mockPatch,
    replace: mockReplace,
    onChange: mockOnChange
  } satisfies IOptionsRepository;

  const emitOptionsChange = (options: CompleteOptions): void => {
    subscribers.forEach((listener) => listener(options));
  };

  beforeEach(() => {
    subscribers.clear();
    vi.resetAllMocks();
    mockGet.mockReset();
    mockPatch.mockReset();
    mockReplace.mockReset();
    mockOnChange.mockReset();
    mockGet.mockResolvedValue({} as CompleteOptions);
    mockPatch.mockResolvedValue(mergeOptions());
    mockReplace.mockResolvedValue(mergeOptions());
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
    it('updates options via optionsRepository.patch', async () => {
      const overrides: YamlConfigOverrides = {
        globalFields: [{ name: 'workspace', type: 'text', enabled: true }]
      };

      await repo.setOverrides(overrides);

      expect(mockOptionsRepository.patch).toHaveBeenCalledTimes(1);
      const payload = mockOptionsRepository.patch.mock.calls[0]?.[0];
      expect(payload).toEqual({ path: ['yamlConfig'], value: overrides });
      if (!payload || isPatchBatch(payload)) throw new Error('Expected one YAML patch.');
      expect(payload.value).not.toBe(overrides);
    });

    it('wraps errors as RepositoryError', async () => {
      const overrides: YamlConfigOverrides = {
        globalFields: [{ name: 'workspace', type: 'text', enabled: true }]
      };
      mockOptionsRepository.patch.mockRejectedValueOnce(new Error('boom'));

      await expect(repo.setOverrides(overrides)).rejects.toBeInstanceOf(RepositoryError);
    });

    it('gracefully handles null overrides input', async () => {
      await repo.setOverrides(null as unknown as YamlConfigOverrides);

      expect(mockOptionsRepository.patch).toHaveBeenCalledWith({
        path: ['yamlConfig'],
        value: null
      });
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
