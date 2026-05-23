import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, loadModule } from './contextMenus.helpers';

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
      {
        menuItemId: 'clip-selection',
        selectionText: ' selected ',
        pageUrl: 'https://www.bilibili.com/video/BV1xx411c7mD'
      } as chrome.contextMenus.OnClickData,
      { id: 7, url: 'https://www.bilibili.com/video/BV1xx411c7mD' } as chrome.tabs.Tab
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
      {
        menuItemId: 'clip-selection',
        frameId: 4,
        pageUrl: 'https://www.bilibili.com/video/BV1xx411c7mD'
      } as chrome.contextMenus.OnClickData,
      { id: 9, url: 'https://www.bilibili.com/video/BV1xx411c7mD' } as chrome.tabs.Tab
    );

    await vi.advanceTimersByTimeAsync(120);
    await clickPromise;

    expect(rig.executeScript).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ target: { tabId: 9, frameIds: [0] }, files: ['content/index.js'] })
    );
    expect(rig.executeScript).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ target: { tabId: 9, frameIds: [4] }, files: ['content/index.js'] })
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
      {
        menuItemId: 'clip-selection',
        selectionText: '',
        pageUrl: 'https://example.com/article'
      } as chrome.contextMenus.OnClickData,
      { id: 3, url: 'https://example.com/article' } as chrome.tabs.Tab
    );

    expect(rig.update).toHaveBeenCalledWith('clip-selection', { title: 'Clip selection' });
    expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Clip full page' });

    const response = await rig.messagingListeners[0]?.(
      { type: 'AIIOB_FORWARD_VIDEO_SELECTION', payload: {} },
      { frameId: 2 }
    );
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
      {
        menuItemId: 'unknown-item',
        pageUrl: 'https://example.com/article'
      } as chrome.contextMenus.OnClickData,
      { id: 21, url: 'https://example.com/article' } as chrome.tabs.Tab
    );
    expect(rig.executeScript).not.toHaveBeenCalled();

    const clickPromise = rig.onClickedListeners[0]?.(
      {
        menuItemId: 'clip-page',
        pageUrl: 'https://example.com/article'
      } as chrome.contextMenus.OnClickData,
      { id: 21, url: 'https://example.com/article' } as chrome.tabs.Tab
    );
    await vi.advanceTimersByTimeAsync(60);
    await clickPromise;

    expect(rig.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 21, frameIds: [0] }, files: ['content/index.js'] })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[contextMenu] Failed to dispatch action to tab:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('ignores action clicks without a tab id and handles shown events without tab metadata', async () => {
    const { rig, register } = await loadModule();
    register();
    await flush();

    await rig.actionListeners[0]?.({ url: 'https://example.com/page' } as chrome.tabs.Tab);
    expect(rig.executeScript).not.toHaveBeenCalled();

    await rig.onShownListeners[0]?.(
      {
        menuItemId: 'clip-page',
        selectionText: '',
        pageUrl: undefined
      } as chrome.contextMenus.OnClickData,
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

    expect(consoleWarnSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ['[contextMenus] Failed to clear existing context menus:', expect.any(Error)]
      ])
    );

    const promise = rig.actionListeners[0]?.({
      id: 41,
      url: 'https://example.com/page'
    } as chrome.tabs.Tab);
    await vi.advanceTimersByTimeAsync(60);
    await promise;

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[action] Failed to trigger clipFull:',
      expect.any(Error)
    );
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('supports clip-video menu path and default frame id for regular selection clicks', async () => {
    vi.useFakeTimers();
    const { rig, register } = await loadModule();

    register();
    await flush();

    const clipVideoPromise = rig.onClickedListeners[0]?.(
      {
        menuItemId: 'clip-video',
        pageUrl: 'https://example.com/page'
      } as chrome.contextMenus.OnClickData,
      { id: 55, url: 'https://example.com/page' } as chrome.tabs.Tab
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
      {
        menuItemId: 'clip-selection',
        pageUrl: 'https://example.com/article'
      } as chrome.contextMenus.OnClickData,
      { id: 56, url: 'https://example.com/article' } as chrome.tabs.Tab
    );
    await vi.advanceTimersByTimeAsync(120);
    await selectionPromise;

    expect(rig.executeScript).toHaveBeenCalledTimes(1);
    expect(rig.sendMessage).toHaveBeenCalledWith(
      56,
      { action: 'clipSelection', frameId: 0, tabId: 56 },
      { frameId: 0 }
    );
  });
});
