import { notifyInjectionFailure } from '../services/notifications';
import { getMessages } from '../../i18n';

const CONTENT_SCRIPT_PATH = 'content/index.js';

export function registerContextMenuListeners(): void {
  chrome.runtime.onInstalled.addListener(async () => {
    const msgs = await getMessages();

    chrome.contextMenus.create({
      id: 'clip-current',
      title: msgs.clipFullPage,
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'clip-selection',
      title: msgs.clipSelection,
      contexts: ['selection']
    });
  });

  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab?.id) return;
    await injectClipper(tab.id);
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;

    await injectClipper(tab.id);

    if (info.menuItemId === 'clip-selection') {
      // Wait a little to ensure content script is ready
      await delay(100);
      await chrome.tabs.sendMessage(tab.id, { action: 'clipSelection' }).catch((error) => {
        console.error('[contextMenu] Failed to send clipSelection message:', error);
      });
    }
  });
}

async function injectClipper(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_PATH],
      world: 'ISOLATED'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[contextMenu] Failed to inject content script:', error);
    await notifyInjectionFailure(message);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
