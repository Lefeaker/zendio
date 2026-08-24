/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firefoxApi = vi.hoisted(() => ({
  runtime: {},
  storage: {
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() },
    sync: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() },
    session: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  }
}));

const defaultFirefoxServices = vi.hoisted(() => ({
  storage: {
    sync: { set: vi.fn() }
  },
  runtime: {
    sendMessage: vi.fn(),
    getUILanguage: vi.fn(() => 'en'),
    getURL: vi.fn((assetPath: string) => `moz-extension://fixture/${assetPath}`)
  }
}));

vi.mock('../../../../src/platform/firefox/utils', () => ({
  ensureFirefox: (): typeof firefoxApi => firefoxApi
}));

vi.mock('../../../../src/platform/firefox', () => ({
  createFirefoxServices: (): typeof defaultFirefoxServices => defaultFirefoxServices
}));

const originalBrowser = Object.getOwnPropertyDescriptor(globalThis, 'browser');
const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
const originalUserAgent = Object.getOwnPropertyDescriptor(globalThis.navigator, 'userAgent');

describe('Firefox platform service compatibility ledger', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    firefoxApi.storage.sync.set.mockResolvedValue(undefined);
    defaultFirefoxServices.storage.sync.set.mockResolvedValue(undefined);
  });

  afterEach(() => {
    restoreGlobal('browser', originalBrowser);
    restoreGlobal('chrome', originalChrome);
    if (originalUserAgent) {
      Object.defineProperty(globalThis.navigator, 'userAgent', originalUserAgent);
    } else {
      Reflect.deleteProperty(globalThis.navigator, 'userAgent');
    }
  });

  it('[R01-FIREFOX-SERVICES-01] writes through the Firefox storage service', async () => {
    const { firefoxStorageService } = await import('../../../../src/platform/firefox/storage');

    await firefoxStorageService.sync.set('key', 'value');

    expect(firefoxApi.storage.sync.set).toHaveBeenCalledTimes(1);
    expect(firefoxApi.storage.sync.set).toHaveBeenCalledWith({ key: 'value' });
  });

  it('[R01-FIREFOX-SERVICES-02] selects Firefox defaults even when Firefox exposes chrome.runtime', async () => {
    installUserAgent('Mozilla/5.0 Gecko/20100101 Firefox/152.0');
    installGlobal('browser', { runtime: {} });
    installGlobal('chrome', { runtime: {} });
    const { getPlatformServices, resetPlatformServices } =
      await import('../../../../src/platform/services');

    resetPlatformServices();
    const services = getPlatformServices();
    await services.storage.sync.set('key', 'value');

    expect(services).toBe(defaultFirefoxServices);
    expect(defaultFirefoxServices.storage.sync.set).toHaveBeenCalledWith('key', 'value');
  });

  it('[R01-FIREFOX-SERVICES-03] recognizes the browser namespace without a chrome namespace', async () => {
    installUserAgent('CustomAgent/1.0');
    const browserNamespace = { runtime: {} };
    installGlobal('browser', browserNamespace);
    Reflect.deleteProperty(globalThis as typeof globalThis & { chrome?: unknown }, 'chrome');
    const { getPlatformServices, resetPlatformServices } =
      await import('../../../../src/platform/services');

    resetPlatformServices();
    const services = getPlatformServices();

    expect(globalThis.browser).toBe(browserNamespace);
    expect(typeof globalThis.chrome).toBe('undefined');
    expect(services).toBe(defaultFirefoxServices);
  });
});

function installUserAgent(userAgent: string): void {
  Object.defineProperty(globalThis.navigator, 'userAgent', {
    configurable: true,
    value: userAgent
  });
}

function installGlobal(name: 'browser' | 'chrome', value: unknown): void {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value
  });
}

function restoreGlobal(name: 'browser' | 'chrome', descriptor?: PropertyDescriptor): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, name);
  }
}
