import type {
  RuntimeInstallDetails,
  RuntimeInstallListener,
  RuntimeService,
  RuntimeStartupListener
} from '../interfaces/runtime';
import { ensureChrome, getChromeLastError, normalizePromise } from './utils';

function toInstallDetails(details: chrome.runtime.InstalledDetails): RuntimeInstallDetails {
  const result: RuntimeInstallDetails = {
    reason: details.reason
  };

  if (details.previousVersion !== undefined) {
    result.previousVersion = details.previousVersion;
  }

  return result;
}

export const chromeRuntimeService: RuntimeService = {
  getURL(path: string): string {
    const chromeApi = ensureChrome();
    return chromeApi.runtime.getURL(path);
  },

  async sendMessage<TResult = unknown>(message: unknown): Promise<TResult> {
    const chromeApi = ensureChrome();
    return normalizePromise<TResult>((resolve, reject) => {
      try {
        chromeApi.runtime.sendMessage(message, (response) => {
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

  getUILanguage() {
    const chromeApi = ensureChrome();
    if (typeof chromeApi.i18n?.getUILanguage === 'function') {
      return chromeApi.i18n.getUILanguage();
    }
    return undefined;
  },

  getManifest() {
    const chromeApi = ensureChrome();
    if (typeof chromeApi.runtime.getManifest === 'function') {
      return chromeApi.runtime.getManifest();
    }
    return undefined;
  },

  async openOptionsPage(): Promise<void> {
    const chromeApi = ensureChrome();
    if (typeof chromeApi.runtime.openOptionsPage === 'function') {
      await normalizePromise<void>((resolve, reject) => {
        try {
          chromeApi.runtime.openOptionsPage(() => {
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
      return;
    }

    const fallbackUrl = chromeApi.runtime.getURL('options/index.html');
    await normalizePromise<void>((resolve, reject) => {
      try {
        chromeApi.tabs.create({ url: fallbackUrl }, () => {
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

  onInstalled(listener: RuntimeInstallListener) {
    const chromeApi = ensureChrome();
    const wrapped = (details: chrome.runtime.InstalledDetails) => {
      try {
        listener(toInstallDetails(details));
      } catch {
        // ignore handler errors to avoid breaking Chrome events
      }
    };
    chromeApi.runtime.onInstalled.addListener(wrapped);
    return () => {
      chromeApi.runtime.onInstalled.removeListener(wrapped);
    };
  },

  onStartup(listener: RuntimeStartupListener) {
    const chromeApi = ensureChrome();
    if (!chromeApi.runtime.onStartup) {
      return () => undefined;
    }
    const wrapped = () => {
      try {
        listener();
      } catch {
        // ignore handler errors
      }
    };
    chromeApi.runtime.onStartup.addListener(wrapped);
    return () => {
      chromeApi.runtime.onStartup?.removeListener?.(wrapped);
    };
  }
};
