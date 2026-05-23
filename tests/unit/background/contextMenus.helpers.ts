import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { ActionClickListener } from '../../../src/platform/interfaces/actions';
import type {
  ContextMenuOnClickListener,
  ContextMenuOnShownListener,
  ContextMenusService
} from '../../../src/platform/interfaces/contextMenus';
import type { MessageListener } from '../../../src/platform/interfaces/messaging';
import type {
  RuntimeInstallListener,
  RuntimeStartupListener,
  RuntimeService
} from '../../../src/platform/interfaces/runtime';
import type { ScriptingService } from '../../../src/platform/interfaces/scripting';
import type {
  TabActivatedListener,
  TabRemovedListener,
  TabUpdatedListener,
  TabsService
} from '../../../src/platform/interfaces/tabs';

const createMockFn = <T extends (...args: any[]) => any>() => vi.fn<Parameters<T>, ReturnType<T>>();
type ContextMenusModule = typeof import('../../../src/background/listeners/contextMenus');
type RegisterContextMenus = () => void;

export type ContextMenusTestRig = {
  create: ReturnType<typeof createMockFn<ContextMenusService['create']>>;
  update: ReturnType<typeof createMockFn<ContextMenusService['update']>>;
  removeAll: ReturnType<typeof createMockFn<ContextMenusService['removeAll']>>;
  refresh: ReturnType<typeof vi.fn<[], void>>;
  onClickedListeners: ContextMenuOnClickListener[];
  onShownListeners: ContextMenuOnShownListener[];
  onInstalledListeners: RuntimeInstallListener[];
  onStartupListeners: RuntimeStartupListener[];
  actionListeners: ActionClickListener[];
  messagingListeners: MessageListener[];
  query: ReturnType<typeof createMockFn<TabsService['query']>>;
  get: ReturnType<typeof createMockFn<TabsService['get']>>;
  sendMessage: ReturnType<typeof createMockFn<TabsService['sendMessage']>>;
  executeScript: ReturnType<typeof createMockFn<ScriptingService['executeScript']>>;
  notifyInjectionFailure: Mock<[], Promise<void>>;
  getOptions: Mock<
    [],
    Promise<{
      fragmentClipper: { selectionModifierEnabled: boolean; selectionModifierKeys: string[] };
    }>
  >;
  optionSubscribers: Array<() => void>;
  onActivatedListeners: TabActivatedListener[];
  onUpdatedListeners: TabUpdatedListener[];
  onRemovedListeners: TabRemovedListener[];
};

export async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

export async function loadModule(
  rigOverrides?: Partial<Record<keyof ContextMenusTestRig, unknown>>
): Promise<{ mod: ContextMenusModule; rig: ContextMenusTestRig; register: RegisterContextMenus }> {
  vi.resetModules();

  const rig: ContextMenusTestRig = {
    create: createMockFn<ContextMenusService['create']>().mockImplementation(
      async ({ id }) => id ?? 1
    ),
    update: createMockFn<ContextMenusService['update']>().mockResolvedValue(undefined),
    removeAll: createMockFn<ContextMenusService['removeAll']>().mockResolvedValue(undefined),
    refresh: vi.fn<[], void>(),
    onClickedListeners: [],
    onShownListeners: [],
    onInstalledListeners: [],
    onStartupListeners: [],
    actionListeners: [],
    messagingListeners: [],
    query: createMockFn<TabsService['query']>().mockResolvedValue([]),
    get: createMockFn<TabsService['get']>().mockImplementation(
      async (tabId: number) => ({ id: tabId, url: 'https://example.com/page' }) as chrome.tabs.Tab
    ),
    sendMessage: createMockFn<TabsService['sendMessage']>().mockResolvedValue(undefined),
    executeScript: createMockFn<ScriptingService['executeScript']>().mockResolvedValue(undefined),
    notifyInjectionFailure: vi.fn<[], Promise<void>>(() => Promise.resolve()),
    getOptions: vi.fn<
      [],
      Promise<{
        fragmentClipper: { selectionModifierEnabled: boolean; selectionModifierKeys: string[] };
      }>
    >(() =>
      Promise.resolve({
        fragmentClipper: {
          selectionModifierEnabled: true,
          selectionModifierKeys: ['alt']
        }
      })
    ),
    optionSubscribers: [],
    onActivatedListeners: [],
    onUpdatedListeners: [],
    onRemovedListeners: [],
    ...(rigOverrides as Partial<ContextMenusTestRig> | undefined)
  };

  vi.doMock('../../../src/i18n', () => ({
    getMessages: vi.fn(() =>
      Promise.resolve({
        clipSelection: 'Clip selection',
        clipSelectionVideo: 'Clip to video capture panel',
        clipFullPage: 'Clip full page',
        contextMenuVideoMode: 'Enter video capture mode'
      })
    )
  }));

  vi.doMock('../../../src/background/store', () => ({
    getOptions: rig.getOptions
  }));

  vi.doMock('../../../src/background/services/notifications', () => ({
    notifyInjectionFailure: rig.notifyInjectionFailure
  }));

  const mod = await import('../../../src/background/listeners/contextMenus');
  const register = () =>
    mod.registerContextMenuListeners({
      action: {
        onClicked: (listener: ActionClickListener) => {
          rig.actionListeners.push(listener);
          return () => undefined;
        }
      },
      contextMenus: {
        create: rig.create,
        update: rig.update,
        removeAll: rig.removeAll,
        refresh: rig.refresh,
        onClicked: (listener: ContextMenuOnClickListener) => {
          rig.onClickedListeners.push(listener);
          return () => undefined;
        },
        onShown: (listener: ContextMenuOnShownListener) => {
          rig.onShownListeners.push(listener);
          return () => undefined;
        }
      },
      runtime: {
        onInstalled: (listener: RuntimeInstallListener) => {
          rig.onInstalledListeners.push(listener);
          return () => undefined;
        },
        onStartup: (listener: RuntimeStartupListener) => {
          rig.onStartupListeners.push(listener);
          return () => undefined;
        }
      },
      tabs: {
        query: rig.query,
        get: rig.get,
        sendMessage: rig.sendMessage as TabsService['sendMessage'],
        onActivated: (listener: TabActivatedListener) => {
          rig.onActivatedListeners.push(listener);
          return () => undefined;
        },
        onUpdated: (listener: TabUpdatedListener) => {
          rig.onUpdatedListeners.push(listener);
          return () => undefined;
        },
        onRemoved: (listener: TabRemovedListener) => {
          rig.onRemovedListeners.push(listener);
          return () => undefined;
        }
      },
      scripting: {
        executeScript: rig.executeScript
      },
      messaging: {
        addListener: (listener: MessageListener) => {
          rig.messagingListeners.push(listener);
          return () => undefined;
        }
      },
      optionsRepository: {
        onChange: vi.fn((listener: () => void) => {
          rig.optionSubscribers.push(listener);
          return () => undefined;
        })
      }
    });
  return { mod, rig, register };
}
