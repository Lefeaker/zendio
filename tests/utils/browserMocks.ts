import { vi } from 'vitest';
import type { Mock } from 'vitest';

type ViMock = Mock<any[], any>;

interface ChromeActionMocks {
  setBadgeText: ViMock;
  setBadgeBackgroundColor: ViMock;
  onClickedAddListener: ViMock;
  onClickedRemoveListener: ViMock;
}

interface ChromeStorageAreaMocks {
  get: ViMock;
  set: ViMock;
  remove: ViMock;
  clear: ViMock;
}

interface ChromeStorageMocks {
  sync: ChromeStorageAreaMocks;
  local: ChromeStorageAreaMocks;
  managed: ChromeStorageAreaMocks;
  session: ChromeStorageAreaMocks;
  onChangedAddListener: ViMock;
  onChangedRemoveListener: ViMock;
}

interface ChromeRuntimeMocks {
  sendMessage: ViMock;
  connect: ViMock;
  getManifest: ViMock;
  onMessageAddListener: ViMock;
  onMessageRemoveListener: ViMock;
  onMessageHasListener: ViMock;
  onMessageHasListeners: ViMock;
  onMessageAddRules: ViMock;
  onMessageRemoveRules: ViMock;
  onMessageGetRules: ViMock;
}

export interface ChromeMockHandle {
  chrome: typeof chrome;
  actionMocks: ChromeActionMocks;
  storageMocks: ChromeStorageMocks;
  runtimeMocks: ChromeRuntimeMocks;
  reset(): void;
  restore(): void;
}

interface FirefoxActionMocks {
  primarySetBadgeText: ViMock;
  fallbackSetBadgeText: ViMock;
  onClickedAddListener: ViMock;
  onClickedRemoveListener: ViMock;
}

interface FirefoxStorageAreaMocks {
  get: ViMock;
  set: ViMock;
  remove: ViMock;
  clear: ViMock;
}

interface FirefoxStorageMocks {
  sync: FirefoxStorageAreaMocks;
  local: FirefoxStorageAreaMocks;
  managed: FirefoxStorageAreaMocks;
  session: FirefoxStorageAreaMocks;
  onChangedAddListener: ViMock;
  onChangedRemoveListener: ViMock;
}

interface FirefoxRuntimeMocks {
  sendMessage: ViMock;
  getURL: ViMock;
  onMessageAddListener: ViMock;
  onMessageRemoveListener: ViMock;
}

export interface FirefoxMockHandle {
  browser: typeof browser;
  actionMocks: FirefoxActionMocks;
  storageMocks: FirefoxStorageMocks;
  runtimeMocks: FirefoxRuntimeMocks;
  reset(): void;
  restore(): void;
}

function createChromeActionStub(): { stub: typeof chrome.action; mocks: ChromeActionMocks; reset(): void } {
  const setBadgeText = vi.fn((_details: chrome.action.BadgeTextDetails, callback?: () => void) => {
    callback?.();
    return Promise.resolve(undefined);
  });
  const setBadgeBackgroundColor = vi.fn((_details: chrome.action.BadgeColorDetails, callback?: () => void) => {
    callback?.();
    return Promise.resolve(undefined);
  });
  const addListener = vi.fn((listener: (tab: chrome.tabs.Tab) => void) => listener);
  const removeListener = vi.fn((listener: (tab: chrome.tabs.Tab) => void) => listener);
  const hasListener = vi.fn((_listener: (tab: chrome.tabs.Tab) => void) => false);
  const hasListeners = vi.fn(() => false);
  const disable = vi.fn(() => Promise.resolve(undefined));
  const enable = vi.fn(() => Promise.resolve(undefined));
  const getBadgeText = vi.fn(() => Promise.resolve(''));
  const getBadgeBackgroundColor = vi.fn(() => Promise.resolve({ color: [0, 0, 0, 0] }));
  const getPopup = vi.fn(() => Promise.resolve(''));
  const getTitle = vi.fn(() => Promise.resolve(''));
  const openPopup = vi.fn(() => Promise.resolve(undefined));
  const setPopup = vi.fn(() => Promise.resolve(undefined));
  const setTitle = vi.fn(() => Promise.resolve(undefined));
  const setIcon = vi.fn(() => Promise.resolve(undefined));

  const stub = {
    onClicked: {
      addListener: (listener: (tab: chrome.tabs.Tab) => void) => {
        addListener(listener);
      },
      removeListener: (listener: (tab: chrome.tabs.Tab) => void) => {
        removeListener(listener);
      },
      hasListener: (listener: (tab: chrome.tabs.Tab) => void) => hasListener(listener),
      hasListeners: () => hasListeners()
    },
    setBadgeText(details: chrome.action.BadgeTextDetails, callback?: () => void) {
      return setBadgeText(details, callback);
    },
    setBadgeBackgroundColor(details: chrome.action.BadgeColorDetails, callback?: () => void) {
      return setBadgeBackgroundColor(details, callback);
    },
    disable,
    enable,
    getBadgeText,
    getBadgeBackgroundColor,
    getPopup,
    getTitle,
    openPopup,
    setPopup,
    setTitle,
    setIcon
  } as unknown as typeof chrome.action;

  const reset = () => {
    setBadgeText.mockReset();
    setBadgeBackgroundColor.mockReset();
    addListener.mockReset();
    removeListener.mockReset();
    hasListener.mockReset();
    hasListeners.mockReset();
    disable.mockReset();
    enable.mockReset();
    getBadgeText.mockReset();
    getBadgeBackgroundColor.mockReset();
    getPopup.mockReset();
    getTitle.mockReset();
    openPopup.mockReset();
    setPopup.mockReset();
    setTitle.mockReset();
    setIcon.mockReset();
  };

  return {
    stub,
    mocks: {
      setBadgeText,
      setBadgeBackgroundColor,
      onClickedAddListener: addListener,
      onClickedRemoveListener: removeListener
    },
    reset
  };
}

function createChromeStorageArea(): {
  area: chrome.storage.StorageArea;
  mocks: ChromeStorageAreaMocks;
  reset(): void;
} {
  const get = vi.fn((_keys?: string | string[] | Record<string, unknown> | null) => Promise.resolve({}));
  const set = vi.fn((_items: Record<string, unknown>) => Promise.resolve(undefined));
  const remove = vi.fn((_keys: string | string[]) => Promise.resolve(undefined));
  const clear = vi.fn(() => Promise.resolve(undefined));

  const area = {
    get(keys?: string | string[] | Record<string, unknown> | null, callback?: (items: Record<string, unknown>) => void) {
      const promise = get(keys);
      if (typeof callback === 'function') {
        void promise.then((items) => callback(items));
        return;
      }
      return promise;
    },
    set(items: Record<string, unknown>, callback?: () => void) {
      const promise = set(items);
      if (typeof callback === 'function') {
        void promise.then(() => callback());
        return;
      }
      return promise;
    },
    remove(keys: string | string[], callback?: () => void) {
      const promise = remove(keys);
      if (typeof callback === 'function') {
        void promise.then(() => callback());
        return;
      }
      return promise;
    },
    clear(callback?: () => void) {
      const promise = clear();
      if (typeof callback === 'function') {
        void promise.then(() => callback());
        return;
      }
      return promise;
    }
  } as unknown as chrome.storage.StorageArea;

  const reset = () => {
    get.mockReset();
    set.mockReset();
    remove.mockReset();
    clear.mockReset();
  };

  return {
    area,
    mocks: { get, set, remove, clear },
    reset
  };
}

function createChromeStorageStub(): { stub: typeof chrome.storage; mocks: ChromeStorageMocks; reset(): void } {
  const sync = createChromeStorageArea();
  const local = createChromeStorageArea();
  const managed = createChromeStorageArea();
  const session = createChromeStorageArea();
  const addListener = vi.fn<Parameters<typeof chrome.storage.onChanged.addListener>, void>();
  const removeListener = vi.fn<Parameters<typeof chrome.storage.onChanged.removeListener>, void>();

  const stub = {
    sync: sync.area,
    local: local.area,
    managed: managed.area,
    session: session.area,
    onChanged: {
      addListener: (listener: Parameters<typeof addListener>[0]) => {
        addListener(listener);
      },
      removeListener: (listener: Parameters<typeof removeListener>[0]) => {
        removeListener(listener);
      }
    }
  } as unknown as typeof chrome.storage;

  const reset = () => {
    sync.reset();
    local.reset();
    managed.reset();
    session.reset();
    addListener.mockReset();
    removeListener.mockReset();
  };

  return {
    stub,
    mocks: {
      sync: sync.mocks,
      local: local.mocks,
      managed: managed.mocks,
      session: session.mocks,
      onChangedAddListener: addListener,
      onChangedRemoveListener: removeListener
    },
    reset
  };
}

function createChromeRuntimeStub(): { stub: typeof chrome.runtime; mocks: ChromeRuntimeMocks; reset(): void } {
  const sendMessageMock = vi.fn((..._args: unknown[]) => Promise.resolve(undefined));
  const sendMessage: typeof chrome.runtime.sendMessage = ((...args: unknown[]) => {
    const maybeCallback = args.at(-1);
    if (typeof maybeCallback === 'function') {
      const callback = maybeCallback as (response?: unknown) => void;
      const callArgs = args.slice(0, -1);
      void sendMessageMock(...callArgs).then((response) => callback(response));
      return;
    }
    return sendMessageMock(...args);
  }) as typeof chrome.runtime.sendMessage;
  const connect = vi.fn();
  const getManifest = vi.fn(
    () =>
      ({
        manifest_version: 3,
        name: 'test-extension',
        version: '0.0.0'
      }) as chrome.runtime.Manifest
  );
  const addListener = vi.fn<Parameters<typeof chrome.runtime.onMessage.addListener>, void>();
  const removeListener = vi.fn<Parameters<typeof chrome.runtime.onMessage.removeListener>, void>();
  const hasListener = vi.fn((_listener?: unknown) => false);
  const hasListeners = vi.fn(() => false);
  const addRules = vi.fn((_rules?: unknown[]) => undefined);
  const removeRules = vi.fn((_ruleIdentifiers?: string[]) => undefined);
  const getRules = vi.fn((_ruleIdentifiers?: string[]) => undefined);

  let lastError: chrome.runtime.LastError | undefined;

  const runtimeTarget: Partial<typeof chrome.runtime> = {
    sendMessage,
    connect,
    getManifest,
    onMessage: {
      addListener: (listener: Parameters<typeof addListener>[0]) => {
        addListener(listener);
      },
      removeListener: (listener: Parameters<typeof removeListener>[0]) => {
        removeListener(listener);
      },
      hasListener: (listener: Parameters<typeof hasListener>[0]) => hasListener(listener),
      hasListeners: () => hasListeners(),
      addRules: (rules: unknown[], callback?: () => void) => {
        addRules(rules);
        callback?.();
      },
      removeRules: (ruleIdentifiers?: string[], callback?: () => void) => {
        removeRules(ruleIdentifiers);
        callback?.();
      },
      getRules: (ruleIdentifiers?: string[], callback?: (rules: unknown[]) => void) => {
        getRules(ruleIdentifiers);
        callback?.([]);
      }
    } as unknown as typeof chrome.runtime.onMessage
  };

  Object.defineProperty(runtimeTarget, 'lastError', {
    configurable: true,
    get() {
      return lastError;
    }
  });

  const stub = runtimeTarget as typeof chrome.runtime;

  const reset = () => {
    lastError = undefined;
    sendMessageMock.mockReset();
    connect.mockReset();
    getManifest.mockReset();
    addListener.mockReset();
    removeListener.mockReset();
    hasListener.mockReset();
    hasListeners.mockReset();
    addRules.mockReset();
    removeRules.mockReset();
    getRules.mockReset();
  };

  return {
    stub,
    mocks: {
      sendMessage: sendMessageMock,
      connect,
      getManifest,
      onMessageAddListener: addListener,
      onMessageRemoveListener: removeListener,
      onMessageHasListener: hasListener,
      onMessageHasListeners: hasListeners,
      onMessageAddRules: addRules,
      onMessageRemoveRules: removeRules,
      onMessageGetRules: getRules
    },
    reset
  };
}

function createChromeTabsStub(): { stub: typeof chrome.tabs; reset(): void } {
  const sendMessage = vi.fn(() => Promise.resolve(undefined));
  const query = vi.fn(() => Promise.resolve([]));
  const get = vi.fn(() => Promise.resolve(undefined));

  const stub = {
    sendMessage,
    query,
    get
  } as unknown as typeof chrome.tabs;

  const reset = () => {
    sendMessage.mockReset();
    query.mockReset();
    get.mockReset();
  };

  return { stub, reset };
}

export function createChromeRuntimeMock(): ChromeMockHandle {
  const previousChrome = globalThis.chrome;
  const previousBrowser = (globalThis as { browser?: typeof browser }).browser;

  const action = createChromeActionStub();
  const storage = createChromeStorageStub();
  const runtime = createChromeRuntimeStub();
  const tabs = createChromeTabsStub();

  const chromeStub = {
    action: action.stub,
    storage: storage.stub,
    runtime: runtime.stub,
    tabs: tabs.stub
  } as typeof chrome;

  globalThis.chrome = chromeStub;
  delete (globalThis as Record<string, unknown>).browser;

  const reset = () => {
    action.reset();
    storage.reset();
    runtime.reset();
    tabs.reset();
  };

  return {
    chrome: chromeStub,
    actionMocks: action.mocks,
    storageMocks: storage.mocks,
    runtimeMocks: runtime.mocks,
    reset,
    restore() {
      reset();
      if (typeof previousChrome === 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (globalThis as Record<string, unknown>).chrome;
      } else {
        globalThis.chrome = previousChrome;
      }
      if (previousBrowser) {
        (globalThis as { browser?: typeof browser }).browser = previousBrowser;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (globalThis as Record<string, unknown>).browser;
      }
    }
  };
}

function createFirefoxActionStub(): {
  browserAction: typeof browser.browserAction;
  action: typeof browser.action;
  mocks: FirefoxActionMocks;
  reset(): void;
} {
  const primarySetBadgeText = vi.fn((_details: Parameters<typeof browser.browserAction.setBadgeText>[0]) =>
    Promise.resolve(undefined)
  );
  const fallbackSetBadgeText = vi.fn((_details: Parameters<typeof browser.action.setBadgeText>[0]) =>
    Promise.resolve(undefined)
  );
  const addListener = vi.fn((listener: (tab: browser.tabs.Tab) => void) => listener);
  const removeListener = vi.fn((listener: (tab: browser.tabs.Tab) => void) => listener);
  const hasListener = vi.fn((_listener: (tab: browser.tabs.Tab) => void) => false);
  const hasListeners = vi.fn(() => false);
  const setBadgeBackgroundColor = vi.fn(() => Promise.resolve(undefined));

  const browserAction = {
    async setBadgeText(details: Parameters<typeof browser.browserAction.setBadgeText>[0]) {
      await primarySetBadgeText(details);
    },
    setBadgeBackgroundColor,
    onClicked: {
      addListener: (listener: Parameters<typeof addListener>[0]) => {
        addListener(listener);
      },
      removeListener: (listener: Parameters<typeof removeListener>[0]) => {
        removeListener(listener);
      },
      hasListener: (listener: Parameters<typeof hasListener>[0]) => hasListener(listener),
      hasListeners: () => hasListeners()
    }
  } as unknown as typeof browser.browserAction;

  const action = {
    async setBadgeText(details: Parameters<typeof browser.action.setBadgeText>[0]) {
      await fallbackSetBadgeText(details);
    },
    setBadgeBackgroundColor,
    onClicked: browserAction.onClicked
  } as unknown as typeof browser.action;

  const reset = () => {
    primarySetBadgeText.mockReset();
    fallbackSetBadgeText.mockReset();
    addListener.mockReset();
    removeListener.mockReset();
    hasListener.mockReset();
    hasListeners.mockReset();
    setBadgeBackgroundColor.mockReset();
  };

  return {
    browserAction,
    action,
    mocks: {
      primarySetBadgeText,
      fallbackSetBadgeText,
      onClickedAddListener: addListener,
      onClickedRemoveListener: removeListener
    },
    reset
  };
}

function createFirefoxStorageArea(): {
  area: browser.storage.StorageArea;
  mocks: FirefoxStorageAreaMocks;
  reset(): void;
} {
  const get = vi.fn(() => Promise.resolve({}));
  const set = vi.fn(() => Promise.resolve(undefined));
  const remove = vi.fn(() => Promise.resolve(undefined));
  const clear = vi.fn(() => Promise.resolve(undefined));

  const area = {
    get,
    set,
    remove,
    clear
  } as unknown as browser.storage.StorageArea;

  const reset = () => {
    get.mockReset();
    set.mockReset();
    remove.mockReset();
    clear.mockReset();
  };

  return {
    area,
    mocks: { get, set, remove, clear },
    reset
  };
}

function createFirefoxStorageStub(): { stub: typeof browser.storage; mocks: FirefoxStorageMocks; reset(): void } {
  const sync = createFirefoxStorageArea();
  const local = createFirefoxStorageArea();
  const managed = createFirefoxStorageArea();
  const session = createFirefoxStorageArea();
  const addListener = vi.fn<Parameters<typeof browser.storage.onChanged.addListener>, void>();
  const removeListener = vi.fn<Parameters<typeof browser.storage.onChanged.removeListener>, void>();

  const stub = {
    sync: sync.area,
    local: local.area,
    managed: managed.area,
    session: session.area,
    onChanged: {
      addListener: (listener: Parameters<typeof addListener>[0]) => {
        addListener(listener);
      },
      removeListener: (listener: Parameters<typeof removeListener>[0]) => {
        removeListener(listener);
      }
    }
  } as unknown as typeof browser.storage;

  const reset = () => {
    sync.reset();
    local.reset();
    managed.reset();
    session.reset();
    addListener.mockReset();
    removeListener.mockReset();
  };

  return {
    stub,
    mocks: {
      sync: sync.mocks,
      local: local.mocks,
      managed: managed.mocks,
      session: session.mocks,
      onChangedAddListener: addListener,
      onChangedRemoveListener: removeListener
    },
    reset
  };
}

function createFirefoxRuntimeStub(): { stub: typeof browser.runtime; mocks: FirefoxRuntimeMocks; reset(): void } {
  const sendMessage = vi.fn(() => Promise.resolve(undefined));
  const getURL = vi.fn((path: string) => path);
  const addListener = vi.fn<Parameters<typeof browser.runtime.onMessage.addListener>, void>();
  const removeListener = vi.fn<Parameters<typeof browser.runtime.onMessage.removeListener>, void>();

  const stub = {
    getURL,
    sendMessage,
    onMessage: {
      addListener: (listener: Parameters<typeof addListener>[0]) => {
        addListener(listener);
      },
      removeListener: (listener: Parameters<typeof removeListener>[0]) => {
        removeListener(listener);
      }
    }
  } as unknown as typeof browser.runtime;

  const reset = () => {
    sendMessage.mockReset();
    getURL.mockReset();
    addListener.mockReset();
    removeListener.mockReset();
  };

  return {
    stub,
    mocks: {
      sendMessage,
      getURL,
      onMessageAddListener: addListener,
      onMessageRemoveListener: removeListener
    },
    reset
  };
}

function createFirefoxTabsStub(): { stub: typeof browser.tabs; reset(): void } {
  const sendMessage = vi.fn(() => Promise.resolve(undefined));

  const stub = {
    sendMessage
  } as unknown as typeof browser.tabs;

  const reset = () => {
    sendMessage.mockReset();
  };

  return { stub, reset };
}

export function createFirefoxRuntimeMock(): FirefoxMockHandle {
  const previousBrowser = (globalThis as { browser?: typeof browser }).browser;
  const previousChrome = globalThis.chrome;

  const actions = createFirefoxActionStub();
  const storage = createFirefoxStorageStub();
  const runtime = createFirefoxRuntimeStub();
  const tabs = createFirefoxTabsStub();

  const browserStub = {
    action: actions.action,
    browserAction: actions.browserAction,
    storage: storage.stub,
    runtime: runtime.stub,
    tabs: tabs.stub
  } as typeof browser;

  (globalThis as { browser?: typeof browser }).browser = browserStub;
  // Firefox 环境下默认不暴露 chrome.*
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (globalThis as Record<string, unknown>).chrome;

  const reset = () => {
    actions.reset();
    storage.reset();
    runtime.reset();
    tabs.reset();
  };

  return {
    browser: browserStub,
    actionMocks: actions.mocks,
    storageMocks: storage.mocks,
    runtimeMocks: runtime.mocks,
    reset,
    restore() {
      reset();
      if (previousBrowser) {
        (globalThis as { browser?: typeof browser }).browser = previousBrowser;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (globalThis as Record<string, unknown>).browser;
      }
      if (typeof previousChrome === 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (globalThis as Record<string, unknown>).chrome;
      } else {
        globalThis.chrome = previousChrome;
      }
    }
  };
}
