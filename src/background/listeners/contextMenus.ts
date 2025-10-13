import { notifyInjectionFailure } from '../services/notifications';
import { getMessages } from '../../i18n';
import { getOptions } from '../store';

const CONTENT_SCRIPT_PATH = 'content/index.js';
let clipSelectionDefaultTitle = 'Clip selection to Obsidian';
let clipSelectionVideoTitle = 'Clip to video capture panel';
let clipFullPageTitle = 'Clip full page to Obsidian';
let videoModeTitle = 'Enter video capture mode';
const tabVideoState = new Map<number, boolean>();
const autoInjectedTabs = new Set<number>();
let selectionModifierInjectionEnabled = false;

function isVideoUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.includes('bilibili.com')) {
      return /\/video\//.test(parsed.pathname);
    }
    if (hostname === 'youtu.be') {
      return true;
    }
    if (hostname.includes('youtube.com')) {
      return parsed.pathname.startsWith('/watch') || parsed.pathname.startsWith('/shorts') || parsed.pathname.startsWith('/embed/');
    }
  } catch {
    return false;
  }
  return false;
}

function deriveVideoState(tabId?: number, url?: string | null): boolean {
  let effectiveUrl = url ?? undefined;
  if (!effectiveUrl && typeof tabId === 'number') {
    const known = tabVideoState.get(tabId);
    if (typeof known === 'boolean') {
      return known;
    }
  }
  if (!effectiveUrl && typeof tabId === 'number' && typeof chrome.tabs?.get === 'function') {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime?.lastError) {
        return;
      }
      const resolved = tab?.url;
      const result = isVideoUrl(resolved);
      tabVideoState.set(tabId, result);
    });
    return false;
  }
  const isVideo = isVideoUrl(effectiveUrl);
  if (typeof tabId === 'number') {
    tabVideoState.set(tabId, isVideo);
  }
  return isVideo;
}

async function refreshSelectionModifierInjection(): Promise<void> {
  try {
    const options = await getOptions();
    const fragment = options.fragmentClipper;
    const rawKeys = fragment?.selectionModifierKeys;
    const modifierKeys = Array.isArray(rawKeys) ? rawKeys : [];
    selectionModifierInjectionEnabled = Boolean(fragment?.selectionModifierEnabled && modifierKeys.length > 0);
  } catch (error) {
    console.warn('[contextMenus] Failed to resolve selection modifier options:', error);
    selectionModifierInjectionEnabled = false;
  }
}

function isInjectableUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

async function resolveTabUrl(tabId: number): Promise<string | undefined> {
  if (typeof chrome?.tabs?.get !== 'function') {
    return undefined;
  }
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime?.lastError) {
        resolve(undefined);
        return;
      }
      resolve(tab?.url ?? undefined);
    });
  });
}

async function ensureModifierInjectionForActiveTab(): Promise<void> {
  if (!selectionModifierInjectionEnabled || typeof chrome?.tabs?.query !== 'function') {
    return;
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      if (tab?.id !== undefined) {
        void autoInjectIfNeeded(tab.id, tab.url ?? undefined);
      }
    }
  } catch (error) {
    console.warn('[contextMenus] Failed to ensure modifier injection for active tab:', error);
  }
}

async function setupContextMenus(): Promise<void> {
  if (typeof chrome?.contextMenus?.create !== 'function') {
    return;
  }
  const msgs = await getMessages();
  clipSelectionDefaultTitle = msgs.clipSelection;
  clipSelectionVideoTitle = msgs.clipSelectionVideo;
  clipFullPageTitle = msgs.clipFullPage;
  videoModeTitle = msgs.contextMenuVideoMode;
  tabVideoState.clear();
  await refreshSelectionModifierInjection();

  if (typeof chrome.contextMenus.removeAll === 'function') {
    try {
      await chrome.contextMenus.removeAll();
    } catch {
      // ignore cleanup failures; creation will proceed regardless
    }
  }

  await new Promise<void>((resolve) => {
    chrome.contextMenus.create({
      id: 'clip-page',
      title: clipFullPageTitle,
      contexts: ['page', 'frame']
    }, () => {
      void chrome.runtime?.lastError;
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    chrome.contextMenus.create({
      id: 'clip-selection',
      title: clipSelectionDefaultTitle,
      contexts: ['selection']
    }, () => {
      void chrome.runtime?.lastError;
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    chrome.contextMenus.create({
      id: 'clip-video',
      title: videoModeTitle,
      contexts: ['video']
    }, () => {
      void chrome.runtime?.lastError;
      resolve();
    });
  });

  let initialTabUrl: string | null | undefined;
  if (typeof chrome.tabs?.query === 'function') {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      initialTabUrl = activeTab?.url;
      if (activeTab?.id !== undefined) {
        const isVideo = isVideoUrl(initialTabUrl);
        tabVideoState.set(activeTab.id, isVideo);
        void autoInjectIfNeeded(activeTab.id, initialTabUrl);
      }
    } catch {
      // ignore query failures
    }
  }
}

export function registerContextMenuListeners(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onInstalled || !chrome.contextMenus?.create) {
    console.warn('[contextMenus] Chrome runtime APIs are unavailable; skipping context menu registration.');
    return;
  }

  chrome.runtime.onInstalled.addListener(() => {
    void setupContextMenus();
  });

  if (typeof chrome.runtime.onStartup?.addListener === 'function') {
    chrome.runtime.onStartup.addListener(() => {
      void setupContextMenus();
    });
  } else {
    // Fallback for environments without onStartup support (e.g., tests/devtools)
    void setupContextMenus();
  }

  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab?.id) return;
    await injectClipper(tab.id, { targetFrameId: 0 });
    await delay(50);
    await chrome.tabs.sendMessage(tab.id, { action: 'clipFull' }).catch((error) => {
      console.error('[action] Failed to send clipFull message:', error);
    });
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) {
      return;
    }

    const frameId = typeof info.frameId === 'number' ? info.frameId : 0;
    const candidateUrl = tab.url ?? info.pageUrl ?? null;
    const isVideo = typeof tab.id === 'number'
      ? deriveVideoState(tab.id, candidateUrl)
      : isVideoUrl(candidateUrl);

    let action: 'clipFull' | 'clipSelection' | 'videoClipSelection' | 'startVideoMode' | null = null;
    let waitMs = 50;
    let targetFrameId: number | undefined = 0;

    switch (info.menuItemId) {
      case 'clip-page':
        if (isVideo) {
          action = 'startVideoMode';
          waitMs = 120;
        } else {
          action = 'clipFull';
        }
        targetFrameId = 0;
        break;
      case 'clip-selection':
        action = isVideo ? 'videoClipSelection' : 'clipSelection';
        waitMs = isVideo ? 120 : 100;
        targetFrameId = frameId;
        break;
      case 'clip-video':
        action = 'startVideoMode';
        waitMs = 120;
        targetFrameId = 0;
        break;
      default:
        break;
    }

    if (!action || targetFrameId === undefined) {
      return;
    }

    if (targetFrameId !== 0) {
      await injectClipper(tab.id, { targetFrameId: 0, silent: true });
    }
    await injectClipper(tab.id, { targetFrameId });
    await delay(waitMs);

    await chrome.tabs.sendMessage(tab.id, { action, frameId: targetFrameId, tabId: tab.id }, { frameId: targetFrameId }).catch((error) => {
      console.error('[contextMenu] Failed to handle menu action:', error);
    });
  });

  if (typeof chrome.contextMenus.onShown?.addListener === 'function') {
    chrome.contextMenus.onShown.addListener((info, tab) => {
      const selectionText = typeof info.selectionText === 'string' ? info.selectionText.trim() : '';
      const hasSelection = selectionText.length > 0;
      const candidateUrl = tab?.url ?? info.pageUrl ?? null;
      const isVideo = typeof tab?.id === 'number'
        ? deriveVideoState(tab.id, candidateUrl)
        : isVideoUrl(candidateUrl);

      const selectionTitle = hasSelection && isVideo
        ? clipSelectionVideoTitle || clipSelectionDefaultTitle
        : clipSelectionDefaultTitle;
      const pageTitle = isVideo ? videoModeTitle : clipFullPageTitle;

      chrome.contextMenus.update('clip-selection', { title: selectionTitle }, () => {
        void chrome.runtime?.lastError;
      });
      chrome.contextMenus.update('clip-page', { title: pageTitle }, () => {
        void chrome.runtime?.lastError;
      });
      const maybeRefresh = (chrome.contextMenus as unknown as { refresh?: () => void }).refresh;
      if (typeof maybeRefresh === 'function') {
        maybeRefresh.call(chrome.contextMenus);
      }
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'AIIOB_FORWARD_VIDEO_SELECTION') {
      return undefined;
    }

    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number') {
      sendResponse?.({ success: false, error: 'NO_TAB' });
      return undefined;
    }

    const payload = {
      selectedHtml: String(message.payload?.selectedHtml ?? ''),
      selectedText: String(message.payload?.selectedText ?? ''),
      sourceFrameId: sender.frameId ?? null,
      sourceUrl: typeof message.payload?.sourceUrl === 'string' ? message.payload.sourceUrl : null
    } as const;

    chrome.tabs.sendMessage(tabId, { action: 'videoClipSelectionFromFrame', payload }, { frameId: 0 }, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        console.error('[contextMenu] Failed to forward video selection from frame:', error.message);
        sendResponse?.({ success: false, error: error.message });
        return;
      }
      sendResponse?.({ success: true });
    });

    return true;
  });

  if (typeof chrome?.storage?.onChanged?.addListener === 'function') {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync' || !changes.options) {
        return;
      }
      void refreshSelectionModifierInjection()
        .then(() => ensureModifierInjectionForActiveTab())
        .catch(() => {
          // ignore refresh failures; state will retry on next update
        });
    });
  }

}

type InjectionOptions = {
  silent?: boolean;
  targetFrameId?: number;
  allFrames?: boolean;
};

async function injectClipper(tabId: number, options?: InjectionOptions): Promise<void> {
  try {
    const target: chrome.scripting.InjectionTarget = options?.allFrames
      ? { tabId, allFrames: true }
      : options?.targetFrameId !== undefined
        ? { tabId, frameIds: [options.targetFrameId] }
        : { tabId };
    await chrome.scripting.executeScript({
      target,
      files: [CONTENT_SCRIPT_PATH],
      world: 'ISOLATED'
    });
    autoInjectedTabs.add(tabId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[contextMenu] Failed to inject content script:', error);
    if (!options?.silent) {
      await notifyInjectionFailure(message);
    }
  }
}

async function autoInjectIfNeeded(tabId: number, url?: string | null): Promise<void> {
  if (autoInjectedTabs.has(tabId)) {
    return;
  }
  const candidateUrl = typeof url === 'string' ? url : undefined;
  const videoCandidate = isVideoUrl(candidateUrl);
  let shouldInject = videoCandidate;
  let resolvedUrl = candidateUrl;

  if (!shouldInject && selectionModifierInjectionEnabled) {
    if (!resolvedUrl) {
      resolvedUrl = await resolveTabUrl(tabId);
    }
    shouldInject = isInjectableUrl(resolvedUrl);
  }

  if (!shouldInject || autoInjectedTabs.has(tabId)) {
    return;
  }

  try {
    await injectClipper(tabId, { silent: true, allFrames: true });
  } catch {
    // Silent auto-injection failures are ignored; user actions will surface errors.
  }
}

if (typeof chrome?.tabs?.onActivated?.addListener === 'function') {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    if (typeof chrome.tabs?.get === 'function') {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime?.lastError) {
          return;
        }
        void autoInjectIfNeeded(tabId, tab?.url);
      });
    }
  });
}

if (typeof chrome?.tabs?.onUpdated?.addListener === 'function') {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
      autoInjectedTabs.delete(tabId);
    }
    if (changeInfo.status === 'complete' || typeof changeInfo.url === 'string') {
      const candidateUrl = changeInfo.url ?? tab.url;
      if (changeInfo.status === 'complete' || isVideoUrl(candidateUrl)) {
        void autoInjectIfNeeded(tabId, candidateUrl);
      }
    }
  });
}

if (typeof chrome?.tabs?.onRemoved?.addListener === 'function') {
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabVideoState.delete(tabId);
    autoInjectedTabs.delete(tabId);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
