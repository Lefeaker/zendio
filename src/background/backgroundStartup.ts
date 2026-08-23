import type { ActionService } from '../platform/interfaces/actions';
import type { ContextMenusService } from '../platform/interfaces/contextMenus';
import type { MessageSenderInfo, MessagingService } from '../platform/interfaces/messaging';
import type { RuntimeService } from '../platform/interfaces/runtime';
import type { ScriptingService } from '../platform/interfaces/scripting';
import type { StorageService } from '../platform/interfaces/storage';
import type { TabsService } from '../platform/interfaces/tabs';
import { DI_TOKENS, resolveRepository } from '../shared/di';
import type { IOptionsRepository } from '../shared/repositories';
import {
  createContextMenuListenerDependencies,
  registerContextMenuListeners
} from './listeners/contextMenus';
import {
  createRuntimeMessageListenerDependencies,
  registerRuntimeMessageListener
} from './listeners/runtimeMessages';
import type { SessionDraftRuntimeDependencies } from './listeners/sessionDraftMessages';
import { createSessionDraftOwnerLivenessProbe } from './services/sessionDraftOwnerLivenessProbe';
import { createSessionDraftStore, type SessionDraftStore } from './services/sessionDraftStore';
import { ensureUsageStatsInitialized } from './services/usageStats';
import { bootstrapBackgroundDependencies, configureBackgroundDependencyStorage } from './bootstrap';
import { SessionDraftTrustedOwnerContextSchema } from '../shared/sessionDrafts';

export interface BackgroundStartupDependencies {
  action: ActionService;
  contextMenus: ContextMenusService;
  messaging: MessagingService;
  runtime: RuntimeService;
  scripting: ScriptingService;
  storage: StorageService;
  tabs: TabsService;
}

function unavailableSessionDraftStore(code: string): SessionDraftStore {
  const reject = () => Promise.reject(new Error(code));
  return {
    readExact: reject,
    save: reject,
    finalizeExact: reject,
    removeExact: reject,
    renewLease: reject,
    releaseLease: reject,
    migrateLegacyVideoCapture: reject,
    prune: reject,
    list: reject,
    selectAndClaim: reject
  } as SessionDraftStore;
}

function createSessionDraftRuntimeDependencies(
  dependencies: Pick<BackgroundStartupDependencies, 'storage' | 'tabs'>
): SessionDraftRuntimeDependencies {
  const created = createSessionDraftStore(dependencies.storage.local, {
    ownerLivenessProbe: createSessionDraftOwnerLivenessProbe(dependencies.tabs)
  });
  return {
    sessionDraftStore: created.ok ? created.store : unavailableSessionDraftStore(created.code),
    resolveSessionDraftOwner: (sender) => resolveSessionDraftOwner(dependencies.tabs, sender)
  };
}

async function resolveSessionDraftOwner(tabs: Pick<TabsService, 'get'>, sender: MessageSenderInfo) {
  if (
    typeof sender.tabId !== 'number' ||
    !Number.isInteger(sender.tabId) ||
    sender.tabId < 0 ||
    typeof sender.frameId !== 'number' ||
    !Number.isInteger(sender.frameId) ||
    sender.frameId < 0
  )
    return null;
  try {
    const tab = await tabs.get(sender.tabId);
    if (!tab) return null;
    const parsed = SessionDraftTrustedOwnerContextSchema.safeParse({
      tabId: sender.tabId,
      frameId: sender.frameId,
      ...(typeof tab.windowId === 'number' ? { windowId: tab.windowId } : {})
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function startBackgroundRuntime(dependencies: BackgroundStartupDependencies): void {
  configureBackgroundDependencyStorage(dependencies.storage);
  bootstrapBackgroundDependencies();
  const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);

  registerContextMenuListeners(
    createContextMenuListenerDependencies({
      action: dependencies.action,
      contextMenus: dependencies.contextMenus,
      runtime: dependencies.runtime,
      tabs: dependencies.tabs,
      scripting: dependencies.scripting,
      messaging: dependencies.messaging,
      optionsRepository
    })
  );

  registerRuntimeMessageListener(
    createRuntimeMessageListenerDependencies(
      dependencies.messaging,
      dependencies.tabs,
      dependencies.runtime,
      dependencies.storage,
      createSessionDraftRuntimeDependencies(dependencies)
    )
  );

  void ensureUsageStatsInitialized().catch((error) => {
    console.error('[background] Failed to initialize usage stats storage:', error);
  });
}
