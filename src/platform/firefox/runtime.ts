import type {
  RuntimeInstallDetails,
  RuntimeInstallListener,
  RuntimeService,
  RuntimeStartupListener
} from '../interfaces/runtime';
import { ensureFirefox } from './utils';

type FirefoxOnInstalledListener = Parameters<typeof browser.runtime.onInstalled.addListener>[0];
type FirefoxOnStartupListener = Parameters<typeof browser.runtime.onStartup.addListener>[0];

function mapInstallDetails(details: Parameters<FirefoxOnInstalledListener>[0]): RuntimeInstallDetails {
  const mapped: RuntimeInstallDetails = {};
  if (details.reason !== undefined) {
    mapped.reason = details.reason as Exclude<RuntimeInstallDetails['reason'], undefined>;
  }
  if (details.previousVersion !== undefined) {
    mapped.previousVersion = details.previousVersion;
  }
  return mapped;
}

export const firefoxRuntimeService: RuntimeService = {
  getURL(path: string): string {
    const firefoxApi = ensureFirefox();
    return firefoxApi.runtime.getURL(path);
  },

  async openOptionsPage(): Promise<void> {
    const firefoxApi = ensureFirefox();
    if (typeof firefoxApi.runtime.openOptionsPage === 'function') {
      await firefoxApi.runtime.openOptionsPage();
      return;
    }
    const fallbackUrl = firefoxApi.runtime.getURL('options/index.html');
    if (typeof firefoxApi.tabs.create === 'function') {
      await firefoxApi.tabs.create({ url: fallbackUrl });
    }
  },

  onInstalled(listener: RuntimeInstallListener): () => void {
    const firefoxApi = ensureFirefox();
    const wrapped: FirefoxOnInstalledListener = (details) => {
      try {
        listener(mapInstallDetails(details));
      } catch {
        // ignore listener failures to match chrome parity
      }
    };
    firefoxApi.runtime.onInstalled.addListener(wrapped);
    return () => firefoxApi.runtime.onInstalled.removeListener(wrapped);
  },

  onStartup(listener: RuntimeStartupListener): () => void {
    const firefoxApi = ensureFirefox();
    if (!firefoxApi.runtime.onStartup) {
      return () => {};
    }
    const wrapped: FirefoxOnStartupListener = () => {
      try {
        listener();
      } catch {
        // swallow errors to keep Firefox event resilient
      }
    };
    firefoxApi.runtime.onStartup.addListener(wrapped);
    return () => firefoxApi.runtime.onStartup?.removeListener(wrapped);
  }
};
