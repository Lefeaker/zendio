import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompleteOptions } from '@shared/types/options';
import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import type { OptionsPatch } from '@shared/types/optionsMutationMessages';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('optionsStore sanitization', () => {
  const onChangeMock = vi.fn<(...args: [(_: CompleteOptions) => void]) => () => void>(
    () => () => {}
  );
  const patchMock = vi
    .fn<(...args: [OptionsPatch | readonly OptionsPatch[]]) => Promise<CompleteOptions>>()
    .mockResolvedValue(clone(DEFAULT_OPTIONS as CompleteOptions));
  const replaceMock = vi
    .fn<(...args: [CompleteOptions]) => Promise<CompleteOptions>>()
    .mockImplementation((options) => Promise.resolve(options));
  const getMock = vi.fn<(...args: []) => Promise<CompleteOptions>>();

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
      patch: patchMock,
      replace: replaceMock,
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
    expect(patchMock).toHaveBeenCalledWith([
      {
        path: ['yamlConfig'],
        value: {
          contentTypes: {
            article: {
              fields: [{ name: 'title', type: 'text', enabled: true }]
            }
          }
        }
      }
    ]);
  });

  it('clears snapshot on replace(null) and notifies subscribers with undefined', async () => {
    const { repositoryContainer } = await import('../../../src/shared/di/serviceRegistry');
    const { DI_TOKENS } = await import('../../../src/shared/di/tokens');
    repositoryContainer.reset();
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => ({
      get: getMock,
      patch: patchMock,
      replace: replaceMock,
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
      patch: patchMock,
      replace: replaceMock,
      onChange: onChangeMock
    }));
    const { optionsStore } = await import('../../../src/options/state/optionsStore');
    optionsStore.reset();

    const next = clone(DEFAULT_OPTIONS as CompleteOptions);
    next.rest.baseUrl = 'https://options.example.com/';

    await optionsStore.save(next);

    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(patchMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          path: ['rest', 'baseUrl'],
          value: 'https://options.example.com/'
        }
      ])
    );
  });

  it('uses strict replacement for imported or reset snapshots', async () => {
    const { repositoryContainer } = await import('../../../src/shared/di/serviceRegistry');
    const { DI_TOKENS } = await import('../../../src/shared/di/tokens');
    repositoryContainer.reset();
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => ({
      get: getMock,
      patch: patchMock,
      replace: replaceMock,
      onChange: onChangeMock
    }));
    const { replacePersisted, optionsStore } =
      await import('../../../src/options/state/optionsStore');
    optionsStore.reset();
    const replacement = clone(DEFAULT_OPTIONS as CompleteOptions);
    replacement.interfaceTheme = 'dark';

    await replacePersisted(replacement);

    expect(replaceMock).toHaveBeenCalledWith(replacement);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('does not re-emit identical snapshots to subscribers', async () => {
    const { repositoryContainer } = await import('../../../src/shared/di/serviceRegistry');
    const { DI_TOKENS } = await import('../../../src/shared/di/tokens');
    repositoryContainer.reset();
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => ({
      get: getMock,
      patch: patchMock,
      replace: replaceMock,
      onChange: onChangeMock
    }));
    const { optionsStore } = await import('../../../src/options/state/optionsStore');
    optionsStore.reset();

    const listener = vi.fn();
    const unsubscribe = optionsStore.subscribe(listener);
    listener.mockClear();

    const snapshot = clone(DEFAULT_OPTIONS as CompleteOptions);
    optionsStore.replace(snapshot);
    optionsStore.replace(clone(snapshot));

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
