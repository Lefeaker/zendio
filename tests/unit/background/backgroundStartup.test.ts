import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundStartupDependencies } from '../../../src/background/backgroundStartup';
import type { createContextMenuListenerDependencies } from '../../../src/background/listeners/contextMenus';
import type { createRuntimeMessageListenerDependencies } from '../../../src/background/listeners/runtimeMessages';
import { asType } from '../../utils/typeHelpers';

type ContextMenuDependencyArgs = Parameters<typeof createContextMenuListenerDependencies>;
type RuntimeMessageDependencyArgs = Parameters<typeof createRuntimeMessageListenerDependencies>;

const configureBackgroundDependencyStorageMock = vi.hoisted(() => vi.fn());
const bootstrapBackgroundDependenciesMock = vi.hoisted(() => vi.fn());
const createContextMenuListenerDependenciesMock = vi.hoisted(() =>
  vi.fn<(...args: ContextMenuDependencyArgs) => ContextMenuDependencyArgs[0]>((deps) => deps)
);
const registerContextMenuListenersMock = vi.hoisted(() => vi.fn());
const createRuntimeMessageListenerDependenciesMock = vi.hoisted(() =>
  vi.fn<(...args: RuntimeMessageDependencyArgs) => RuntimeMessageDependencyArgs>((...args) => args)
);
const registerRuntimeMessageListenerMock = vi.hoisted(() => vi.fn());
const ensureUsageStatsInitializedMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const resolveRepositoryMock = vi.hoisted(() => vi.fn(() => ({ onChange: vi.fn() })));

vi.mock('../../../src/background/bootstrap', () => ({
  configureBackgroundDependencyStorage: configureBackgroundDependencyStorageMock,
  bootstrapBackgroundDependencies: bootstrapBackgroundDependenciesMock
}));
vi.mock('../../../src/background/listeners/contextMenus', () => ({
  createContextMenuListenerDependencies: createContextMenuListenerDependenciesMock,
  registerContextMenuListeners: registerContextMenuListenersMock
}));
vi.mock('../../../src/background/listeners/runtimeMessages', () => ({
  createRuntimeMessageListenerDependencies: createRuntimeMessageListenerDependenciesMock,
  registerRuntimeMessageListener: registerRuntimeMessageListenerMock
}));
vi.mock('../../../src/background/services/usageStats', () => ({
  ensureUsageStatsInitialized: ensureUsageStatsInitializedMock
}));
vi.mock('../../../src/shared/di', () => ({
  DI_TOKENS: { IOptionsRepository: Symbol('IOptionsRepository') },
  resolveRepository: resolveRepositoryMock
}));

function createDependencies(): BackgroundStartupDependencies {
  return {
    action: { onClicked: vi.fn() },
    contextMenus: {
      create: vi.fn(),
      update: vi.fn(),
      removeAll: vi.fn(),
      onClicked: vi.fn(),
      onShown: vi.fn()
    },
    messaging: { addListener: vi.fn(), send: vi.fn(), sendToTab: vi.fn() },
    runtime: {
      onInstalled: vi.fn(),
      onStartup: vi.fn(),
      getURL: vi.fn(),
      getBrowserTarget: vi.fn<() => 'chrome'>(() => 'chrome'),
      openOptionsPage: vi.fn()
    },
    scripting: { executeScript: vi.fn() },
    storage: asType<BackgroundStartupDependencies['storage']>({ sync: {}, local: {} }),
    tabs: {
      query: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      sendMessage: vi.fn(),
      onActivated: vi.fn(),
      onUpdated: vi.fn(),
      onRemoved: vi.fn(),
      remove: vi.fn(),
      getCurrent: vi.fn()
    }
  };
}

describe('backgroundStartup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('bootstraps background runtime and registers listeners', async () => {
    const { startBackgroundRuntime } = await import('../../../src/background/backgroundStartup');
    const deps = createDependencies();

    startBackgroundRuntime(deps);

    expect(configureBackgroundDependencyStorageMock).toHaveBeenCalledWith(deps.storage);
    expect(bootstrapBackgroundDependenciesMock).toHaveBeenCalledTimes(1);
    expect(resolveRepositoryMock).toHaveBeenCalledTimes(1);
    expect(createContextMenuListenerDependenciesMock.mock.calls[0]?.[0].optionsRepository).toEqual(
      expect.any(Object)
    );
    expect(registerContextMenuListenersMock).toHaveBeenCalledTimes(1);
    const runtimeArgs = createRuntimeMessageListenerDependenciesMock.mock.calls[0];
    expect(runtimeArgs?.slice(0, 4)).toEqual([
      deps.messaging,
      deps.tabs,
      deps.runtime,
      deps.storage
    ]);
    expect(runtimeArgs?.[4].sessionDraftStore).toEqual(expect.any(Object));
    expect(typeof runtimeArgs?.[4].resolveSessionDraftOwner).toBe('function');
    expect(registerRuntimeMessageListenerMock).toHaveBeenCalledTimes(1);
    expect(ensureUsageStatsInitializedMock).toHaveBeenCalledTimes(1);
  });

  it('uses the trusted sender snapshot when the tab closes before owner resolution', async () => {
    const { startBackgroundRuntime } = await import('../../../src/background/backgroundStartup');
    const deps = createDependencies();
    startBackgroundRuntime(deps);

    const runtimeArgs = createRuntimeMessageListenerDependenciesMock.mock.calls[0];
    const resolveSessionDraftOwner = runtimeArgs?.[4].resolveSessionDraftOwner;
    if (!resolveSessionDraftOwner) throw new Error('expected session-draft owner resolver');
    const getTab = vi.mocked(deps.tabs.get);
    getTab.mockRejectedValue(new Error('tab already closed'));

    await expect(
      resolveSessionDraftOwner({ tabId: 17, windowId: 23, frameId: 0 })
    ).resolves.toEqual({ tabId: 17, windowId: 23, frameId: 0 });
    expect(getTab).not.toHaveBeenCalled();

    getTab.mockResolvedValue(asType<chrome.tabs.Tab>({ id: 17, windowId: 29 }));
    await expect(resolveSessionDraftOwner({ tabId: 17, frameId: 0 })).resolves.toEqual({
      tabId: 17,
      windowId: 29,
      frameId: 0
    });
    expect(getTab).toHaveBeenCalledWith(17);
  });
});
