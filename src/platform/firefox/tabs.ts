import type {
  TabActivatedListener,
  TabRemovedListener,
  TabsSendOptions,
  TabsService,
  TabUpdatedListener,
  VisibleTabCaptureOptions
} from '../interfaces/tabs';
import { TabsBoundaryError } from '../interfaces/tabs';
import { ensureFirefox } from './utils';

type FirefoxOnActivatedListener = Parameters<typeof browser.tabs.onActivated.addListener>[0];
type FirefoxOnUpdatedListener = Parameters<typeof browser.tabs.onUpdated.addListener>[0];
type FirefoxOnRemovedListener = Parameters<typeof browser.tabs.onRemoved.addListener>[0];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeFirefoxTabError(error: unknown, operation: 'get' | 'send'): never {
  const message = errorMessage(error);
  if (operation === 'get' && /^Invalid tab ID: \d+\.?$/i.test(message)) {
    throw new TabsBoundaryError('TAB_NOT_FOUND');
  }
  if (
    operation === 'send' &&
    (/^Could not establish connection\. Receiving end does not exist\.?$/i.test(message) ||
      /^Message manager disconnected\.?$/i.test(message))
  ) {
    throw new TabsBoundaryError('NO_RECEIVER');
  }
  throw error;
}

export const firefoxTabsService: TabsService = {
  async create(
    createProperties: chrome.tabs.CreateProperties
  ): Promise<chrome.tabs.Tab | undefined> {
    const firefoxApi = ensureFirefox();
    if (typeof firefoxApi.tabs.create !== 'function') {
      return undefined;
    }
    const tab = await firefoxApi.tabs.create(
      createProperties as Parameters<typeof browser.tabs.create>[0]
    );
    return tab as unknown as chrome.tabs.Tab;
  },

  async remove(tabId: number): Promise<void> {
    const firefoxApi = ensureFirefox();
    if (typeof firefoxApi.tabs.remove !== 'function') {
      return;
    }
    await firefoxApi.tabs.remove(tabId);
  },

  async getCurrent(): Promise<chrome.tabs.Tab | undefined> {
    const firefoxApi = ensureFirefox();
    if (typeof firefoxApi.tabs.getCurrent !== 'function') {
      return undefined;
    }
    const tab = await firefoxApi.tabs.getCurrent();
    return tab as unknown as chrome.tabs.Tab;
  },

  async get(tabId: number): Promise<chrome.tabs.Tab | undefined> {
    const firefoxApi = ensureFirefox();
    if (typeof firefoxApi.tabs.get !== 'function') {
      return undefined;
    }
    try {
      const tab = await firefoxApi.tabs.get(tabId);
      return tab as unknown as chrome.tabs.Tab;
    } catch (error) {
      normalizeFirefoxTabError(error, 'get');
    }
  },

  async query(queryInfo?: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    const firefoxApi = ensureFirefox();
    if (typeof firefoxApi.tabs.query !== 'function') {
      return [];
    }
    const tabs = await firefoxApi.tabs.query((queryInfo ?? {}) as browser.tabs._QueryQueryInfo);
    return (tabs as unknown as chrome.tabs.Tab[]) ?? [];
  },

  async captureVisibleTab(
    windowId?: number,
    options?: VisibleTabCaptureOptions
  ): Promise<string | undefined> {
    const firefoxApi = ensureFirefox();
    if (typeof firefoxApi.tabs.captureVisibleTab !== 'function') {
      return undefined;
    }
    const captureOptions = options ?? {};
    const dataUrl =
      typeof windowId === 'number'
        ? await firefoxApi.tabs.captureVisibleTab(windowId, captureOptions)
        : await firefoxApi.tabs.captureVisibleTab(captureOptions);
    return typeof dataUrl === 'string' ? dataUrl : undefined;
  },

  async sendMessage<TResult = unknown>(
    tabId: number,
    message: unknown,
    options?: TabsSendOptions
  ): Promise<TResult> {
    if (options?.documentId) throw new Error('DOCUMENT_TARGETED_MESSAGING_UNAVAILABLE');
    const firefoxApi = ensureFirefox();
    try {
      const response: unknown = await firefoxApi.tabs.sendMessage(tabId, message, options);
      return response as TResult;
    } catch (error) {
      normalizeFirefoxTabError(error, 'send');
    }
  },

  onActivated(listener: TabActivatedListener): () => void {
    const firefoxApi = ensureFirefox();
    if (!firefoxApi.tabs.onActivated) {
      return () => {};
    }
    const wrapped: FirefoxOnActivatedListener = (info) => {
      listener({
        tabId: info.tabId,
        windowId: info.windowId
      });
    };
    firefoxApi.tabs.onActivated.addListener(wrapped);
    return () => firefoxApi.tabs.onActivated?.removeListener(wrapped);
  },

  onUpdated(listener: TabUpdatedListener): () => void {
    const firefoxApi = ensureFirefox();
    if (!firefoxApi.tabs.onUpdated) {
      return () => {};
    }
    const wrapped: FirefoxOnUpdatedListener = (tabId, changeInfo, tab) => {
      listener(
        tabId,
        changeInfo as unknown as chrome.tabs.OnUpdatedInfo,
        tab as unknown as chrome.tabs.Tab
      );
    };
    firefoxApi.tabs.onUpdated.addListener(wrapped);
    return () => firefoxApi.tabs.onUpdated?.removeListener(wrapped);
  },

  onRemoved(listener: TabRemovedListener): () => void {
    const firefoxApi = ensureFirefox();
    if (!firefoxApi.tabs.onRemoved) {
      return () => {};
    }
    const wrapped: FirefoxOnRemovedListener = (tabId, removeInfo) => {
      listener(tabId, removeInfo as unknown as chrome.tabs.OnRemovedInfo);
    };
    firefoxApi.tabs.onRemoved.addListener(wrapped);
    return () => firefoxApi.tabs.onRemoved?.removeListener(wrapped);
  }
};
