import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, loadModule } from './contextMenus.helpers';

type MenuClickDataStub = Partial<chrome.contextMenus.OnClickData> & {
  menuItemId: chrome.contextMenus.OnClickData['menuItemId'];
};

function menuClickData(data: MenuClickDataStub): chrome.contextMenus.OnClickData {
  return data as chrome.contextMenus.OnClickData;
}

function tabData(data: Partial<chrome.tabs.Tab>): chrome.tabs.Tab {
  return data as chrome.tabs.Tab;
}

function objectMatcher(value: object): object {
  return expect.objectContaining(value) as object;
}

function functionMatcher(): object {
  return expect.any(Function) as object;
}

function errorMatcher(): object {
  return expect.any(Error) as object;
}

describe('context menu listeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('creates menus on registration and refreshes shown titles for video tabs', async () => {
    const { rig, register } = await loadModule({
      query: vi.fn(() =>
        Promise.resolve([{ id: 7, url: 'https://www.bilibili.com/video/BV1xx411c7mD' }])
      )
    });

    register();
    await flush();
    await flush();

    expect(rig.create).toHaveBeenCalledTimes(3);
    expect(rig.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'clip-selection' }));

    await rig.onShownListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-selection',
        selectionText: ' selected ',
        pageUrl: 'https://www.bilibili.com/video/BV1xx411c7mD'
      }),
      tabData({ id: 7, url: 'https://www.bilibili.com/video/BV1xx411c7mD' })
    );

    expect(rig.update).toHaveBeenCalledWith('clip-selection', {
      title: 'Clip to video capture panel'
    });
    expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Enter video capture mode' });
    expect(rig.refresh).toHaveBeenCalled();
  });

  it('injects clipper and dispatches video selection action for frame selection clicks', async () => {
    vi.useFakeTimers();
    const { rig, register } = await loadModule();
    register();
    await Promise.resolve();

    const clickPromise = rig.onClickedListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-selection',
        frameId: 4,
        pageUrl: 'https://www.bilibili.com/video/BV1xx411c7mD'
      }),
      tabData({ id: 9, url: 'https://www.bilibili.com/video/BV1xx411c7mD' })
    );

    await vi.advanceTimersByTimeAsync(120);
    await clickPromise;

    expect(rig.executeScript).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ target: { tabId: 9, frameIds: [0] }, files: ['content/index.js'] })
    );
    expect(rig.executeScript).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ target: { tabId: 9, frameIds: [0] }, func: functionMatcher() })
    );
    expect(rig.executeScript).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ target: { tabId: 9, frameIds: [4] }, files: ['content/index.js'] })
    );
    expect(rig.executeScript).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ target: { tabId: 9, frameIds: [4] }, func: functionMatcher() })
    );
    expect(rig.sendMessage).toHaveBeenCalledWith(
      9,
      { action: 'videoClipSelection', frameId: 4, tabId: 9 },
      { frameId: 4 }
    );
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

    expect(rig.sendMessage).toHaveBeenCalledWith(
      11,
      {
        action: 'videoClipSelectionFromFrame',
        payload: {
          selectedHtml: '<p>hello</p>',
          selectedText: 'hello',
          sourceFrameId: 5,
          sourceUrl: 'https://frame.example'
        }
      },
      { frameId: 0 }
    );
    expect(response).toEqual({ success: true });
  });

  it('keeps default menu titles for non-video pages and returns NO_TAB for frame forwarding without sender tab', async () => {
    const { rig, register } = await loadModule({
      query: vi.fn(() => Promise.resolve([{ id: 3, url: 'https://example.com/article' }]))
    });

    register();
    await flush();
    await rig.onShownListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-selection',
        selectionText: '',
        pageUrl: 'https://example.com/article'
      }),
      tabData({ id: 3, url: 'https://example.com/article' })
    );

    expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip selection' });
    expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Clip full page' });

    const response = await rig.messagingListeners[0]?.(
      { type: 'AIIOB_FORWARD_VIDEO_SELECTION', payload: {} },
      { frameId: 2 }
    );
    expect(response).toEqual({ success: false, error: 'NO_TAB' });
  });

  it('ignores unknown menu ids and notifies tab dispatch failures for regular page clicks', async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rig, register } = await loadModule({
      sendMessage: vi.fn(() => Promise.reject(new Error('dispatch failed')))
    });

    register();
    await flush();

    await rig.onClickedListeners[0]?.(
      menuClickData({
        menuItemId: 'unknown-item',
        pageUrl: 'https://example.com/article'
      }),
      tabData({ id: 21, url: 'https://example.com/article' })
    );
    expect(rig.executeScript).not.toHaveBeenCalled();

    const clickPromise = rig.onClickedListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-page',
        pageUrl: 'https://example.com/article'
      }),
      tabData({ id: 21, url: 'https://example.com/article' })
    );
    await vi.advanceTimersByTimeAsync(60);
    await clickPromise;

    expect(rig.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 21, frameIds: [0] }, files: ['content/index.js'] })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[contextMenu] Failed to dispatch action to tab:',
      errorMatcher()
    );
    expect(rig.notifyClipFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CONTENT_MESSAGING_FAILED',
        userMessageDescriptor: { key: 'errorContentMessagingFailed' },
        context: objectMatcher({
          component: 'contextMenus',
          messageType: 'clipFull',
          tabId: 21,
          frameId: 0
        })
      })
    );

    consoleErrorSpy.mockRestore();
  });

  it('waits for the injected content runtime before dispatching full-page context menu actions', async () => {
    vi.useFakeTimers();
    const runtimeReady: { resolve?: () => void } = {};
    const { rig, register } = await loadModule({
      executeScript: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              runtimeReady.resolve = () =>
                resolve([{ documentId: 'document-0', frameId: 0, result: { ready: true } }]);
            })
        )
    });

    register();
    await flush();

    const clickPromise = rig.onClickedListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-page',
        pageUrl: 'https://example.com/article'
      }),
      tabData({ id: 21, url: 'https://example.com/article' })
    );

    await vi.advanceTimersByTimeAsync(200);
    expect(rig.sendMessage).not.toHaveBeenCalled();
    expect(runtimeReady.resolve).toEqual(expect.any(Function));

    runtimeReady.resolve?.();
    await vi.advanceTimersByTimeAsync(60);
    await clickPromise;

    expect(rig.sendMessage).toHaveBeenCalledWith(
      21,
      { action: 'clipFull', frameId: 0, tabId: 21 },
      { frameId: 0 }
    );
  });

  it('does not dispatch context menu actions after content runtime injection fails', async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rig, register } = await loadModule({
      executeScript: vi.fn(() => Promise.reject(new Error('missing content loader')))
    });

    register();
    await flush();

    const clickPromise = rig.onClickedListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-page',
        pageUrl: 'https://example.com/article'
      }),
      tabData({ id: 21, url: 'https://example.com/article' })
    );
    await vi.advanceTimersByTimeAsync(200);
    await clickPromise;

    expect(rig.notifyInjectionFailure).toHaveBeenCalledWith('missing content loader');
    expect(rig.sendMessage).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('does not dispatch context menu actions when content runtime readiness fails', async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rig, register } = await loadModule({
      executeScript: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([
          {
            documentId: 'document-0',
            frameId: 0,
            result: {
              ready: false,
              reason: 'runtime-import-rejected',
              message: 'boot failed'
            }
          }
        ])
    });

    register();
    await flush();

    const clickPromise = rig.onClickedListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-page',
        pageUrl: 'https://example.com/article'
      }),
      tabData({ id: 21, url: 'https://example.com/article' })
    );
    await vi.advanceTimersByTimeAsync(200);
    await clickPromise;

    expect(rig.notifyInjectionFailure).toHaveBeenCalledWith('runtime-import-rejected: boot failed');
    expect(rig.sendMessage).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('does not dispatch video frame selection when top frame runtime readiness fails', async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const executeScript = vi
      .fn()
      .mockResolvedValue([{ documentId: 'document-ready', frameId: 4, result: { ready: true } }]);
    executeScript.mockResolvedValueOnce(undefined).mockResolvedValueOnce([
      {
        documentId: 'document-0',
        frameId: 0,
        result: {
          ready: false,
          reason: 'runtime-ready-timeout'
        }
      }
    ]);
    const { rig, register } = await loadModule({
      executeScript
    });

    register();
    await flush();

    const clickPromise = rig.onClickedListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-selection',
        frameId: 4,
        pageUrl: 'https://www.bilibili.com/video/BV1xx411c7mD'
      }),
      tabData({ id: 21, url: 'https://www.bilibili.com/video/BV1xx411c7mD' })
    );
    await vi.advanceTimersByTimeAsync(200);
    await clickPromise;

    expect(rig.notifyInjectionFailure).toHaveBeenCalledWith('runtime-ready-timeout');
    expect(rig.sendMessage).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('ignores action clicks without a tab id and handles shown events without tab metadata', async () => {
    const { rig, register } = await loadModule();
    register();
    await flush();

    await rig.actionListeners[0]?.(tabData({ url: 'https://example.com/page' }));
    expect(rig.executeScript).not.toHaveBeenCalled();

    await rig.onShownListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-page',
        selectionText: '',
        pageUrl: undefined
      }),
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

    expect(
      await rig.messagingListeners[0]?.('bad-message', { tabId: 1, frameId: 0 })
    ).toBeUndefined();

    const response = await rig.messagingListeners[0]?.(
      {
        type: 'AIIOB_FORWARD_VIDEO_SELECTION',
        payload: { selectedHtml: '<p>x</p>', selectedText: 'x' }
      },
      { tabId: 12, frameId: 6 }
    );

    expect(response).toEqual({ success: false, error: 'frame relay failed' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[contextMenu] Failed to forward video selection from frame:',
      'frame relay failed'
    );
    consoleErrorSpy.mockRestore();
  });

  it('warns for non-chrome removeAll failures and notifies action click dispatch failures', async () => {
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

    expect(consoleWarnSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ['[contextMenus] Failed to clear existing context menus:', expect.any(Error)]
      ])
    );

    const promise = rig.actionListeners[0]?.(tabData({ id: 41, url: 'https://example.com/page' }));
    await vi.advanceTimersByTimeAsync(60);
    await promise;

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[contextMenu] Failed to dispatch action to tab:',
      errorMatcher()
    );
    expect(rig.notifyClipFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CONTENT_MESSAGING_FAILED',
        userMessageDescriptor: { key: 'errorContentMessagingFailed' },
        context: objectMatcher({
          component: 'contextMenus',
          messageType: 'clipFull',
          tabId: 41,
          frameId: null
        })
      })
    );
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('notifies when a content action response reports failure', async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rig, register } = await loadModule({
      sendMessage: vi.fn(() => Promise.resolve({ success: false, error: 'bridge failed' }))
    });

    register();
    await flush();

    const clickPromise = rig.onClickedListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-selection',
        frameId: 4,
        pageUrl: 'https://www.bilibili.com/video/BV1xx411c7mD'
      }),
      tabData({ id: 57, url: 'https://www.bilibili.com/video/BV1xx411c7mD' })
    );
    await vi.advanceTimersByTimeAsync(140);
    await clickPromise;

    expect(rig.notifyClipFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CONTENT_MESSAGING_FAILED',
        userMessageDescriptor: { key: 'errorContentMessagingFailed' },
        context: objectMatcher({
          component: 'contextMenus',
          messageType: 'videoClipSelection',
          tabId: 57,
          frameId: 4
        })
      })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[contextMenu] Failed to dispatch action to tab:',
      errorMatcher()
    );
    consoleErrorSpy.mockRestore();
  });

  it('supports clip-video menu path and default frame id for regular selection clicks', async () => {
    vi.useFakeTimers();
    const { rig, register } = await loadModule();

    register();
    await flush();

    const clipVideoPromise = rig.onClickedListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-video',
        pageUrl: 'https://example.com/page'
      }),
      tabData({ id: 55, url: 'https://example.com/page' })
    );
    await vi.advanceTimersByTimeAsync(140);
    await clipVideoPromise;

    expect(rig.sendMessage).toHaveBeenCalledWith(
      55,
      { action: 'startVideoMode', frameId: 0, tabId: 55 },
      { frameId: 0 }
    );

    rig.executeScript.mockClear();
    rig.sendMessage.mockClear();
    const selectionPromise = rig.onClickedListeners[0]?.(
      menuClickData({
        menuItemId: 'clip-selection',
        pageUrl: 'https://example.com/article'
      }),
      tabData({ id: 56, url: 'https://example.com/article' })
    );
    await vi.advanceTimersByTimeAsync(120);
    await selectionPromise;

    expect(rig.executeScript).toHaveBeenCalledTimes(2);
    expect(rig.sendMessage).toHaveBeenCalledWith(
      56,
      { action: 'clipSelection', frameId: 0, tabId: 56 },
      { frameId: 0 }
    );
  });
});
