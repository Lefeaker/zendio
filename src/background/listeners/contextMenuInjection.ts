import { getOptions } from '../store';
import { notifyInjectionFailure } from '../services/notifications';
import type { ContextMenuListenerDependencies, ContextMenuRuntimeState } from './contextMenusTypes';
import { ensureContentRuntimeReady } from './contextMenuRuntimeReadiness';
import { isInjectableUrl, isVideoUrl, resolveTabUrl } from './contextMenuUrls';
import { isSelectionTriggerConfigured } from '../../shared/config/selectionTriggerMode';

const CONTENT_SCRIPT_PATH = 'content/index.js';
const SELECTION_SCRIPT_ID = 'zendio-selection-trigger';
const SCRIPT_MATCHES = ['http://*/*', 'https://*/*'];
type InjectionOwner = { revision: number; pending: Promise<void> };
const injectionOwners = new WeakMap<ContextMenuRuntimeState, InjectionOwner>();

export async function refreshSelectionTriggerInjection(
  state: ContextMenuRuntimeState,
  scripting?: ContextMenuListenerDependencies['scripting']
): Promise<void> {
  let owner = injectionOwners.get(state);
  if (!owner) {
    owner = { revision: 0, pending: Promise.resolve() };
    injectionOwners.set(state, owner);
  }
  const revision = ++owner.revision;
  let enabled = false;
  try {
    const options = await getOptions();
    const fragment = options.fragmentClipper;
    const rawKeys = fragment?.selectionModifierKeys;
    const modifierKeys = Array.isArray(rawKeys) ? rawKeys : [];
    enabled = Boolean(
      fragment &&
      isSelectionTriggerConfigured({
        selectionTriggerMode: fragment.selectionTriggerMode,
        selectionModifierKeys: modifierKeys
      })
    );
  } catch (error) {
    console.warn('[contextMenus] Failed to resolve selection trigger options:', error);
  }
  if (revision !== owner.revision) return;
  state.selectionTriggerInjectionEnabled = enabled;
  await syncDocumentReadyScript(scripting, enabled, owner, revision).catch((error) => {
    console.warn('[contextMenus] Failed to configure document-ready selection injection:', error);
  });
}

function syncDocumentReadyScript(
  scripting: ContextMenuListenerDependencies['scripting'] | undefined,
  enabled: boolean,
  owner: InjectionOwner,
  revision: number
): Promise<void> {
  const get = scripting?.getRegisteredContentScripts;
  const register = scripting?.registerContentScripts;
  const unregister = scripting?.unregisterContentScripts;
  if (!get || !register || !unregister) return Promise.resolve();
  const work = owner.pending
    .catch(() => undefined)
    .then(async () => {
      if (revision !== owner.revision) return;
      const [existing] = await get({ ids: [SELECTION_SCRIPT_ID] });
      if (revision !== owner.revision) return;
      const matches =
        existing?.runAt === 'document_end' &&
        existing.allFrames === true &&
        existing.persistAcrossSessions === true &&
        existing.js?.length === 1 &&
        existing.js[0] === CONTENT_SCRIPT_PATH &&
        existing.matches?.length === SCRIPT_MATCHES.length &&
        SCRIPT_MATCHES.every((match) => existing.matches?.includes(match));
      if (enabled && matches) return;
      if (existing) await unregister({ ids: [SELECTION_SCRIPT_ID] });
      if (enabled && revision === owner.revision) {
        await register([
          {
            id: SELECTION_SCRIPT_ID,
            js: [CONTENT_SCRIPT_PATH],
            matches: SCRIPT_MATCHES,
            runAt: 'document_end',
            allFrames: true,
            persistAcrossSessions: true
          }
        ]);
      }
    });
  owner.pending = work;
  return work;
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
    if (message.includes('CONTENT_RUNTIME_RELOAD_REQUIRED')) state.autoInjectedTabs.add(tabId);
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

  if (!shouldInject && state.selectionTriggerInjectionEnabled) {
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

export async function ensureSelectionTriggerInjectionForActiveTab(
  dependencies: ContextMenuListenerDependencies,
  state: ContextMenuRuntimeState
): Promise<void> {
  if (!state.selectionTriggerInjectionEnabled) {
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
    console.warn(
      '[contextMenus] Failed to ensure selection trigger injection for active tab:',
      error
    );
  }
}
