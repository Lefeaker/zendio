/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LANGUAGE } from '../../../src/i18n/config';
import { DEFAULT_RUNTIME_MESSAGES } from '../../../src/i18n/locales';
import type { LocaleDefinition } from '../../../src/i18n/localeDefinition';
import type { PageI18nController } from '../../../src/i18n/pageController';
import type { StorageAreaService } from '../../../src/platform/interfaces/storage';

function createStorageArea(initial: Record<string, unknown> = {}): StorageAreaService {
  const store = new Map<string, unknown>(Object.entries(initial));

  return {
    get: vi.fn(async <T>(key: string) => store.get(key) as T | undefined) as StorageAreaService['get'],
    set: vi.fn(async <T>(key: string, value: T) => {
      store.set(key, value);
    }) as StorageAreaService['set'],
    getMany: vi.fn(async <T>(keys: string[]) =>
      Object.fromEntries(keys.map((key) => [key, store.get(key) as T | undefined]))
    ) as StorageAreaService['getMany'],
    setMany: vi.fn(async <T>(entries: Record<string, T>) => {
      for (const [key, value] of Object.entries(entries)) {
        store.set(key, value);
      }
    }) as StorageAreaService['setMany'],
    remove: vi.fn(async (key: string | string[]) => {
      for (const entry of Array.isArray(key) ? key : [key]) {
        store.delete(entry);
      }
    }) as StorageAreaService['remove'],
    clear: vi.fn(async () => {
      store.clear();
    }) as StorageAreaService['clear'],
    watchKey: vi.fn(() => () => undefined) as StorageAreaService['watchKey'],
    watchAll: vi.fn(() => () => undefined) as StorageAreaService['watchAll']
  };
}

function createLocaleDefinition(label: string): LocaleDefinition {
  return {
    runtime: {
      ...DEFAULT_RUNTIME_MESSAGES,
      extensionSubtitle: label
    },
    static: {
      extName: `${label} name`,
      extDescription: `${label} description`
    }
  };
}

describe('runtime storage and language services', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reads and writes through the storage adapter without browser globals', async () => {
    const { createStorageAdapter } = await import('../../../src/i18n/runtime/storageAdapter');
    const storage = createStorageArea({ language: 'fr' });
    const adapter = createStorageAdapter(storage);

    await expect(adapter.get('language')).resolves.toBe('fr');
    await adapter.set('language', 'ja');

    expect(storage.set).toHaveBeenCalledWith('language', 'ja');
  });

  it('uses navigator fallback, reports read errors, and persists resolved languages', async () => {
    const { createLanguageService } = await import('../../../src/i18n/runtime/languageService');
    const { createStorageAdapter } = await import('../../../src/i18n/runtime/storageAdapter');
    const storage = createStorageArea();
    const readError = new Error('read failed');
    const onReadError = vi.fn(async () => undefined);
    const onWriteError = vi.fn(async () => undefined);

    vi.mocked(storage.get).mockRejectedValueOnce(readError);

    const service = createLanguageService({
      storage: createStorageAdapter(storage),
      getNavigator: () => ({ language: 'ja-JP' }),
      onReadError,
      onWriteError
    });

    await expect(service.getCurrentLanguage()).resolves.toBe('ja');
    await service.setCurrentLanguage('es' as never);

    expect(onReadError).toHaveBeenCalledWith(readError);
    expect(onWriteError).not.toHaveBeenCalled();
    expect(storage.set).toHaveBeenCalledWith('language', 'es-ES');
  });
});

describe('runtime locale and page services', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('loads locale definitions once and preserves fallback behavior', async () => {
    const { createLocaleService } = await import('../../../src/i18n/runtime/localeService');
    const zhLoader = vi.fn(async () => createLocaleDefinition('zh-CN'));

    const service = createLocaleService({
      defaultLanguage: DEFAULT_LANGUAGE,
      defaultDefinition: createLocaleDefinition('en'),
      loaders: {
        en: async () => createLocaleDefinition('en'),
        'zh-CN': zhLoader
      }
    });

    const aliasMessages = await service.loadMessagesWithFallback('zh');
    const unknownMessages = await service.loadMessagesWithFallback('unknown-locale');
    await service.loadLocaleDefinition('zh-CN');
    await service.loadLocaleDefinition('zh-CN');

    expect(aliasMessages.extensionSubtitle).toBe('zh-CN');
    expect(unknownMessages).toBe(service.defaultRuntimeMessages);
    expect(zhLoader).toHaveBeenCalledTimes(1);
  });

  it('updates document metadata and wires the default page controller through injected dependencies', async () => {
    const { createPageRuntime } = await import('../../../src/i18n/runtime/pageRuntime');
    const bindingAdapter = {
      bindText: vi.fn(),
      bindAttribute: vi.fn(),
      bindHtml: vi.fn(),
      refresh: vi.fn(),
      clear: vi.fn()
    };
    const controller: PageI18nController = {
      load: vi.fn(async () => undefined),
      mount: vi.fn(),
      registerDynamic: vi.fn(),
      changeLanguage: vi.fn(async () => undefined),
      dispose: vi.fn(),
      getCurrentResource: vi.fn(() => null),
      getBinder: vi.fn(
        () =>
          ({
            bindText: vi.fn(),
            bindAttr: vi.fn(),
            bindHtml: vi.fn()
          }) as never
      )
    };
    const createPageController = vi.fn(() => controller);

    const runtime = createPageRuntime({
      loadLocaleDefinition: async () => createLocaleDefinition('zh-CN'),
      defaultRuntimeMessages: DEFAULT_RUNTIME_MESSAGES,
      getMessagesForLanguage: async () => DEFAULT_RUNTIME_MESSAGES,
      getCurrentLanguage: async () => 'en',
      setCurrentLanguage: async () => undefined,
      createBindingAdapter: () => bindingAdapter,
      createPageController
    });

    const messages = await runtime.loadLocale('zh');
    const createdController = runtime.createDefaultPageI18nController();

    expect(messages.extensionSubtitle).toBe('zh-CN');
    expect(document.documentElement.getAttribute('lang')).toBe('zh-CN');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(createPageController).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingAdapter,
        defaultLanguage: DEFAULT_LANGUAGE,
        getCurrentLanguage: expect.any(Function),
        setCurrentLanguage: expect.any(Function)
      })
    );
    expect(createdController).toBe(controller);
  });
});
