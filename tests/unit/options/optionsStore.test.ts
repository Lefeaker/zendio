import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompleteOptions } from '@shared/types/options';
import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('optionsStore sanitization', () => {
  const onChangeMock = vi.fn<[(_: CompleteOptions) => void], () => void>(() => () => {});
  const setMock = vi.fn<[Partial<CompleteOptions>], Promise<void>>().mockResolvedValue(undefined);
  const getMock = vi.fn<[], Promise<CompleteOptions>>();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getMock.mockResolvedValue(clone(DEFAULT_OPTIONS as CompleteOptions));
  });

  it('drops malformed vaultRouter and normalizes yamlConfig during load', async () => {
    const { repositoryContainer } = await import('../../../src/shared/di/serviceRegistry');
    const { DI_TOKENS } = await import('../../../src/shared/di/tokens');
    repositoryContainer.reset();
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => ({
      get: getMock,
      set: setMock,
      onChange: onChangeMock
    }));
    const { optionsStore } = await import('../../../src/options/state/optionsStore');
    optionsStore.reset();

    const loaded = clone(DEFAULT_OPTIONS as CompleteOptions);
    (loaded as Record<string, unknown>).vaultRouter = { vaults: [{ id: 'broken' }] };
    (loaded as Record<string, unknown>).yamlConfig = {
      contentTypes: {
        article: {
          fields: [
            { name: 'title', type: 'text', enabled: 'true' },
            { name: '', type: 'text', enabled: true }
          ]
        }
      }
    };
    getMock.mockResolvedValue(loaded);

    const result = await optionsStore.load();

    expect(result.vaultRouter).toBeUndefined();
    expect(result.yamlConfig?.contentTypes?.article?.fields).toEqual([
      { name: 'title', type: 'text', enabled: true }
    ]);
    expect(setMock).toHaveBeenCalledWith({
      vaultRouter: undefined,
      yamlConfig: {
        contentTypes: {
          article: {
            fields: [{ name: 'title', type: 'text', enabled: true }]
          }
        }
      }
    });
  });

  it('clears snapshot on replace(null) and notifies subscribers with undefined', async () => {
    const { repositoryContainer } = await import('../../../src/shared/di/serviceRegistry');
    const { DI_TOKENS } = await import('../../../src/shared/di/tokens');
    repositoryContainer.reset();
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => ({
      get: getMock,
      set: setMock,
      onChange: onChangeMock
    }));
    const { optionsStore } = await import('../../../src/options/state/optionsStore');
    optionsStore.reset();
    const listener = vi.fn();
    const unsubscribe = optionsStore.subscribe(listener);

    optionsStore.replace({ ...clone(DEFAULT_OPTIONS as CompleteOptions) });
    optionsStore.replace(null);

    expect(optionsStore.snapshot()).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(undefined);
    unsubscribe();
  });

  it('saves through IOptionsRepository only', async () => {
    const { repositoryContainer } = await import('../../../src/shared/di/serviceRegistry');
    const { DI_TOKENS } = await import('../../../src/shared/di/tokens');
    repositoryContainer.reset();
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => ({
      get: getMock,
      set: setMock,
      onChange: onChangeMock
    }));
    const { optionsStore } = await import('../../../src/options/state/optionsStore');
    optionsStore.reset();

    const next = clone(DEFAULT_OPTIONS as CompleteOptions);
    next.rest.baseUrl = 'https://options.example.com/';

    await optionsStore.save(next);

    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      rest: expect.objectContaining({ baseUrl: 'https://options.example.com/' })
    }));
  });

});
