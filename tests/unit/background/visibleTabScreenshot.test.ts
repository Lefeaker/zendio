import { describe, expect, it, vi } from 'vitest';
import { captureVisibleTabScreenshotForSender } from '../../../src/background/listeners/visibleTabScreenshot';
import type { TabsService } from '../../../src/platform/interfaces/tabs';
import { asType } from '../../utils/typeHelpers';

describe('captureVisibleTabScreenshotForSender', () => {
  it('captures using the sender window id without resolving the sender tab', async () => {
    const tabs = {
      get: vi.fn(),
      captureVisibleTab: vi.fn(() => Promise.resolve('data:image/jpeg;base64,frame'))
    };

    await expect(
      captureVisibleTabScreenshotForSender(
        asType<Pick<TabsService, 'get' | 'captureVisibleTab'>>(tabs),
        { tabId: 12, windowId: 4 }
      )
    ).resolves.toEqual({
      success: true,
      dataUrl: 'data:image/jpeg;base64,frame'
    });
    expect(tabs.get).not.toHaveBeenCalled();
    expect(tabs.captureVisibleTab).toHaveBeenCalledWith(4, { format: 'jpeg', quality: 88 });
  });

  it('resolves the sender window id from the sender tab when needed', async () => {
    const tabs = {
      get: vi.fn(() => Promise.resolve({ windowId: 9 })),
      captureVisibleTab: vi.fn(() => Promise.resolve('data:image/jpeg;base64,frame'))
    };

    await expect(
      captureVisibleTabScreenshotForSender(
        asType<Pick<TabsService, 'get' | 'captureVisibleTab'>>(tabs),
        { tabId: 27 }
      )
    ).resolves.toEqual({
      success: true,
      dataUrl: 'data:image/jpeg;base64,frame'
    });
    expect(tabs.get).toHaveBeenCalledWith(27);
    expect(tabs.captureVisibleTab).toHaveBeenCalledWith(9, { format: 'jpeg', quality: 88 });
  });

  it('returns a sender-window error when tab lookup cannot resolve a window id', async () => {
    const tabs = {
      get: vi.fn(() => Promise.reject(new Error('tab gone'))),
      captureVisibleTab: vi.fn()
    };

    await expect(
      captureVisibleTabScreenshotForSender(
        asType<Pick<TabsService, 'get' | 'captureVisibleTab'>>(tabs),
        { tabId: 27 }
      )
    ).resolves.toEqual({
      success: false,
      error: 'Missing sender window for visible tab screenshot.'
    });
    expect(tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('returns an unsupported error when the adapter does not expose visible-tab capture', async () => {
    const tabs = {
      get: vi.fn(),
      captureVisibleTab: undefined
    };

    await expect(
      captureVisibleTabScreenshotForSender(
        asType<Pick<TabsService, 'get' | 'captureVisibleTab'>>(tabs),
        { windowId: 4 }
      )
    ).resolves.toEqual({
      success: false,
      error: 'Visible tab screenshot capture is unsupported.'
    });
  });

  it('returns capture errors and invalid-image responses as failures', async () => {
    const invalidTabs = {
      get: vi.fn(),
      captureVisibleTab: vi.fn(() => Promise.resolve('about:blank'))
    };
    const rejectingTabs = {
      get: vi.fn(),
      captureVisibleTab: vi.fn(() => Promise.reject(new Error('permission denied')))
    };

    await expect(
      captureVisibleTabScreenshotForSender(
        asType<Pick<TabsService, 'get' | 'captureVisibleTab'>>(invalidTabs),
        { windowId: 4 }
      )
    ).resolves.toEqual({
      success: false,
      error: 'Visible tab screenshot capture returned no image.'
    });
    await expect(
      captureVisibleTabScreenshotForSender(
        asType<Pick<TabsService, 'get' | 'captureVisibleTab'>>(rejectingTabs),
        { windowId: 4 }
      )
    ).resolves.toEqual({
      success: false,
      error: 'permission denied'
    });
  });
});
