import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabsService } from '../../../src/platform/interfaces/tabs';
import { asType } from '../../utils/typeHelpers';

async function loadVisibleTabScreenshotModule() {
  return import('../../../src/background/listeners/visibleTabScreenshot');
}

describe('captureVisibleTabScreenshotForSender', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures using the sender window id without resolving the sender tab', async () => {
    const { captureVisibleTabScreenshotForSender } = await loadVisibleTabScreenshotModule();
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
    const { captureVisibleTabScreenshotForSender } = await loadVisibleTabScreenshotModule();
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

  it('returns a stable sender-window failure code when a window id cannot be resolved', async () => {
    const { captureVisibleTabScreenshotForSender } = await loadVisibleTabScreenshotModule();
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
      error: 'visible_tab_screenshot_missing_sender_window'
    });
    expect(tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('returns stable technical failure codes for unsupported and invalid image responses', async () => {
    const { captureVisibleTabScreenshotForSender } = await loadVisibleTabScreenshotModule();
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
      error: 'visible_tab_screenshot_unsupported'
    });
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
      error: 'visible_tab_screenshot_missing_image'
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
