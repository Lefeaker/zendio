import type {
  ContextMenuOnClickListener,
  ContextMenuOnShownListener,
  ContextMenusService,
  MenuCreateProperties,
  MenuID,
  MenuUpdateProperties
} from '../interfaces/contextMenus';
import { ensureChrome, getChromeLastError, normalizePromise, suppressLastError } from './utils';
import { chromeApiErrors, errorHandler } from '../../shared/errors';

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === 'function');
}

function serializeCreateProperties(properties: MenuCreateProperties): Record<string, unknown> {
  return {
    id: properties.id,
    title: (properties as { title?: string }).title,
    contexts: properties.contexts,
    type: properties.type
  };
}

function serializeUpdateProperties(properties: MenuUpdateProperties): Record<string, unknown> {
  return {
    title: (properties as { title?: string }).title,
    enabled: (properties as { enabled?: boolean }).enabled,
    contexts: properties.contexts
  };
}

function serializeClickContext(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab | null
): Record<string, unknown> {
  return {
    menuItemId: info.menuItemId,
    parentMenuItemId: info.parentMenuItemId,
    pageUrl: info.pageUrl,
    tabId: tab?.id
  };
}

export const chromeContextMenusService: ContextMenusService = {
  async create(properties: MenuCreateProperties): Promise<MenuID> {
    const chromeApi = ensureChrome();
    return normalizePromise<MenuID>((resolve, reject) => {
      try {
        const createdId = chromeApi.contextMenus.create(properties);
        const lastError = getChromeLastError();
        if (lastError) {
          const appError = chromeApiErrors.runtimeError(
            'contextMenus.create failed',
            {
              api: 'chrome.contextMenus',
              operation: 'create',
              details: serializeCreateProperties(properties)
            },
            lastError
          );
          void errorHandler.handle(appError, { suppressNotifications: true });
          reject(appError as unknown as Error);
          return;
        }
        resolve((createdId ?? properties.id) as MenuID);
      } catch (error) {
        const appError = chromeApiErrors.runtimeError(
          'contextMenus.create threw an exception',
          {
            api: 'chrome.contextMenus',
            operation: 'create',
            details: serializeCreateProperties(properties)
          },
          error
        );
        void errorHandler.handle(appError, { suppressNotifications: true });
        reject(appError as unknown as Error);
      }
    });
  },

  async update(id: MenuID, properties: MenuUpdateProperties): Promise<void> {
    const chromeApi = ensureChrome();
    await normalizePromise<void>((resolve, reject) => {
      try {
        chromeApi.contextMenus.update(id, properties, () => {
          const lastError = getChromeLastError();
          if (lastError) {
            const appError = chromeApiErrors.runtimeError(
              'contextMenus.update failed',
              {
                api: 'chrome.contextMenus',
                operation: 'update',
                details: {
                  menuId: id,
                  ...serializeUpdateProperties(properties)
                }
              },
              lastError
            );
            void errorHandler.handle(appError, { suppressNotifications: true });
            reject(appError as unknown as Error);
            return;
          }
          resolve();
        });
      } catch (error) {
        const appError = chromeApiErrors.runtimeError(
          'contextMenus.update threw an exception',
          {
            api: 'chrome.contextMenus',
            operation: 'update',
            details: {
              menuId: id,
              ...serializeUpdateProperties(properties)
            }
          },
          error
        );
        void errorHandler.handle(appError, { suppressNotifications: true });
        reject(appError as unknown as Error);
      }
    });
  },

  async removeAll(): Promise<void> {
    const chromeApi = ensureChrome();
    await normalizePromise<void>((resolve, reject) => {
      try {
        chromeApi.contextMenus.removeAll(() => {
          const lastError = getChromeLastError();
          if (lastError) {
            const appError = chromeApiErrors.runtimeError(
              'contextMenus.removeAll failed',
              {
                api: 'chrome.contextMenus',
                operation: 'removeAll'
              },
              lastError
            );
            void errorHandler.handle(appError, { suppressNotifications: true });
            reject(appError as unknown as Error);
            return;
          }
          resolve();
        });
      } catch (error) {
        const appError = chromeApiErrors.runtimeError(
          'contextMenus.removeAll threw an exception',
          {
            api: 'chrome.contextMenus',
            operation: 'removeAll'
          },
          error
        );
        void errorHandler.handle(appError, { suppressNotifications: true });
        reject(appError as unknown as Error);
      }
    });
  },

  onClicked(listener: ContextMenuOnClickListener): () => void {
    const chromeApi = ensureChrome();
    const wrapped = (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab | null) => {
      try {
        const result = listener(info, tab);
        if (isPromiseLike(result)) {
          void result.catch((error) => {
            const appError = chromeApiErrors.runtimeError(
              'contextMenus.onClicked handler rejected',
              {
                api: 'chrome.contextMenus',
                operation: 'onClicked',
                details: serializeClickContext(info, tab)
              },
              error
            );
            void errorHandler.handle(appError, { suppressNotifications: true });
          });
        } else {
          suppressLastError();
        }
      } catch (error) {
        const appError = chromeApiErrors.runtimeError(
          'contextMenus.onClicked handler threw',
          {
            api: 'chrome.contextMenus',
            operation: 'onClicked',
            details: serializeClickContext(info, tab)
          },
          error
        );
        void errorHandler.handle(appError, { suppressNotifications: true });
      }
    };
    chromeApi.contextMenus.onClicked.addListener(wrapped);
    return () => {
      chromeApi.contextMenus.onClicked.removeListener(wrapped);
    };
  },

  onShown(listener: ContextMenuOnShownListener): () => void {
    const chromeApi = ensureChrome();
    const contextMenusApi = chromeApi.contextMenus as unknown as {
      onShown?: {
        addListener: (
          callback: (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab | null) => void
        ) => void;
        removeListener?: (
          callback: (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab | null) => void
        ) => void;
      };
    };
    const onShown = contextMenusApi.onShown;
    if (!onShown?.addListener) {
      return () => undefined;
    }
    const wrapped = (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab | null) => {
      try {
        const result = listener(info, tab);
        if (isPromiseLike(result)) {
          void result.catch((error) => {
            const appError = chromeApiErrors.runtimeError(
              'contextMenus.onShown handler rejected',
              {
                api: 'chrome.contextMenus',
                operation: 'onShown',
                details: serializeClickContext(info, tab)
              },
              error
            );
            void errorHandler.handle(appError, { suppressNotifications: true });
          });
        } else {
          suppressLastError();
        }
      } catch (error) {
        const appError = chromeApiErrors.runtimeError(
          'contextMenus.onShown handler threw',
          {
            api: 'chrome.contextMenus',
            operation: 'onShown',
            details: serializeClickContext(info, tab)
          },
          error
        );
        void errorHandler.handle(appError, { suppressNotifications: true });
      }
    };
    onShown.addListener(wrapped);
    return () => {
      onShown.removeListener?.(wrapped);
    };
  },

  refresh() {
    const chromeApi = ensureChrome();
    const refreshFn = (chromeApi.contextMenus as unknown as { refresh?: () => void }).refresh;
    if (typeof refreshFn === 'function') {
      try {
        refreshFn.call(chromeApi.contextMenus);
      } catch (error) {
        const appError = chromeApiErrors.runtimeError(
          'contextMenus.refresh threw',
          {
            api: 'chrome.contextMenus',
            operation: 'refresh'
          },
          error
        );
        void errorHandler.handle(appError, { suppressNotifications: true });
      }
    }
  }
};
