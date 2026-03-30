import type { ActionClickListener, ActionService } from '../interfaces/actions';
import { ensureChrome, suppressLastError, getChromeLastError, normalizePromise } from './utils';
import { chromeApiErrors, errorHandler } from '../../shared/errors';

export const chromeActionService: ActionService = {
  onClicked(listener: ActionClickListener): () => void {
    const chromeApi = ensureChrome();
    const wrapped = (tab: chrome.tabs.Tab) => {
      try {
        const result = listener(tab);
        if (result && typeof (result).catch === 'function') {
          void (result).catch((error) => {
            const appError = chromeApiErrors.runtimeError(
              'action.onClicked handler rejected',
              {
                api: 'chrome.action',
                operation: 'onClicked',
                details: { tabId: tab.id }
              },
              error
            );
            void errorHandler.handle(appError, { suppressNotifications: true });
          });
        }
        suppressLastError();
      } catch (error) {
        const appError = chromeApiErrors.runtimeError(
          'action.onClicked handler threw',
          {
            api: 'chrome.action',
            operation: 'onClicked',
            details: { tabId: tab.id }
          },
          error
        );
        void errorHandler.handle(appError, { suppressNotifications: true });
      }
    };
    chromeApi.action.onClicked.addListener(wrapped);
    return () => {
      chromeApi.action.onClicked.removeListener(wrapped);
    };
  },

  async setBadgeText(details: { text: string; tabId?: number }): Promise<void> {
    const chromeApi = ensureChrome();
    if (!chromeApi.action?.setBadgeText) {
      return;
    }
    await normalizePromise<void>((resolve, reject) => {
      chromeApi.action.setBadgeText(details, () => {
        const error = getChromeLastError();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  },

  async setBadgeBackgroundColor(details: { color: string | [number, number, number, number]; tabId?: number }): Promise<void> {
    const chromeApi = ensureChrome();
    if (!chromeApi.action?.setBadgeBackgroundColor) {
      return;
    }
    await normalizePromise<void>((resolve, reject) => {
      chromeApi.action.setBadgeBackgroundColor(details, () => {
        const error = getChromeLastError();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
};
