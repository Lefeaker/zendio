import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const storageSyncMock = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn()
};

describe('optionsStore', () => {
  beforeEach(() => {
    vi.resetModules();

    globalThis.structuredClone = globalThis.structuredClone || ((value: unknown) => JSON.parse(JSON.stringify(value)));

    storageSyncMock.get.mockReset();
    storageSyncMock.set.mockReset();
    storageSyncMock.remove.mockReset();
    storageSyncMock.clear.mockReset();

    globalThis.chrome = {
      storage: {
        sync: storageSyncMock as unknown as typeof chrome.storage.sync
      }
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'chrome');
  });

  it('loads options from storage and caches a deep clone', async () => {
    const stored = {
      rest: { baseUrl: 'https://127.0.0.1:27124/' },
      templates: { article: 'A', fragment: 'F', clipper: 'C', reading: 'R', ai: 'AI' },
      domainMappings: {}
    };
    storageSyncMock.get.mockResolvedValue({ options: stored });

    const module = await import('../../src/options/state/optionsStore');
    const loaded = await module.loadOptionsFromStorage();

    expect(loaded).toEqual(stored);
    expect(loaded).not.toBe(stored);

    const cached = module.getLastLoadedOptions();
    expect(cached).toEqual(stored);
    expect(cached).not.toBeNull();

    if (cached) {
      cached.rest = { baseUrl: 'mutated' } as never;
    }

    const nextSnapshot = module.getLastLoadedOptions();
    expect(nextSnapshot?.rest?.baseUrl).toBe('https://127.0.0.1:27124/');
  });

  it('saves options to storage and refreshes cache', async () => {
    const module = await import('../../src/options/state/optionsStore');
    const options = { rest: { baseUrl: 'https://example.com/' } } as unknown as Parameters<typeof module.saveOptionsToStorage>[0];

    await module.saveOptionsToStorage(options);

    expect(storageSyncMock.set).toHaveBeenCalledTimes(1);
    const argument = storageSyncMock.set.mock.calls[0][0];
    expect(argument.options).toEqual(options);
    expect(argument.options).not.toBe(options);

    const snapshot = module.getLastLoadedOptions();
    expect(snapshot?.rest?.baseUrl).toBe('https://example.com/');
  });

  it('resets cache when setLastLoadedOptions receives null', async () => {
    const module = await import('../../src/options/state/optionsStore');
    await module.saveOptionsToStorage({} as never);
    expect(module.getLastLoadedOptions()).not.toBeNull();

    module.setLastLoadedOptions(null);
    expect(module.getLastLoadedOptions()).toBeNull();
  });
});
