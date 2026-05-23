import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, loadModule } from './contextMenus.helpers';

describe('context menu listeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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
      {
        menuItemId: 'clip-selection',
        selectionText: 'picked',
        pageUrl: 'not-a-valid-url'
      } as chrome.contextMenus.OnClickData,
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
    expect(
      await rig.messagingListeners[0]?.({ type: 'OTHER_EVENT' }, { tabId: 1 })
    ).toBeUndefined();
    expect(rig.sendMessage).not.toHaveBeenCalled();
  });

  it('does not auto inject when resolved active tab url is non-injectable', async () => {
    const { rig, register } = await loadModule({
      getOptions: vi.fn(() =>
        Promise.resolve({
          fragmentClipper: {
            selectionModifierEnabled: true,
            selectionModifierKeys: ['alt']
          }
        })
      ),
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
      query: vi.fn(() =>
        Promise.resolve([{ id: 145, url: 'https://www.youtube.com/watch?v=abc123' }])
      )
    });

    register();
    await flush();

    await rig.onShownListeners[0]?.(
      {
        menuItemId: 'clip-selection',
        selectionText: 'picked',
        pageUrl: 'https://www.youtube.com/watch?v=abc123'
      } as chrome.contextMenus.OnClickData,
      { id: 145, url: 'https://www.youtube.com/watch?v=abc123' } as chrome.tabs.Tab
    );

    expect(rig.update).toHaveBeenCalledWith('clip-selection', {
      title: 'Clip to video capture panel'
    });
    expect(rig.update).toHaveBeenCalledWith('clip-page', { title: 'Enter video capture mode' });
  });
});
