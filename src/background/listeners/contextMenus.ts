import {
  autoInjectIfNeeded,
  delay,
  deriveVideoState,
  ensureModifierInjectionForActiveTab,
  injectClipper,
  refreshSelectionModifierInjection,
  setupContextMenus,
  isVideoUrl
} from './contextMenusCoordinator';
import {
  createContextMenuRuntimeState,
  type ContextMenuListenerDependencies
} from './contextMenusTypes';

const runtimeState = createContextMenuRuntimeState();
let listenerDependencies: ContextMenuListenerDependencies | null = null;

export function createContextMenuListenerDependencies(
  dependencies: ContextMenuListenerDependencies
): ContextMenuListenerDependencies {
  return dependencies;
}

function getDependencies(): ContextMenuListenerDependencies {
  if (!listenerDependencies) {
    throw new Error('[contextMenus] Dependencies have not been configured.');
  }
  return listenerDependencies;
}

export function registerContextMenuListeners(dependencies: ContextMenuListenerDependencies): void {
  listenerDependencies = dependencies;

  const { action, contextMenus, runtime, tabs, messaging, optionsRepository } = dependencies;

  runtime.onInstalled(() => {
    void setupContextMenus(dependencies, runtimeState);
  });

  runtime.onStartup(() => {
    void setupContextMenus(dependencies, runtimeState);
  });

  // Ensure menus exist even if startup event is unavailable.
  void setupContextMenus(dependencies, runtimeState);

  action.onClicked(async (tab) => {
    if (!tab?.id) {
      return;
    }
    try {
      await injectClipper(dependencies, runtimeState, tab.id, { targetFrameId: 0 });
      await delay(50);
      await tabs.sendMessage(tab.id, { action: 'clipFull' });
    } catch (error) {
      console.error('[action] Failed to trigger clipFull:', error);
    }
  });

  contextMenus.onClicked(async (info, tab) => {
    if (!tab?.id) {
      return;
    }

    const frameId = typeof info.frameId === 'number' ? info.frameId : 0;
    const candidateUrl = tab.url ?? info.pageUrl ?? null;
    const isVideo =
      typeof tab.id === 'number'
        ? deriveVideoState(dependencies, runtimeState, tab.id, candidateUrl)
        : isVideoUrl(candidateUrl);

    let actionType: 'clipFull' | 'clipSelection' | 'videoClipSelection' | 'startVideoMode' | null =
      null;
    let waitMs = 50;
    let targetFrameId: number | undefined = 0;

    switch (info.menuItemId) {
      case 'clip-page':
        if (isVideo) {
          actionType = 'startVideoMode';
          waitMs = 120;
        } else {
          actionType = 'clipFull';
        }
        targetFrameId = 0;
        break;
      case 'clip-selection':
        actionType = isVideo ? 'videoClipSelection' : 'clipSelection';
        waitMs = isVideo ? 120 : 100;
        targetFrameId = frameId;
        break;
      case 'clip-video':
        actionType = 'startVideoMode';
        waitMs = 120;
        targetFrameId = 0;
        break;
      default:
        break;
    }

    if (!actionType || targetFrameId === undefined) {
      return;
    }

    if (targetFrameId !== 0) {
      await injectClipper(dependencies, runtimeState, tab.id, { targetFrameId: 0, silent: true });
    }
    await injectClipper(dependencies, runtimeState, tab.id, { targetFrameId });
    await delay(waitMs);

    try {
      await tabs.sendMessage(
        tab.id,
        { action: actionType, frameId: targetFrameId, tabId: tab.id },
        { frameId: targetFrameId }
      );
    } catch (error) {
      console.error('[contextMenu] Failed to dispatch action to tab:', error);
    }
  });

  contextMenus.onShown((info, tab) => {
    const selectionText = typeof info.selectionText === 'string' ? info.selectionText.trim() : '';
    const hasSelection = selectionText.length > 0;
    const candidateUrl = tab?.url ?? info.pageUrl ?? null;
    const isVideo =
      typeof tab?.id === 'number'
        ? deriveVideoState(dependencies, runtimeState, tab.id, candidateUrl)
        : isVideoUrl(candidateUrl);

    const selectionTitle =
      hasSelection && isVideo
        ? runtimeState.clipSelectionVideoTitle || runtimeState.clipSelectionDefaultTitle
        : runtimeState.clipSelectionDefaultTitle;
    const pageTitle = isVideo ? runtimeState.videoModeTitle : runtimeState.clipFullPageTitle;

    void contextMenus.update('clip-selection', { title: selectionTitle }).catch(() => {});
    void contextMenus.update('clip-page', { title: pageTitle }).catch(() => {});
    contextMenus.refresh?.();
  });

  messaging.addListener((rawMessage, sender) => {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return undefined;
    }
    const message = rawMessage as { type?: unknown; payload?: unknown };
    if (message.type !== 'AIIOB_FORWARD_VIDEO_SELECTION') {
      return undefined;
    }

    const tabId = sender.tabId;
    if (typeof tabId !== 'number') {
      return { success: false, error: 'NO_TAB' };
    }

    const rawPayload =
      typeof message.payload === 'object' && message.payload !== null
        ? (message.payload as Record<string, unknown>)
        : {};

    const payload = {
      selectedHtml: String(rawPayload.selectedHtml ?? ''),
      selectedText: String(rawPayload.selectedText ?? ''),
      sourceFrameId: sender.frameId ?? null,
      sourceUrl: typeof rawPayload.sourceUrl === 'string' ? rawPayload.sourceUrl : null
    } as const;

    return tabs
      .sendMessage(tabId, { action: 'videoClipSelectionFromFrame', payload }, { frameId: 0 })
      .then(() => ({ success: true }))
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[contextMenu] Failed to forward video selection from frame:', msg);
        return { success: false, error: msg };
      });
  });

  optionsRepository.onChange(() => {
    void refreshSelectionModifierInjection(runtimeState)
      .then(() => ensureModifierInjectionForActiveTab(dependencies, runtimeState))
      .catch(() => {
        // ignore refresh failures; state will retry on next update
      });
  });

  tabs.onActivated(({ tabId }) => {
    void tabs
      .get(tabId)
      .then((tab) => {
        void autoInjectIfNeeded(dependencies, runtimeState, tabId, tab?.url);
      })
      .catch(() => {});
  });

  tabs.onUpdated((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
      runtimeState.autoInjectedTabs.delete(tabId);
    }
    if (changeInfo.status === 'complete' || typeof changeInfo.url === 'string') {
      const candidateUrl = changeInfo.url ?? tab.url;
      if (changeInfo.status === 'complete' || isVideoUrl(candidateUrl)) {
        void autoInjectIfNeeded(dependencies, runtimeState, tabId, candidateUrl);
      }
    }
  });

  tabs.onRemoved((tabId) => {
    runtimeState.tabVideoState.delete(tabId);
    runtimeState.autoInjectedTabs.delete(tabId);
  });
}
