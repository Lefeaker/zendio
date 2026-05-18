import type { TabsSendOptions, TabsService } from '../interfaces/tabs';
import { ensureChrome, getChromeLastError, normalizePromise, suppressLastError } from './utils';

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === 'function');
}

export const chromeTabsService: TabsService = {
  async create(
    createProperties: chrome.tabs.CreateProperties
  ): Promise<chrome.tabs.Tab | undefined> {
    const chromeApi = ensureChrome();
    return normalizePromise<chrome.tabs.Tab | undefined>((resolve, reject) => {
      try {
        chromeApi.tabs.create(createProperties, (tab) => {
          const error = getChromeLastError();
          if (error) {
            reject(error);
            return;
          }
          resolve(tab ?? undefined);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  },

  async remove(tabId: number): Promise<void> {
    const chromeApi = ensureChrome();
    return normalizePromise<void>((resolve, reject) => {
      try {
        chromeApi.tabs.remove(tabId, () => {
          const error = getChromeLastError();
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  },

  async getCurrent(): Promise<chrome.tabs.Tab | undefined> {
    const chromeApi = ensureChrome();
    return normalizePromise<chrome.tabs.Tab | undefined>((resolve, reject) => {
      try {
        chromeApi.tabs.getCurrent((tab) => {
          const error = getChromeLastError();
          if (error) {
            reject(error);
            return;
          }
          resolve(tab ?? undefined);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  },

  async get(tabId: number): Promise<chrome.tabs.Tab | undefined> {
    const chromeApi = ensureChrome();
    return normalizePromise<chrome.tabs.Tab | undefined>((resolve, reject) => {
      try {
        chromeApi.tabs.get(tabId, (tab) => {
          const error = getChromeLastError();
          if (error) {
            reject(error);
            return;
          }
          resolve(tab ?? undefined);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  },

  async query(queryInfo?: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    const chromeApi = ensureChrome();
    if (typeof chromeApi.tabs.query !== 'function') {
      return [];
    }
    return normalizePromise<chrome.tabs.Tab[]>((resolve, reject) => {
      try {
        chromeApi.tabs.query(queryInfo ?? {}, (tabs) => {
          const error = getChromeLastError();
          if (error) {
            reject(error);
            return;
          }
          resolve(Array.isArray(tabs) ? tabs : []);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  },

  async sendMessage<TResult = unknown>(
    tabId: number,
    message: unknown,
    options?: TabsSendOptions
  ): Promise<TResult> {
    const chromeApi = ensureChrome();
    return normalizePromise<TResult>((resolve, reject) => {
      try {
        chromeApi.tabs.sendMessage(tabId, message, options ?? {}, (response) => {
          const error = getChromeLastError();
          if (error) {
            reject(error);
            return;
          }
          resolve(response as TResult);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  },

  onActivated(listener) {
    const chromeApi = ensureChrome();
    const wrapped = (activeInfo: chrome.tabs.OnActivatedInfo) => {
      try {
        listener(activeInfo);
      } catch {
        // ignore
      }
    };
    chromeApi.tabs.onActivated.addListener(wrapped);
    return () => {
      chromeApi.tabs.onActivated.removeListener(wrapped);
    };
  },

  onUpdated(listener) {
    const chromeApi = ensureChrome();
    const wrapped = (
      tabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab
    ) => {
      try {
        listener(tabId, changeInfo, tab);
      } catch {
        // ignore
      }
    };
    chromeApi.tabs.onUpdated.addListener(wrapped);
    return () => {
      chromeApi.tabs.onUpdated.removeListener(wrapped);
    };
  },

  onRemoved(listener) {
    const chromeApi = ensureChrome();
    const wrapped = (tabId: number, removeInfo: chrome.tabs.OnRemovedInfo) => {
      try {
        const result = listener(tabId, removeInfo);
        if (isPromiseLike(result)) {
          void result.catch(() => {});
        } else {
          suppressLastError();
        }
      } catch {
        // ignore
      }
    };
    chromeApi.tabs.onRemoved.addListener(wrapped);
    return () => {
      chromeApi.tabs.onRemoved.removeListener(wrapped);
    };
  }
};
