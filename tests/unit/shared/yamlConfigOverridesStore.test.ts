import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import type { CompleteOptions } from '@shared/types/options';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';

let resetStore: (() => void) | undefined;
afterEach(() => {
  resetStore?.();
  resetStore = undefined;
  vi.restoreAllMocks();
});

describe('YAML overrides repository lifecycle', () => {
  it('hydrates after late composition and keeps one live subscription without an early warning', async () => {
    vi.resetModules();
    const [{ repositoryContainer }, { DI_TOKENS }] = await Promise.all([
      import('@shared/di/serviceRegistry'),
      import('@shared/di/tokens')
    ]);
    repositoryContainer.reset();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = await import('@shared/state/yamlConfigOverridesStore');
    resetStore = store.resetYamlConfigOverridesStore;
    await vi.dynamicImportSettled();

    const yamlConfig: YamlConfigOverrides = {
      contentTypes: {
        article: { customFields: [{ name: 'late_field', type: 'text', enabled: true }] }
      }
    };
    const get = vi.fn(() => Promise.resolve({ ...DEFAULT_OPTIONS, yamlConfig }));
    const unsubscribe = vi.fn();
    let notify: ((options: CompleteOptions) => void) | undefined;
    const onChange = vi.fn((callback: (options: CompleteOptions) => void) => {
      notify = callback;
      return unsubscribe;
    });
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => ({ get, onChange }));
    store.getYamlConfigOverrides();
    await vi.waitFor(() => expect(store.getYamlConfigOverrides()).toMatchObject(yamlConfig));
    expect(get).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    const next: YamlConfigOverrides = {
      contentTypes: {
        article: { customFields: [{ name: 'updated_field', type: 'text', enabled: true }] }
      }
    };
    notify?.({ ...DEFAULT_OPTIONS, yamlConfig: next });
    expect(store.getYamlConfigOverrides()).toMatchObject(next);
    expect(warn).not.toHaveBeenCalled();
    store.resetYamlConfigOverridesStore();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('still reports a broken registered repository once', async () => {
    vi.resetModules();
    const [{ repositoryContainer }, { DI_TOKENS }] = await Promise.all([
      import('@shared/di/serviceRegistry'),
      import('@shared/di/tokens')
    ]);
    repositoryContainer.reset();
    const failure = new Error('broken registered repository');
    const factory = vi.fn(() => {
      throw failure;
    });
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, factory);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = await import('@shared/state/yamlConfigOverridesStore');
    resetStore = store.resetYamlConfigOverridesStore;
    await vi.dynamicImportSettled();
    store.getYamlConfigOverrides();
    store.getYamlConfigOverrides();
    await vi.dynamicImportSettled();
    expect(factory).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      '[yamlConfigOverridesStore] Options repository unavailable:',
      failure
    );
  });
});
