import { getMessages } from '@i18n';
import { getOptions } from '../store';
import { notifyInjectionFailure } from '../services/notifications';
import { PlatformError } from '../../platform/errors';
import type { ContextMenuListenerDependencies, ContextMenuRuntimeState } from './contextMenusTypes';

const CONTENT_SCRIPT_PATH = 'content/index.js';

type ContentRuntimeReadyResult =
  | { ready: true }
  | { ready: false; reason: string; message?: string };

type ContentRuntimeProbeInjectionResult = {
  result?: object | null;
};

type ContentRuntimeGlobal = typeof globalThis & {
  __AIIINOB_CONTENT_RUNTIME_PROMISE__?: PromiseLike<object>;
};

function waitForContentRuntimeReadyInPage():
  | Promise<ContentRuntimeReadyResult>
  | ContentRuntimeReadyResult {
  const timeoutMs = 3000;
  const promiseKey = '__AIIINOB_CONTENT_RUNTIME_PROMISE__';
  const hasReadyFlag = (): boolean =>
    document.documentElement?.dataset?.aiobContentRuntime === 'true';
  const runtimePromise =
    promiseKey === '__AIIINOB_CONTENT_RUNTIME_PROMISE__'
      ? (globalThis as ContentRuntimeGlobal).__AIIINOB_CONTENT_RUNTIME_PROMISE__
      : undefined;

  if (!runtimePromise || typeof runtimePromise.then !== 'function') {
    return {
      ready: false,
      reason: 'missing-runtime-promise'
    };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const clearReadyTimeout = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return Promise.race<ContentRuntimeReadyResult>([
    Promise.resolve(runtimePromise).then(
      () => {
        clearReadyTimeout();
        if (hasReadyFlag()) {
          return { ready: true };
        }
        return {
          ready: false,
          reason: 'runtime-ready-flag-missing'
        };
      },
      (error) => {
        clearReadyTimeout();
        return {
          ready: false,
          reason: 'runtime-import-rejected',
          message: error instanceof Error ? error.message : String(error)
        };
      }
    ),
    new Promise<ContentRuntimeReadyResult>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({
          ready: false,
          reason: 'runtime-ready-timeout'
        });
      }, timeoutMs);
    })
  ]);
}

function isContentRuntimeReadyResult(
  value: object | null | undefined
): value is ContentRuntimeReadyResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const ready = 'ready' in value ? value.ready : undefined;
  const reason = 'reason' in value ? value.reason : undefined;
  if (ready === true) {
    return true;
  }
  return ready === false && typeof reason === 'string';
}

function formatContentRuntimeReadyFailure(result: ContentRuntimeReadyResult | undefined): string {
  if (!result) {
    return 'content runtime readiness check returned no result';
  }
  if (result.ready) {
    return 'content runtime is ready';
  }
  return result.message ? `${result.reason}: ${result.message}` : result.reason;
}

async function ensureContentRuntimeReady(
  dependencies: ContextMenuListenerDependencies,
  target: chrome.scripting.InjectionTarget
): Promise<void> {
  const results = await dependencies.scripting.executeScript({
    target,
    world: 'ISOLATED',
    func: waitForContentRuntimeReadyInPage
  });

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(formatContentRuntimeReadyFailure(undefined));
  }

  const failures: Array<ContentRuntimeReadyResult | undefined> = [];
  for (const entry of results as ContentRuntimeProbeInjectionResult[]) {
    const result = entry.result;
    if (!isContentRuntimeReadyResult(result)) {
      failures.push(undefined);
      continue;
    }
    if (!result.ready) {
      failures.push(result);
    }
  }

  if (failures.length > 0) {
    throw new Error(formatContentRuntimeReadyFailure(failures[0]));
  }
}

export function isVideoUrl(url?: string | null): boolean {
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
      return (
        parsed.pathname.startsWith('/watch') ||
        parsed.pathname.startsWith('/shorts') ||
        parsed.pathname.startsWith('/embed/')
      );
    }
  } catch {
    return false;
  }
  return false;
}

export function isInjectableUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:'
    );
  } catch {
    return false;
  }
}

export async function resolveTabUrl(
  dependencies: ContextMenuListenerDependencies,
  tabId: number
): Promise<string | undefined> {
  try {
    const tab = await dependencies.tabs.get(tabId);
    return tab?.url ?? undefined;
  } catch {
    return undefined;
  }
}

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
