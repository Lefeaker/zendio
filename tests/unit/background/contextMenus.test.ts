import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { PlatformError } from '../../../src/platform/errors';
import type { ActionClickListener } from '../../../src/platform/interfaces/actions';
import type { ContextMenuOnClickListener, ContextMenuOnShownListener, ContextMenusService } from '../../../src/platform/interfaces/contextMenus';
import type { MessageListener } from '../../../src/platform/interfaces/messaging';
import type { RuntimeInstallListener, RuntimeStartupListener, RuntimeService } from '../../../src/platform/interfaces/runtime';
import type { ScriptingService } from '../../../src/platform/interfaces/scripting';
import type { TabActivatedListener, TabRemovedListener, TabUpdatedListener, TabsService } from '../../../src/platform/interfaces/tabs';

const createMockFn = <T extends (...args: any[]) => any>() => vi.fn<Parameters<T>, ReturnType<T>>();
type ContextMenusModule = typeof import('../../../src/background/listeners/contextMenus');
type RegisterContextMenus = () => void;

type ContextMenusTestRig = {
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
  getOptions: Mock<[], Promise<{ fragmentClipper: { selectionModifierEnabled: boolean; selectionModifierKeys: string[] } }>>;
  optionSubscribers: Array<() => void>;
  onActivatedListeners: TabActivatedListener[];
  onUpdatedListeners: TabUpdatedListener[];
  onRemovedListeners: TabRemovedListener[];
};

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

async function loadModule(
  rigOverrides?: Partial<Record<keyof ContextMenusTestRig, unknown>>
): Promise<{ mod: ContextMenusModule; rig: ContextMenusTestRig; register: RegisterContextMenus }> {
  vi.resetModules();

  const rig: ContextMenusTestRig = {
    create: createMockFn<ContextMenusService['create']>().mockImplementation(async ({ id }) => id ?? 1),
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
    get: createMockFn<TabsService['get']>().mockImplementation(async (tabId: number) => ({ id: tabId, url: 'https://example.com/page' } as chrome.tabs.Tab)),
    sendMessage: createMockFn<TabsService['sendMessage']>().mockResolvedValue(undefined),
    executeScript: createMockFn<ScriptingService['executeScript']>().mockResolvedValue(undefined),
    notifyInjectionFailure: vi.fn<[], Promise<void>>(() => Promise.resolve()),
    getOptions: vi.fn<
      [],
      Promise<{ fragmentClipper: { selectionModifierEnabled: boolean; selectionModifierKeys: string[] } }>
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
    getMessages: vi.fn(() => Promise.resolve({
      clipSelection: 'Clip selection',
      clipSelectionVideo: 'Clip to video capture panel',
      clipFullPage: 'Clip full page',
      contextMenuVideoMode: 'Enter video capture mode'
    }))
  }));

  vi.doMock('../../../src/background/store', () => ({
    getOptions: rig.getOptions
  }));

  vi.doMock('../../../src/background/services/notifications', () => ({
    notifyInjectionFailure: rig.notifyInjectionFailure
  }));

  const mod = await import('../../../src/background/listeners/contextMenus');
  const register = () => mod.registerContextMenuListeners({
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

describe('context menu listeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('creates menus on registration and refreshes shown titles for video tabs', async () => {
    const { rig, register } = await loadModule({
      query: vi.fn(() => Promise.resolve([{ id: 7, url: 'https://www.bilibili.com/video/BV1xx411c7mD' }]))
    });

    register();
    await flush();
    await flush();

    expect(rig.create).toHaveBeenCalledTimes(3);
    expect(rig.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'clip-selection' }));

    await rig.onShownListeners[0]?.(
      { menuItemId: 'clip-selection', selectionText: ' selected ', pageUrl: 'https://www.bilibili.com/video/BV1xx411c7mD' } as chrome.contextMenus.OnClickData,
      { id: 7, url: 'https://www.bilibili.com/video/BV1xx411c7mD' } as chrome.tabs.Tab
    );

    expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip to video capture panel' });
    expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Enter video capture mode' });
    expect(rig.refresh).toHaveBeenCalled();
  });

  it('injects clipper and dispatches video selection action for frame selection clicks', async () => {
    vi.useFakeTimers();
    const { rig, register } = await loadModule();
    register();
    await Promise.resolve();

    const clickPromise = rig.onClickedListeners[0]?.(
      { menuItemId: 'clip-selection', frameId: 4, pageUrl: 'https://www.bilibili.com/video/BV1xx411c7mD' } as chrome.contextMenus.OnClickData,
      { id: 9, url: 'https://www.bilibili.com/video/BV1xx411c7mD' } as chrome.tabs.Tab
    );

    await vi.advanceTimersByTimeAsync(120);
    await clickPromise;

    expect(rig.executeScript).toHaveBeenNthCalledWith(1, expect.objectContaining({ target: { tabId: 9, frameIds: [0] }, files: ['content/index.js'] }));
    expect(rig.executeScript).toHaveBeenNthCalledWith(2, expect.objectContaining({ target: { tabId: 9, frameIds: [4] }, files: ['content/index.js'] }));
    expect(rig.sendMessage).toHaveBeenCalledWith(9, { action: 'videoClipSelection', frameId: 4, tabId: 9 }, { frameId: 4 });
  });

  it('continues setup when removeAll reports chrome unavailable and forwards frame selection messages', async () => {
    const { rig, register } = await loadModule({
      removeAll: vi.fn(() => Promise.reject(new Error('offline'))),
      sendMessage: vi.fn(() => Promise.resolve(undefined))
    });

    register();
    await flush();

    const response = await rig.messagingListeners[0]?.(
      {
        type: 'AIIOB_FORWARD_VIDEO_SELECTION',
        payload: {
          selectedHtml: '<p>hello</p>',
          selectedText: 'hello',
          sourceUrl: 'https://frame.example'
        }
      },
      { tabId: 11, frameId: 5 }
    );

    expect(rig.sendMessage).toHaveBeenCalledWith(11, {
      action: 'videoClipSelectionFromFrame',
      payload: {
        selectedHtml: '<p>hello</p>',
        selectedText: 'hello',
        sourceFrameId: 5,
        sourceUrl: 'https://frame.example'
      }
    }, { frameId: 0 });
    expect(response).toEqual({ success: true });
  });



});

it('keeps default menu titles for non-video pages and returns NO_TAB for frame forwarding without sender tab', async () => {
  const { rig, register } = await loadModule({
    query: vi.fn(() => Promise.resolve([{ id: 3, url: 'https://example.com/article' }]))
  });

  register();
  await flush();
  await rig.onShownListeners[0]?.(
    { menuItemId: 'clip-selection', selectionText: '', pageUrl: 'https://example.com/article' } as chrome.contextMenus.OnClickData,
    { id: 3, url: 'https://example.com/article' } as chrome.tabs.Tab
  );

  expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip selection' });
  expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Clip full page' });

  const response = await rig.messagingListeners[0]?.({ type: 'AIIOB_FORWARD_VIDEO_SELECTION', payload: {} }, { frameId: 2 });
  expect(response).toEqual({ success: false, error: 'NO_TAB' });



});


it('ignores unknown menu ids and swallows tab dispatch failures for regular page clicks', async () => {
  vi.useFakeTimers();
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { rig, register } = await loadModule({
    sendMessage: vi.fn(() => Promise.reject(new Error('dispatch failed')))
  });

  register();
  await flush();

  await rig.onClickedListeners[0]?.(
    { menuItemId: 'unknown-item', pageUrl: 'https://example.com/article' } as chrome.contextMenus.OnClickData,
    { id: 21, url: 'https://example.com/article' } as chrome.tabs.Tab
  );
  expect(rig.executeScript).not.toHaveBeenCalled();

  const clickPromise = rig.onClickedListeners[0]?.(
    { menuItemId: 'clip-page', pageUrl: 'https://example.com/article' } as chrome.contextMenus.OnClickData,
    { id: 21, url: 'https://example.com/article' } as chrome.tabs.Tab
  );
  await vi.advanceTimersByTimeAsync(60);
  await clickPromise;

  expect(rig.executeScript).toHaveBeenCalledWith(
    expect.objectContaining({ target: { tabId: 21, frameIds: [0] }, files: ['content/index.js'] })
  );
  expect(consoleErrorSpy).toHaveBeenCalledWith('[contextMenu] Failed to dispatch action to tab:', expect.any(Error));

  consoleErrorSpy.mockRestore();



});



it('ignores action clicks without a tab id and handles shown events without tab metadata', async () => {
  const { rig, register } = await loadModule();
  register();
  await flush();

  await rig.actionListeners[0]?.({ url: 'https://example.com/page' } as chrome.tabs.Tab);
  expect(rig.executeScript).not.toHaveBeenCalled();

  await rig.onShownListeners[0]?.(
    { menuItemId: 'clip-page', selectionText: '', pageUrl: undefined } as chrome.contextMenus.OnClickData,
    undefined
  );

  expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip selection' });
  expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Clip full page' });



});

it('returns forwarding failures and ignores malformed bridge messages', async () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { rig, register } = await loadModule({
    sendMessage: vi.fn(() => Promise.reject(new Error('frame relay failed')))
  });

  register();
  await flush();

  expect(await rig.messagingListeners[0]?.('bad-message', { tabId: 1, frameId: 0 })).toBeUndefined();

  const response = await rig.messagingListeners[0]?.(
    {
      type: 'AIIOB_FORWARD_VIDEO_SELECTION',
      payload: { selectedHtml: '<p>x</p>', selectedText: 'x' }
    },
    { tabId: 12, frameId: 6 }
  );

  expect(response).toEqual({ success: false, error: 'frame relay failed' });
  expect(consoleErrorSpy).toHaveBeenCalledWith('[contextMenu] Failed to forward video selection from frame:', 'frame relay failed');
  consoleErrorSpy.mockRestore();



});


it('warns for non-chrome removeAll failures and action click dispatch failures', async () => {
  vi.useFakeTimers();
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { rig, register } = await loadModule({
    removeAll: vi.fn(() => Promise.reject(new Error('remove failed'))),
    sendMessage: vi.fn(() => Promise.reject(new Error('action send failed')))
  });

  register();
  await flush();
  await flush();

  expect(consoleWarnSpy.mock.calls).toEqual(expect.arrayContaining([[
    '[contextMenus] Failed to clear existing context menus:',
    expect.any(Error)
  ]]));

  const promise = rig.actionListeners[0]?.({ id: 41, url: 'https://example.com/page' } as chrome.tabs.Tab);
  await vi.advanceTimersByTimeAsync(60);
  await promise;

  expect(consoleErrorSpy).toHaveBeenCalledWith('[action] Failed to trigger clipFull:', expect.any(Error));
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();



});

it('supports clip-video menu path and default frame id for regular selection clicks', async () => {
  vi.useFakeTimers();
  const { rig, register } = await loadModule();

  register();
  await flush();

  const clipVideoPromise = rig.onClickedListeners[0]?.(
    { menuItemId: 'clip-video', pageUrl: 'https://example.com/page' } as chrome.contextMenus.OnClickData,
    { id: 55, url: 'https://example.com/page' } as chrome.tabs.Tab
  );
  await vi.advanceTimersByTimeAsync(140);
  await clipVideoPromise;

  expect(rig.sendMessage).toHaveBeenCalledWith(55, { action: 'startVideoMode', frameId: 0, tabId: 55 }, { frameId: 0 });

  rig.executeScript.mockClear();
  rig.sendMessage.mockClear();
  const selectionPromise = rig.onClickedListeners[0]?.(
    { menuItemId: 'clip-selection', pageUrl: 'https://example.com/article' } as chrome.contextMenus.OnClickData,
    { id: 56, url: 'https://example.com/article' } as chrome.tabs.Tab
  );
  await vi.advanceTimersByTimeAsync(120);
  await selectionPromise;

  expect(rig.executeScript).toHaveBeenCalledTimes(1);
  expect(rig.sendMessage).toHaveBeenCalledWith(56, { action: 'clipSelection', frameId: 0, tabId: 56 }, { frameId: 0 });



});

it('handles modifier refresh fallback and active-tab inspection failures during setup', async () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { register } = await loadModule({
    getOptions: vi.fn(() => Promise.reject(new Error('options failed'))),
    query: vi.fn(() => Promise.reject(new Error('active tab failed')))
  });

  register();
  await flush();
  await flush();
  await flush();

  expect(consoleWarnSpy.mock.calls).toEqual(expect.arrayContaining([[
    '[contextMenus] Failed to resolve selection modifier options:',
    expect.any(Error)
  ]]));
  expect(consoleWarnSpy.mock.calls).toEqual(expect.arrayContaining([[
    '[contextMenus] Failed to inspect active tab after setup:',
    expect.any(Error)
  ]]));
  consoleWarnSpy.mockRestore();



});

it('reacts to options and tab lifecycle listeners for modifier auto-injection', async () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { rig, register } = await loadModule({
    getOptions: vi.fn(() => Promise.resolve({
      fragmentClipper: {
        selectionModifierEnabled: true,
        selectionModifierKeys: ['shift']
      }
    })),
    query: vi.fn(({ active }: { active?: boolean }) => {
      if (active) {
        return Promise.resolve([{ id: 71, url: 'https://example.com/active' }]);
      }
      return Promise.resolve([]);
    }),
    get: vi.fn((tabId: number) => {
      if (tabId === 71) {
        return Promise.resolve({ id: 71, url: 'https://example.com/active' });
      }
      if (tabId === 72) {
        return Promise.resolve({ id: 72, url: 'https://example.com/updated' });
      }
      if (tabId === 73) {
        return Promise.reject(new Error('activated failed'));
      }
      return Promise.resolve({ id: tabId, url: 'https://example.com/fallback' });
    })
  });

  register();
  await flush();
  await flush();

  rig.executeScript.mockClear();
  rig.optionSubscribers[0]?.();
  await flush();
  await flush();

  expect(rig.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 71, allFrames: true } }));

  rig.executeScript.mockClear();
  await rig.onUpdatedListeners[0]?.(72, { status: 'loading' }, { id: 72, url: 'https://example.com/updated' } as chrome.tabs.Tab);
  await rig.onUpdatedListeners[0]?.(72, { status: 'complete' }, { id: 72, url: 'https://example.com/updated' } as chrome.tabs.Tab);
  await flush();
  expect(rig.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 72, allFrames: true } }));

  await rig.onUpdatedListeners[0]?.(72, { url: 'https://www.bilibili.com/video/BV1xx411c7mD' }, { id: 72, url: 'https://www.bilibili.com/video/BV1xx411c7mD' } as chrome.tabs.Tab);
  await flush();
  expect(rig.executeScript).toHaveBeenCalled();

  await rig.onActivatedListeners[0]?.({ tabId: 73, windowId: 1 });
  await flush();
  expect(consoleWarnSpy).not.toHaveBeenCalledWith('[contextMenus] Failed to ensure modifier injection for active tab:', expect.anything());

  await rig.onRemovedListeners[0]?.(72, { isWindowClosing: false, windowId: 1 });
  consoleWarnSpy.mockRestore();



});

it('treats chrome-unavailable removeAll as ignorable and skips duplicate setup while running', async () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  let resolveMessages: ((value: { clipSelection: string; clipSelectionVideo: string; clipFullPage: string; contextMenuVideoMode: string }) => void) | null = null;
  const { rig } = await loadModule({
    removeAll: vi.fn(() => Promise.reject(new PlatformError('CHROME_UNAVAILABLE', 'no chrome')))
  });
  vi.resetModules();
  vi.doMock('../../../src/i18n', () => ({
    getMessages: vi.fn(
      () =>
        new Promise<{
          clipSelection: string;
          clipSelectionVideo: string;
          clipFullPage: string;
          contextMenuVideoMode: string;
        }>((resolve) => {
          resolveMessages = resolve;
        })
    )
  }));
  vi.doMock('../../../src/background/store', () => ({ getOptions: rig.getOptions }));
  vi.doMock('../../../src/background/services/notifications', () => ({ notifyInjectionFailure: rig.notifyInjectionFailure }));
  const modSlow = await import('../../../src/background/listeners/contextMenus');
  modSlow.registerContextMenuListeners({
    action: { onClicked: (listener: ActionClickListener) => { rig.actionListeners.push(listener); return () => undefined; } },
    contextMenus: {
      create: rig.create,
      update: rig.update,
      removeAll: rig.removeAll,
      refresh: rig.refresh,
      onClicked: (listener: ContextMenuOnClickListener) => { rig.onClickedListeners.push(listener); return () => undefined; },
      onShown: (listener: ContextMenuOnShownListener) => { rig.onShownListeners.push(listener); return () => undefined; }
    },
    runtime: {
      onInstalled: (listener: RuntimeInstallListener) => { rig.onInstalledListeners.push(listener); return () => undefined; },
      onStartup: (listener: RuntimeStartupListener) => { rig.onStartupListeners.push(listener); return () => undefined; }
    },
    tabs: {
      query: rig.query,
      get: rig.get,
      sendMessage: rig.sendMessage as TabsService['sendMessage'],
      onActivated: (listener: TabActivatedListener) => { rig.onActivatedListeners.push(listener); return () => undefined; },
      onUpdated: (listener: TabUpdatedListener) => { rig.onUpdatedListeners.push(listener); return () => undefined; },
      onRemoved: (listener: TabRemovedListener) => { rig.onRemovedListeners.push(listener); return () => undefined; }
    },
    scripting: { executeScript: rig.executeScript },
    messaging: { addListener: (listener: MessageListener) => { rig.messagingListeners.push(listener); return () => undefined; } },
    optionsRepository: { onChange: vi.fn((listener: () => void) => { rig.optionSubscribers.push(listener); return () => undefined; }) }
  });
  rig.onInstalledListeners[0]?.({ reason: 'install' });
  await flush();
  expect(consoleLogSpy).toHaveBeenCalledWith('[contextMenus] Setup already in progress, skipping...');
  if (!resolveMessages) {
    throw new Error('messages resolver missing');
  }
  (resolveMessages as (value: {
    clipSelection: string;
    clipSelectionVideo: string;
    clipFullPage: string;
    contextMenuVideoMode: string;
  }) => void)({
    clipSelection: 'Clip selection',
    clipSelectionVideo: 'Clip to video capture panel',
    clipFullPage: 'Clip full page',
    contextMenuVideoMode: 'Enter video capture mode'
  });
  await flush();
  consoleLogSpy.mockRestore();



});

it('swallows onShown update failures and skips click handling without tab ids', async () => {
  const { rig, register } = await loadModule({
    update: vi.fn(() => Promise.reject(new Error('update failed')))
  });

  register();
  await flush();

  await rig.onShownListeners[0]?.(
    { menuItemId: 'clip-selection', selectionText: 'text', pageUrl: 'https://example.com/page' } as chrome.contextMenus.OnClickData,
    { id: 91, url: 'https://example.com/page' } as chrome.tabs.Tab
  );
  expect(rig.update).toHaveBeenCalled();

  await rig.onClickedListeners[0]?.(
    { menuItemId: 'clip-page', pageUrl: 'https://example.com/page' } as chrome.contextMenus.OnClickData,
    { url: 'https://example.com/page' } as chrome.tabs.Tab
  );
  expect(rig.executeScript).not.toHaveBeenCalled();



});

it('keeps duplicate registration idempotent once listeners are already attached', async () => {
  const { rig, register } = await loadModule();
  register();
  register();
  await flush();
  await flush();

  expect(rig.onClickedListeners).toHaveLength(2);
  expect(rig.onShownListeners).toHaveLength(2);
  expect(rig.actionListeners).toHaveLength(2);
  expect(rig.messagingListeners).toHaveLength(2);
  expect(rig.create).toHaveBeenCalledTimes(3);
  expect(rig.removeAll).toHaveBeenCalledTimes(1);



});



it('keeps non-video titles for invalid urls and swallows option refresh failures after subscription', async () => {
  const getOptionsMock = vi
    .fn<[], Promise<{ fragmentClipper: { selectionModifierEnabled: boolean; selectionModifierKeys: string[] } }>>()
    .mockResolvedValueOnce({
      fragmentClipper: {
        selectionModifierEnabled: true,
        selectionModifierKeys: ['alt']
      }
    })
    .mockRejectedValueOnce(new Error('refresh failed'));
  const { rig, register } = await loadModule({
    getOptions: getOptionsMock
  });
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  register();
  await flush();
  await flush();

  await rig.onShownListeners[0]?.(
    { menuItemId: 'clip-selection', selectionText: 'text', pageUrl: 'not-a-url' } as chrome.contextMenus.OnClickData,
    { id: 101, url: 'not-a-url' } as chrome.tabs.Tab
  );
  expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip selection' });
  expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Clip full page' });

  rig.optionSubscribers[0]?.();
  await flush();
  await flush();
  expect(consoleWarnSpy).not.toHaveBeenCalledWith('[contextMenus] Failed to ensure modifier injection for active tab:', expect.anything());
  consoleWarnSpy.mockRestore();



});

it('treats youtu.be tabs as video pages when refreshing shown titles', async () => {
  const { rig, register } = await loadModule({
    query: vi.fn(() => Promise.resolve([{ id: 88, url: 'https://youtu.be/abc123' }]))
  });

  register();
  await flush();

  await rig.onShownListeners[0]?.(
    { menuItemId: 'clip-selection', selectionText: ' chosen ', pageUrl: 'https://youtu.be/abc123' } as chrome.contextMenus.OnClickData,
    { id: 88, url: 'https://youtu.be/abc123' } as chrome.tabs.Tab
  );

  expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip to video capture panel' });
  expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Enter video capture mode' });



});


it('treats youtube shorts and embed urls as video pages when refreshing titles', async () => {
  const { rig, register } = await loadModule({
    query: vi.fn(() => Promise.resolve([{ id: 109, url: 'https://www.youtube.com/shorts/abc' }]))
  });
  register();
  await flush();

  await rig.onShownListeners[0]?.(
    { menuItemId: 'clip-selection', selectionText: 'picked', pageUrl: 'https://www.youtube.com/shorts/abc' } as chrome.contextMenus.OnClickData,
    { id: 109, url: 'https://www.youtube.com/shorts/abc' } as chrome.tabs.Tab
  );
  expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip to video capture panel' });
  expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Enter video capture mode' });

  rig.update.mockClear();
  await rig.onShownListeners[0]?.(
    { menuItemId: 'clip-selection', selectionText: 'picked', pageUrl: 'https://www.youtube.com/embed/abc' } as chrome.contextMenus.OnClickData,
    { id: 110, url: 'https://www.youtube.com/embed/abc' } as chrome.tabs.Tab
  );
  expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip to video capture panel' });



});

it('does not auto inject when modifier keys config is disabled or malformed after subscription refresh', async () => {
  const getOptions = vi
    .fn<[], Promise<{ fragmentClipper: { selectionModifierEnabled: boolean; selectionModifierKeys: unknown } }>>()
    .mockResolvedValue({ fragmentClipper: { selectionModifierEnabled: false, selectionModifierKeys: ['Alt'] } })
    .mockResolvedValueOnce({ fragmentClipper: { selectionModifierEnabled: true, selectionModifierKeys: 'Alt' as unknown as string[] } });
  const { rig, register } = await loadModule({ getOptions });

  register();
  await flush();
  await flush();
  rig.optionSubscribers[0]?.();
  await flush();
  await flush();

  expect(rig.executeScript).not.toHaveBeenCalled();
});

it('resolves active tab url through tabs.get before auto injecting when modifier mode is enabled', async () => {
  const { rig, register } = await loadModule({
    getOptions: vi.fn(() => Promise.resolve({
      fragmentClipper: {
        selectionModifierEnabled: true,
        selectionModifierKeys: ['alt']
      }
    })),
    query: vi.fn(() => Promise.resolve([{ id: 33 }])),
    get: vi.fn((tabId: number) => Promise.resolve({ id: tabId, url: 'file:///tmp/demo.html' }))
  });

  register();
  await flush();
  await flush();
  rig.optionSubscribers[0]?.();
  await flush();
  await flush();

  expect(rig.get).toHaveBeenCalledWith(33);
  expect(rig.executeScript).toHaveBeenCalledWith(expect.objectContaining({
    target: { tabId: 33, allFrames: true }
  }));
});

it('keeps default titles when sender tab and page url are both missing or selection text is blank', async () => {
  const { rig, register } = await loadModule();
  register();
  await flush();

  await rig.onShownListeners[0]?.(
    { menuItemId: 'clip-selection', selectionText: '   ' } as chrome.contextMenus.OnClickData,
    undefined
  );

  expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip selection' });
  expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Clip full page' });
});

it('keeps default titles when page url is malformed and tab metadata is absent', async () => {
  const { rig, register } = await loadModule();
  register();
  await flush();

  await rig.onShownListeners[0]?.(
    { menuItemId: 'clip-selection', selectionText: 'picked', pageUrl: 'not-a-valid-url' } as chrome.contextMenus.OnClickData,
    { id: 201 } as chrome.tabs.Tab
  );

  expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip selection' });
  expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Clip full page' });
});


it('ignores malformed bridge messages and unknown bridge types', async () => {
  const { rig, register } = await loadModule();
  register();
  await flush();

  expect(await rig.messagingListeners[0]?.(null, { tabId: 1 })).toBeUndefined();
  expect(await rig.messagingListeners[0]?.('bad-payload', { tabId: 1 })).toBeUndefined();
  expect(await rig.messagingListeners[0]?.({ type: 'OTHER_EVENT' }, { tabId: 1 })).toBeUndefined();
  expect(rig.sendMessage).not.toHaveBeenCalled();
});

it('does not auto inject when resolved active tab url is non-injectable', async () => {
  const { rig, register } = await loadModule({
    getOptions: vi.fn(() => Promise.resolve({
      fragmentClipper: {
        selectionModifierEnabled: true,
        selectionModifierKeys: ['alt']
      }
    })),
    query: vi.fn(() => Promise.resolve([{ id: 44 }])),
    get: vi.fn((tabId: number) => Promise.resolve({ id: tabId, url: 'chrome://extensions' }))
  });

  register();
  await flush();
  await flush();
  rig.optionSubscribers[0]?.();
  await flush();
  await flush();

  expect(rig.get).toHaveBeenCalledWith(44);
  expect(rig.executeScript).not.toHaveBeenCalled();
});

it('treats youtube watch urls as video pages when showing menu titles', async () => {
  const { rig, register } = await loadModule({
    query: vi.fn(() => Promise.resolve([{ id: 145, url: 'https://www.youtube.com/watch?v=abc123' }]))
  });

  register();
  await flush();

  await rig.onShownListeners[0]?.(
    { menuItemId: 'clip-selection', selectionText: 'picked', pageUrl: 'https://www.youtube.com/watch?v=abc123' } as chrome.contextMenus.OnClickData,
    { id: 145, url: 'https://www.youtube.com/watch?v=abc123' } as chrome.tabs.Tab
  );

  expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip to video capture panel' });
  expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Enter video capture mode' });
});
