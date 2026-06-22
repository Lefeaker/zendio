import { getOptions } from '../store';
import { notifyInjectionFailure } from '../services/notifications';
import type { ContextMenuListenerDependencies, ContextMenuRuntimeState } from './contextMenusTypes';
import { ensureContentRuntimeReady } from './contextMenuRuntimeReadiness';
import { isInjectableUrl, isVideoUrl, resolveTabUrl } from './contextMenuUrls';

const CONTENT_SCRIPT_PATH = 'content/index.js';

export async function refreshSelectionModifierInjection(
  state: ContextMenuRuntimeState
): Promise<void> {
  try {
    const options = await getOptions();
    const fragment = options.fragmentClipper;
    const rawKeys = fragment?.selectionModifierKeys;
    const modifierKeys = Array.isArray(rawKeys) ? rawKeys : [];
    state.selectionModifierInjectionEnabled = Boolean(
      fragment?.selectionModifierEnabled && modifierKeys.length > 0
    );
  } catch (error) {
    console.warn('[contextMenus] Failed to resolve selection modifier options:', error);
    state.selectionModifierInjectionEnabled = false;
  }
}

export async function injectClipper(
  dependencies: ContextMenuListenerDependencies,
  state: ContextMenuRuntimeState,
  tabId: number,
  options?: { silent?: boolean; targetFrameId?: number; allFrames?: boolean }
): Promise<void> {
  try {
    const target = options?.allFrames
      ? { tabId, allFrames: true }
      : options?.targetFrameId !== undefined
        ? { tabId, frameIds: [options.targetFrameId] }
        : { tabId };
    await dependencies.scripting.executeScript({
      target,
      files: [CONTENT_SCRIPT_PATH],
      world: 'ISOLATED'
    });
    await ensureContentRuntimeReady(dependencies, target);
    state.autoInjectedTabs.add(tabId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[contextMenu] Failed to inject content script:', error);
    if (!options?.silent) {
      await notifyInjectionFailure(message);
    }
    throw error;
  }
}

export async function autoInjectIfNeeded(
  dependencies: ContextMenuListenerDependencies,
  state: ContextMenuRuntimeState,
  tabId: number,
  url?: string | null
): Promise<void> {
  if (state.autoInjectedTabs.has(tabId)) {
    return;
  }
  const candidateUrl = typeof url === 'string' ? url : undefined;
  const videoCandidate = isVideoUrl(candidateUrl);
  let shouldInject = videoCandidate;
  let resolvedUrl = candidateUrl;

  if (!shouldInject && state.selectionModifierInjectionEnabled) {
    if (!resolvedUrl) {
      resolvedUrl = await resolveTabUrl(dependencies, tabId);
    }
    shouldInject = isInjectableUrl(resolvedUrl);
  }

  if (!shouldInject || state.autoInjectedTabs.has(tabId)) {
    return;
  }

  try {
    await injectClipper(dependencies, state, tabId, { silent: true, allFrames: true });
  } catch {
    // Silent auto-injection failures are ignored; user actions will surface errors.
  }
}

export async function ensureModifierInjectionForActiveTab(
  dependencies: ContextMenuListenerDependencies,
  state: ContextMenuRuntimeState
): Promise<void> {
  if (!state.selectionModifierInjectionEnabled) {
    return;
  }
  try {
    const activeTabs = await dependencies.tabs.query({ active: true, currentWindow: true });
    for (const tab of activeTabs) {
      if (tab?.id !== undefined) {
        void autoInjectIfNeeded(dependencies, state, tab.id, tab.url ?? undefined);
      }
    }
  } catch (error) {
    console.warn('[contextMenus] Failed to ensure modifier injection for active tab:', error);
  }
}
