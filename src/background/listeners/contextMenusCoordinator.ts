import { getMessages } from '@i18n';
import { PlatformError } from '../../platform/errors';
import type { ContextMenuListenerDependencies, ContextMenuRuntimeState } from './contextMenusTypes';
import { autoInjectIfNeeded, refreshSelectionModifierInjection } from './contextMenuInjection';
import { isVideoUrl } from './contextMenuUrls';

export function deriveVideoState(
  dependencies: ContextMenuListenerDependencies,
  state: ContextMenuRuntimeState,
  tabId?: number,
  url?: string | null
): boolean {
  const effectiveUrl = url ?? undefined;
  if (!effectiveUrl && typeof tabId === 'number') {
    const known = state.tabVideoState.get(tabId);
    if (typeof known === 'boolean') {
      return known;
    }
  }
  if (!effectiveUrl && typeof tabId === 'number') {
    void dependencies.tabs
      .get(tabId)
      .then((tab) => {
        const resolved = tab?.url;
        const result = isVideoUrl(resolved);
        state.tabVideoState.set(tabId, result);
      })
      .catch(() => {});
    return false;
  }
  const isVideo = isVideoUrl(effectiveUrl);
  if (typeof tabId === 'number') {
    state.tabVideoState.set(tabId, isVideo);
  }
  return isVideo;
}

export async function setupContextMenus(
  dependencies: ContextMenuListenerDependencies,
  state: ContextMenuRuntimeState
): Promise<void> {
  const { contextMenus, tabs } = dependencies;

  if (state.isSettingUpContextMenus) {
    console.log('[contextMenus] Setup already in progress, skipping...');
    return;
  }

  state.isSettingUpContextMenus = true;

  try {
    const msgs = await getMessages();
    state.clipSelectionDefaultTitle = msgs.clipSelection;
    state.clipSelectionVideoTitle = msgs.clipSelectionVideo;
    state.clipFullPageTitle = msgs.clipFullPage;
    state.videoModeTitle = msgs.contextMenuVideoMode;
    state.tabVideoState.clear();
    await refreshSelectionModifierInjection(state);

    try {
      await contextMenus.removeAll();
    } catch (error) {
      if (!isChromeUnavailable(error)) {
        console.warn('[contextMenus] Failed to clear existing context menus:', error);
      }
    }

    await contextMenus.create({
      id: 'clip-page',
      title: state.clipFullPageTitle,
      contexts: ['page', 'frame']
    });

    await contextMenus.create({
      id: 'clip-selection',
      title: state.clipSelectionDefaultTitle,
      contexts: ['selection']
    });

    await contextMenus.create({
      id: 'clip-video',
      title: state.videoModeTitle,
      contexts: ['video']
    });

    try {
      const [activeTab] = await tabs.query({ active: true, currentWindow: true });
      const initialTabUrl = activeTab?.url;
      if (activeTab?.id !== undefined) {
        const isVideo = isVideoUrl(initialTabUrl);
        state.tabVideoState.set(activeTab.id, isVideo);
        void autoInjectIfNeeded(dependencies, state, activeTab.id, initialTabUrl);
      }
    } catch (error) {
      console.warn('[contextMenus] Failed to inspect active tab after setup:', error);
    }
  } finally {
    state.isSettingUpContextMenus = false;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isChromeUnavailable(error: unknown): boolean {
  return error instanceof PlatformError && error.code === 'CHROME_UNAVAILABLE';
}
