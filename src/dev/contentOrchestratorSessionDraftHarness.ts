import { handleSessionDraftMessage } from '../background/listeners/sessionDraftMessages';
import { createSessionDraftStore } from '../background/services/sessionDraftStore';
import {
  SESSION_DRAFT_OWNER_CONTEXT_ACTIVE_MESSAGE_TYPE,
  SESSION_DRAFT_TAB_CONTEXT_MESSAGE_TYPE,
  configureSessionDraftRuntimeMessenger
} from '../content/sessionDrafts/sessionDraftTabContext';
import type { RuntimeMessageSender } from '../platform/interfaces/runtime';
import type { EnumerableStorageAreaService, StorageService } from '../platform/interfaces/storage';
import { normalizeSessionDraftStoredValue } from '../shared/sessionDrafts';

function createStorageArea(): EnumerableStorageAreaService {
  const values = new Map<string, Parameters<EnumerableStorageAreaService['set']>[1]>();
  return {
    get<T>(key: string): Promise<T | undefined> {
      return Promise.resolve(values.get(key) as T | undefined);
    },
    set<T>(key: string, value: T): Promise<void> {
      return Promise.resolve(void values.set(key, value));
    },
    getMany<T>(keys: string[]): Promise<Record<string, T | undefined>> {
      return Promise.resolve(
        Object.fromEntries(keys.map((key) => [key, values.get(key) as T | undefined]))
      );
    },
    getAll(): Promise<Record<string, unknown>> {
      return Promise.resolve(Object.fromEntries(values));
    },
    setMany<T>(entries: Record<string, T>): Promise<void> {
      return Promise.resolve(
        void Object.entries(entries).forEach(([key, value]) => values.set(key, value))
      );
    },
    remove(key: string | string[]): Promise<void> {
      return Promise.resolve(
        void (Array.isArray(key) ? key : [key]).forEach((item) => values.delete(item))
      );
    },
    clear(): Promise<void> {
      return Promise.resolve(values.clear());
    },
    watchKey: () => () => undefined,
    watchAll: () => () => undefined
  };
}

export function createContentOrchestratorHarnessStorage(): StorageService {
  const local = createStorageArea();
  const storage: StorageService = {
    local,
    sync: createStorageArea(),
    session: createStorageArea()
  };
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    const runtimeMessenger: RuntimeMessageSender = <Result>(
      message: Parameters<RuntimeMessageSender>[0]
    ) => chrome.runtime.sendMessage(message) as Promise<Result>;
    configureSessionDraftRuntimeMessenger(runtimeMessenger);
    return storage;
  }
  const sessionDraftStore = createSessionDraftStore(local, {
    ownerLivenessProbe: () => Promise.resolve('active'),
    createLeaseId: () => 'content-orchestrator-harness'
  });
  if (!sessionDraftStore.ok) throw new Error(sessionDraftStore.code);
  const runtimeMessenger: RuntimeMessageSender = async <Result>(
    message: Parameters<RuntimeMessageSender>[0]
  ) => {
    if (message && typeof message === 'object' && 'type' in message) {
      if (message.type === SESSION_DRAFT_TAB_CONTEXT_MESSAGE_TYPE) {
        return { success: true, tabId: 1, windowId: 1, frameId: 0 } as Result;
      }
      if (message.type === SESSION_DRAFT_OWNER_CONTEXT_ACTIVE_MESSAGE_TYPE) {
        return { success: true, active: true } as Result;
      }
    }
    return (await handleSessionDraftMessage(
      sessionDraftStore.store,
      normalizeSessionDraftStoredValue(message),
      { tabId: 1, frameId: 0 }
    )) as Result;
  };
  configureSessionDraftRuntimeMessenger(runtimeMessenger);
  return storage;
}
