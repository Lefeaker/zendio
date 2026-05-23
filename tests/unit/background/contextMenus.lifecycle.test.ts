import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformError } from '../../../src/platform/errors';
import type { ActionClickListener } from '../../../src/platform/interfaces/actions';
import type {
  ContextMenuOnClickListener,
  ContextMenuOnShownListener
} from '../../../src/platform/interfaces/contextMenus';
import type { MessageListener } from '../../../src/platform/interfaces/messaging';
import type {
  RuntimeInstallListener,
  RuntimeStartupListener
} from '../../../src/platform/interfaces/runtime';
import type {
  TabActivatedListener,
  TabRemovedListener,
  TabUpdatedListener,
  TabsService
} from '../../../src/platform/interfaces/tabs';
import { flush, loadModule } from './contextMenus.helpers';

describe('context menu listeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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

    expect(consoleWarnSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ['[contextMenus] Failed to resolve selection modifier options:', expect.any(Error)]
      ])
    );
    expect(consoleWarnSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ['[contextMenus] Failed to inspect active tab after setup:', expect.any(Error)]
      ])
    );
    consoleWarnSpy.mockRestore();
  });

  it('reacts to options and tab lifecycle listeners for modifier auto-injection', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rig, register } = await loadModule({
      getOptions: vi.fn(() =>
        Promise.resolve({
          fragmentClipper: {
            selectionModifierEnabled: true,
            selectionModifierKeys: ['shift']
          }
        })
      ),
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

    expect(rig.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 71, allFrames: true } })
    );

    rig.executeScript.mockClear();
    await rig.onUpdatedListeners[0]?.(72, { status: 'loading' }, {
      id: 72,
      url: 'https://example.com/updated'
    } as chrome.tabs.Tab);
    await rig.onUpdatedListeners[0]?.(72, { status: 'complete' }, {
      id: 72,
      url: 'https://example.com/updated'
    } as chrome.tabs.Tab);
    await flush();
    expect(rig.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 72, allFrames: true } })
    );

    await rig.onUpdatedListeners[0]?.(72, { url: 'https://www.bilibili.com/video/BV1xx411c7mD' }, {
      id: 72,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    } as chrome.tabs.Tab);
    await flush();
    expect(rig.executeScript).toHaveBeenCalled();

    await rig.onActivatedListeners[0]?.({ tabId: 73, windowId: 1 });
    await flush();
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      '[contextMenus] Failed to ensure modifier injection for active tab:',
      expect.anything()
    );

    await rig.onRemovedListeners[0]?.(72, { isWindowClosing: false, windowId: 1 });
    consoleWarnSpy.mockRestore();
  });

  it('treats chrome-unavailable removeAll as ignorable and skips duplicate setup while running', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let resolveMessages:
      | ((value: {
          clipSelection: string;
          clipSelectionVideo: string;
          clipFullPage: string;
          contextMenuVideoMode: string;
        }) => void)
      | null = null;
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
    vi.doMock('../../../src/background/services/notifications', () => ({
      notifyInjectionFailure: rig.notifyInjectionFailure
    }));
    const modSlow = await import('../../../src/background/listeners/contextMenus');
    modSlow.registerContextMenuListeners({
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
      scripting: { executeScript: rig.executeScript },
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
    rig.onInstalledListeners[0]?.({ reason: 'install' });
    await flush();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[contextMenus] Setup already in progress, skipping...'
    );
    if (!resolveMessages) {
      throw new Error('messages resolver missing');
    }
    (
      resolveMessages as (value: {
        clipSelection: string;
        clipSelectionVideo: string;
        clipFullPage: string;
        contextMenuVideoMode: string;
      }) => void
    )({
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
      {
        menuItemId: 'clip-selection',
        selectionText: 'text',
        pageUrl: 'https://example.com/page'
      } as chrome.contextMenus.OnClickData,
      { id: 91, url: 'https://example.com/page' } as chrome.tabs.Tab
    );
    expect(rig.update).toHaveBeenCalled();

    await rig.onClickedListeners[0]?.(
      {
        menuItemId: 'clip-page',
        pageUrl: 'https://example.com/page'
      } as chrome.contextMenus.OnClickData,
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
      .fn<
        [],
        Promise<{
          fragmentClipper: { selectionModifierEnabled: boolean; selectionModifierKeys: string[] };
        }>
      >()
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
      {
        menuItemId: 'clip-selection',
        selectionText: 'text',
        pageUrl: 'not-a-url'
      } as chrome.contextMenus.OnClickData,
      { id: 101, url: 'not-a-url' } as chrome.tabs.Tab
    );
    expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip selection' });
    expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Clip full page' });

    rig.optionSubscribers[0]?.();
    await flush();
    await flush();
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      '[contextMenus] Failed to ensure modifier injection for active tab:',
      expect.anything()
    );
    consoleWarnSpy.mockRestore();
  });

  it('treats youtu.be tabs as video pages when refreshing shown titles', async () => {
    const { rig, register } = await loadModule({
      query: vi.fn(() => Promise.resolve([{ id: 88, url: 'https://youtu.be/abc123' }]))
    });

    register();
    await flush();

    await rig.onShownListeners[0]?.(
      {
        menuItemId: 'clip-selection',
        selectionText: ' chosen ',
        pageUrl: 'https://youtu.be/abc123'
      } as chrome.contextMenus.OnClickData,
      { id: 88, url: 'https://youtu.be/abc123' } as chrome.tabs.Tab
    );

    expect(rig.update).toHaveBeenCalledWith('clip-selection', {
      title: 'Clip to video capture panel'
    });
    expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Enter video capture mode' });
  });

  it('treats youtube shorts and embed urls as video pages when refreshing titles', async () => {
    const { rig, register } = await loadModule({
      query: vi.fn(() => Promise.resolve([{ id: 109, url: 'https://www.youtube.com/shorts/abc' }]))
    });
    register();
    await flush();

    await rig.onShownListeners[0]?.(
      {
        menuItemId: 'clip-selection',
        selectionText: 'picked',
        pageUrl: 'https://www.youtube.com/shorts/abc'
      } as chrome.contextMenus.OnClickData,
      { id: 109, url: 'https://www.youtube.com/shorts/abc' } as chrome.tabs.Tab
    );
    expect(rig.update).toHaveBeenCalledWith('clip-selection', {
      title: 'Clip to video capture panel'
    });
    expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Enter video capture mode' });

    rig.update.mockClear();
    await rig.onShownListeners[0]?.(
      {
        menuItemId: 'clip-selection',
        selectionText: 'picked',
        pageUrl: 'https://www.youtube.com/embed/abc'
      } as chrome.contextMenus.OnClickData,
      { id: 110, url: 'https://www.youtube.com/embed/abc' } as chrome.tabs.Tab
    );
    expect(rig.update).toHaveBeenCalledWith('clip-selection', {
      title: 'Clip to video capture panel'
    });
  });

  it('does not auto inject when modifier keys config is disabled or malformed after subscription refresh', async () => {
    const getOptions = vi
      .fn<
        [],
        Promise<{
          fragmentClipper: { selectionModifierEnabled: boolean; selectionModifierKeys: unknown };
        }>
      >()
      .mockResolvedValue({
        fragmentClipper: { selectionModifierEnabled: false, selectionModifierKeys: ['Alt'] }
      })
      .mockResolvedValueOnce({
        fragmentClipper: {
          selectionModifierEnabled: true,
          selectionModifierKeys: 'Alt' as unknown as string[]
        }
      });
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
      getOptions: vi.fn(() =>
        Promise.resolve({
          fragmentClipper: {
            selectionModifierEnabled: true,
            selectionModifierKeys: ['alt']
          }
        })
      ),
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
    expect(rig.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 33, allFrames: true }
      })
    );
  });
});
