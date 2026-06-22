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
import { notifyClipFailure } from '../services/notifications';
import { contentErrors } from '../../shared/errors/contentErrors';

const runtimeState = createContextMenuRuntimeState();

function getObjectProperty(source: object, key: string): unknown {
  return (source as Record<string, unknown>)[key];
}

function resolveContentActionFailureMessage(response: object | undefined): string | null {
  if (!response || getObjectProperty(response, 'success') !== false) {
    return null;
  }
  const error = getObjectProperty(response, 'error');
  return typeof error === 'string' && error.trim().length > 0
    ? error
    : 'Content action reported failure';
}

export function createContextMenuListenerDependencies(
  dependencies: ContextMenuListenerDependencies
): ContextMenuListenerDependencies {
  return dependencies;
}

export function registerContextMenuListeners(dependencies: ContextMenuListenerDependencies): void {
  const { action, contextMenus, runtime, tabs, messaging, optionsRepository } = dependencies;

  const notifyActionDispatchFailure = async (
    actionType: string,
    tabId: number,
    frameId: number | null,
    error: Error
  ): Promise<void> => {
    console.error('[contextMenu] Failed to dispatch action to tab:', error);
    try {
      await notifyClipFailure(
        contentErrors.messagingFailed(
          actionType,
          {
            component: 'contextMenus',
            action: actionType,
            tabId,
            frameId
          },
          { cause: error }
        )
      );
    } catch (notifyError) {
      console.error('[contextMenu] Failed to notify action dispatch failure:', notifyError);
    }
  };

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

  messaging.addListener((rawMessage, sender) => {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return undefined;
    }
    const messageType = getObjectProperty(rawMessage, 'type');
    if (messageType !== 'AIIOB_FORWARD_VIDEO_SELECTION') {
      return undefined;
    }
    const messagePayload = getObjectProperty(rawMessage, 'payload');

    const tabId = sender.tabId;
    if (typeof tabId !== 'number') {
      return { success: false, error: 'NO_TAB' };
    }

    const rawPayload =
      typeof messagePayload === 'object' && messagePayload !== null ? messagePayload : {};
    const selectedHtml = getObjectProperty(rawPayload, 'selectedHtml');
    const selectedText = getObjectProperty(rawPayload, 'selectedText');
    const sourceUrl = getObjectProperty(rawPayload, 'sourceUrl');

    const payload = {
      selectedHtml: String(selectedHtml ?? ''),
      selectedText: String(selectedText ?? ''),
      sourceFrameId: sender.frameId ?? null,
      sourceUrl: typeof sourceUrl === 'string' ? sourceUrl : null
    };

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
