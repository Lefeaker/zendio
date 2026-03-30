import type {
  TabActivatedListener,
  TabRemovedListener,
  TabsSendOptions,
  TabsService,
  TabUpdatedListener
} from '../interfaces/tabs';
import { ensureFirefox } from './utils';

type FirefoxOnActivatedListener = Parameters<typeof browser.tabs.onActivated.addListener>[0];
type FirefoxOnUpdatedListener = Parameters<typeof browser.tabs.onUpdated.addListener>[0];
type FirefoxOnRemovedListener = Parameters<typeof browser.tabs.onRemoved.addListener>[0];

export const firefoxTabsService: TabsService = {
  async create(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab | undefined> {
    const firefoxApi = ensureFirefox();
    if (typeof firefoxApi.tabs.create !== 'function') {
      return undefined;
    }
    const tab = await firefoxApi.tabs.create(createProperties as Parameters<typeof browser.tabs.create>[0]);
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
    const tab = await firefoxApi.tabs.get(tabId);
    return tab as unknown as chrome.tabs.Tab;
  },

  async query(queryInfo?: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    const firefoxApi = ensureFirefox();
    if (typeof firefoxApi.tabs.query !== 'function') {
      return [];
    }
    const tabs = await firefoxApi.tabs.query((queryInfo ?? {}) as browser.tabs._QueryQueryInfo);
    return (tabs as unknown as chrome.tabs.Tab[]) ?? [];
  },

  async sendMessage<TResult = unknown>(tabId: number, message: unknown, options?: TabsSendOptions): Promise<TResult> {
    const firefoxApi = ensureFirefox();
    const response: unknown = await firefoxApi.tabs.sendMessage(tabId, message, options);
    return response as TResult;
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
      listener(tabId, changeInfo as unknown as chrome.tabs.OnUpdatedInfo, tab as unknown as chrome.tabs.Tab);
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
