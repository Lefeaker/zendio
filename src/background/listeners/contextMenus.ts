import { delay, deriveVideoState, setupContextMenus } from './contextMenusCoordinator';
import {
  autoInjectIfNeeded,
  ensureModifierInjectionForActiveTab,
  injectClipper,
  refreshSelectionModifierInjection
} from './contextMenuInjection';
import {
  notifyActionDispatchFailure,
  resolveContentActionFailureMessage
} from './contextMenuDispatch';
import { registerFrameSelectionBridge } from './contextMenuFrameSelectionBridge';
import { isVideoUrl } from './contextMenuUrls';
import {
  createContextMenuRuntimeState,
  type ContextMenuListenerDependencies
} from './contextMenusTypes';

const runtimeState = createContextMenuRuntimeState();

export function createContextMenuListenerDependencies(
  dependencies: ContextMenuListenerDependencies
): ContextMenuListenerDependencies {
  return dependencies;
}

export function registerContextMenuListeners(dependencies: ContextMenuListenerDependencies): void {
  const { action, contextMenus, runtime, tabs, optionsRepository } = dependencies;

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
    } catch (error) {
      console.error('[action] Failed to prepare clipFull:', error);
      return;
    }

    try {
      const response = await tabs.sendMessage<object | undefined>(tab.id, { action: 'clipFull' });
      const failureMessage = resolveContentActionFailureMessage(response);
      if (failureMessage) {
        await notifyActionDispatchFailure('clipFull', tab.id, null, new Error(failureMessage));
      }
    } catch (error) {
      await notifyActionDispatchFailure(
        'clipFull',
        tab.id,
        null,
        error instanceof Error ? error : new Error(String(error))
      );
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
      const requiresTopFrameRuntime = actionType === 'videoClipSelection';
      try {
        await injectClipper(dependencies, runtimeState, tab.id, {
          targetFrameId: 0,
          silent: !requiresTopFrameRuntime
        });
      } catch {
        if (requiresTopFrameRuntime) {
          return;
        }
      }
    }

    try {
      await injectClipper(dependencies, runtimeState, tab.id, { targetFrameId });
      await delay(waitMs);
    } catch {
      return;
    }

    try {
      const response = await tabs.sendMessage<object | undefined>(
        tab.id,
        { action: actionType, frameId: targetFrameId, tabId: tab.id },
        { frameId: targetFrameId }
      );
      const failureMessage = resolveContentActionFailureMessage(response);
      if (failureMessage) {
        await notifyActionDispatchFailure(
          actionType,
          tab.id,
          targetFrameId,
          new Error(failureMessage)
        );
      }
    } catch (error) {
      await notifyActionDispatchFailure(
        actionType,
        tab.id,
        targetFrameId,
        error instanceof Error ? error : new Error(String(error))
      );
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

  registerFrameSelectionBridge(dependencies);

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
