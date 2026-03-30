import type { ActionClickListener, ActionService } from '../interfaces/actions';
import { ensureFirefox } from './utils';

/**
 * Firefox Action 服务实现
 * 注意：Firefox 使用 browserAction 而不是 action
 */
function wrapClickListener(listener: ActionClickListener) {
  return (tab: browser.tabs.Tab) => {
    void listener(tab as unknown as chrome.tabs.Tab);
  };
}

export const firefoxActionService: ActionService = {
  onClicked(listener: ActionClickListener) {
    const firefoxApi = ensureFirefox();
    const wrapped = wrapClickListener(listener);

    if (firefoxApi.browserAction?.onClicked) {
      firefoxApi.browserAction.onClicked.addListener(wrapped);
      return () => firefoxApi.browserAction.onClicked.removeListener(wrapped);
    }

    if (firefoxApi.action?.onClicked) {
      firefoxApi.action.onClicked.addListener(wrapped);
      return () => firefoxApi.action.onClicked.removeListener(wrapped);
    }

    console.warn('Firefox action click listener is unavailable');
    return () => {};
  },

  async setBadgeText(details: { text: string; tabId?: number }): Promise<void> {
    const firefoxApi = ensureFirefox();
    
    // Firefox 使用 browserAction
    if (firefoxApi.browserAction?.setBadgeText) {
      try {
        await firefoxApi.browserAction.setBadgeText(details);
      } catch (error) {
        console.warn('Failed to set badge text:', error);
      }
    } else if (firefoxApi.action?.setBadgeText) {
      // 新版本 Firefox 可能支持 action API
      try {
        await firefoxApi.action.setBadgeText(details);
      } catch (error) {
        console.warn('Failed to set badge text:', error);
      }
    }
  },

  async setBadgeBackgroundColor(details: { color: string | [number, number, number, number]; tabId?: number }): Promise<void> {
    const firefoxApi = ensureFirefox();
    
    if (firefoxApi.browserAction?.setBadgeBackgroundColor) {
      try {
        await firefoxApi.browserAction.setBadgeBackgroundColor(details);
      } catch (error) {
        console.warn('Failed to set badge background color:', error);
      }
      return;
    }

    if (firefoxApi.action?.setBadgeBackgroundColor) {
      try {
        await firefoxApi.action.setBadgeBackgroundColor(details);
      } catch (error) {
        console.warn('Failed to set badge background color:', error);
      }
      return;
    }
  }
};
