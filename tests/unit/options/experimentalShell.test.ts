/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const appSetMessagesMock = vi.hoisted(() => vi.fn());
const appRenderMock = vi.hoisted(() => vi.fn());
const appDestroyMock = vi.hoisted(() => vi.fn());
const appMountSectionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const appNavigateToMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const appPreloadSectionsMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const appConfigureUIMock = vi.hoisted(() => vi.fn());
const appGetMountedSectionMock = vi.hoisted(() => vi.fn((sectionId: string) => (sectionId === 'rest' ? { mounted: true } : null)));
const appForEachSectionMock = vi.hoisted(() => vi.fn((callback: (sectionId: string) => void) => {
  callback('rest');
  callback('yaml');
  callback('routing');
}));
type ShellStateUpdate = {
  options?: { restApi?: { vault?: string } };
  isInitialized?: boolean;
  usage?: unknown;
};
const stateManagerSetStateMock = vi.hoisted(() => vi.fn<[ShellStateUpdate], void>());
const stateManagerGetStateMock = vi.hoisted(() => vi.fn(() => ({})));
const createStateManagerMock = vi.hoisted(() =>
  vi.fn(() => ({ setState: stateManagerSetStateMock, getState: stateManagerGetStateMock }))
);
const getOptionsMessagesMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ extensionName: 'All in Obsidian' })));
const getCurrentLanguageMock = vi.hoisted(() => vi.fn(() => Promise.resolve('zh-CN')));
const optionsLoadMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ restApi: { vault: 'Main' } })));
const optionsSubscribeMock = vi.hoisted(() => vi.fn((listener: (value: unknown) => void) => {
  listener({ restApi: { vault: 'Subscribed' } });
  return vi.fn();
}));
const usageSubscribeMock = vi.hoisted(() => vi.fn((listener: (value: unknown) => void) => {
  listener({ totalClips: 3, total: 8 });
  return vi.fn();
}));
const syncWithStorageMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const stopSyncMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/options/components/layout/OptionsApp', () => ({
  OptionsApp: class OptionsAppMock {
    constructor() {}
    setMessages = appSetMessagesMock;
    render = appRenderMock;
    destroy = appDestroyMock;
    mountSection = appMountSectionMock;
    navigateTo = appNavigateToMock;
    preloadSections = appPreloadSectionsMock;
    configureUI = appConfigureUIMock;
    getMountedSection = appGetMountedSectionMock;
    forEachSection = appForEachSectionMock;
  }
}));

vi.mock('../../../src/options/state/StateManager', () => ({
  createOptionsStateManager: createStateManagerMock
}));

vi.mock('../../../src/options/app/i18nContext', () => ({
  getOptionsMessages: getOptionsMessagesMock
}));

vi.mock('../../../src/i18n', () => ({
  getCurrentLanguage: getCurrentLanguageMock
}));

vi.mock('../../../src/options/state/optionsStore', () => ({
  optionsStore: {
    load: optionsLoadMock,
    subscribe: optionsSubscribeMock
  }
}));

vi.mock('../../../src/shared/state', () => ({
  getGlobalStateManager: vi.fn(() => ({
    getStore: vi.fn(() => ({ get: vi.fn(() => ({ totalClips: 1 })), subscribe: usageSubscribeMock })),
    syncWithStorage: syncWithStorageMock,
    stopSync: stopSyncMock
  }))
}));

describe('mountExperimentalShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="optionsShellRoot" hidden></div>';
    const storage = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        }
      }
    });
    window.history.replaceState({}, '', '/options.html?optionsShell=1#section-rest');
    (window as typeof window & { aiobUsageStats?: unknown }).aiobUsageStats = {
      aiChatSaves: 1,
      fragmentSaves: 2,
      articleSaves: 2,
      total: 5,
      history: []
    };
  });

  afterEach(() => {
    vi.resetModules();
    document.body.className = '';
  });

  it('returns null when the shell is explicitly disabled by query flag', async () => {
    window.history.replaceState({}, '', '/options.html?optionsShell=0');
    const { mountExperimentalShell } = await import('../../../src/options/app/experimentalShell');

    const mounted = await mountExperimentalShell({} as never);

    expect(mounted).toBeNull();
    expect(window.localStorage.getItem('aiinob:options-shell-enabled')).toBe('0');
  });

  it('mounts the shell, binds options and usage state, and exposes runtime controls', async () => {
    const { mountExperimentalShell } = await import('../../../src/options/app/experimentalShell');

    const mounted = await mountExperimentalShell({} as never);

    expect(mounted).not.toBeNull();
    expect(getOptionsMessagesMock).toHaveBeenCalledTimes(1);
    expect(getCurrentLanguageMock).toHaveBeenCalledTimes(1);
    expect(appRenderMock).toHaveBeenCalledWith(expect.objectContaining({ initialSection: 'rest' }));
    expect(appMountSectionMock).toHaveBeenCalledWith('rest', true);
    expect(optionsLoadMock).toHaveBeenCalledTimes(1);
    const initialOptionsUpdate = stateManagerSetStateMock.mock.calls.find(([update]) => update.options !== undefined)?.[0];
    expect(initialOptionsUpdate?.options?.restApi?.vault).toBe('Main');
    expect(initialOptionsUpdate?.isInitialized).toBe(true);
    expect(document.getElementById('optionsShellRoot')?.hasAttribute('hidden')).toBe(false);
    expect(document.body.classList.contains('aobx-shell-active')).toBe(true);

    await mounted?.navigateTo('yaml');
    await mounted?.mountSection('routing', { activate: true });
    await mounted?.preloadSections(['usage', 'yaml']);
    mounted?.configureUI({ modalBindings: [] });

    expect(appNavigateToMock).toHaveBeenCalledWith('yaml');
    expect(appMountSectionMock).toHaveBeenCalledWith('routing', true);
    expect(appPreloadSectionsMock).toHaveBeenCalledWith(['usage', 'yaml']);
    expect(appConfigureUIMock).toHaveBeenCalledWith({ modalBindings: [] });
  });

  it('mountAllSections skips an already mounted initial section and cleanup tears everything down', async () => {
    const { mountExperimentalShell } = await import('../../../src/options/app/experimentalShell');

    const mounted = await mountExperimentalShell({} as never);
    await mounted?.mountAllSections();

    expect(appMountSectionMock).toHaveBeenCalledWith('yaml', false);
    expect(appMountSectionMock).toHaveBeenCalledWith('routing', false);
    expect(appMountSectionMock).not.toHaveBeenCalledWith('rest', false);

    mounted?.cleanup();

    expect(appDestroyMock).toHaveBeenCalledTimes(1);
    expect(stopSyncMock).toHaveBeenCalledWith('optionsShell.usageStats');
    expect(document.getElementById('optionsShellRoot')?.hasAttribute('hidden')).toBe(true);
    expect(document.body.classList.contains('aobx-shell-active')).toBe(false);
  });


  it('warns when options load fails and falls back to default usage when sync is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    optionsLoadMock.mockRejectedValueOnce(new Error('load failed'));
    syncWithStorageMock.mockResolvedValueOnce(false);

    const { mountExperimentalShell } = await import('../../../src/options/app/experimentalShell');
    const mounted = await mountExperimentalShell({} as never);

    expect(mounted).not.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[OptionsShell] 加载选项数据失败:', expect.any(Error));
    const hasDefaultUsageUpdate = stateManagerSetStateMock.mock.calls.some(([update]) => {
      const usage = update.usage;
      return Boolean(
        usage &&
          typeof usage === 'object' &&
          'fragmentSaves' in usage &&
          'articleSaves' in usage &&
          'aiChatSaves' in usage &&
          usage.fragmentSaves === 0 &&
          usage.articleSaves === 0 &&
          usage.aiChatSaves === 0
      );
    });
    expect(hasDefaultUsageUpdate).toBe(true);
    mounted?.cleanup();
    warnSpy.mockRestore();
  });

  it('returns null when shell container is missing', async () => {
    document.body.innerHTML = '';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { mountExperimentalShell } = await import('../../../src/options/app/experimentalShell');

    const mounted = await mountExperimentalShell({} as never);

    expect(mounted).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[OptionsShell] 未找到 optionsShellRoot 容器，将跳过实验性 UI 挂载。');
    warnSpy.mockRestore();
  });

});
