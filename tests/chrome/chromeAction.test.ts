/**
 * Chrome Action 服务单元测试
 */

import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createChromeRuntimeMock, type ChromeMockHandle } from '../utils/browserMocks';

describe('chromeActionService', () => {
  let chromeHandle: ChromeMockHandle;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    chromeHandle = createChromeRuntimeMock();
  });

  afterEach(() => {
    chromeHandle.restore();
  });

  it('setBadgeText 应该调用 chrome.action.setBadgeText 并返回 Promise', async () => {
    const { setBadgeText } = chromeHandle.actionMocks;
    const { chromeActionService } = await import('../../src/platform/chrome/action');

    await expect(chromeActionService.setBadgeText?.({ text: '1' })).resolves.toBeUndefined();
    expect(setBadgeText).toHaveBeenCalledWith({ text: '1' }, expect.any(Function));
  });

  it('setBadgeBackgroundColor 应该调用 chrome.action.setBadgeBackgroundColor 并返回 Promise', async () => {
    const { setBadgeBackgroundColor } = chromeHandle.actionMocks;
    const { chromeActionService } = await import('../../src/platform/chrome/action');

    await expect(
      chromeActionService.setBadgeBackgroundColor?.({ color: '#fff' })
    ).resolves.toBeUndefined();
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#fff' }, expect.any(Function));
  });

  it('onClicked 应该注册监听并在销毁时移除监听', async () => {
    const { onClickedAddListener: addListener, onClickedRemoveListener: removeListener } = chromeHandle.actionMocks;
    const { chromeActionService } = await import('../../src/platform/chrome/action');
    const handler = vi.fn();

    const dispose = chromeActionService.onClicked(handler);
    expect(addListener).toHaveBeenCalledTimes(1);
    const wrapped: unknown = addListener.mock.calls[0]?.[0];
    expect(typeof wrapped).toBe('function');
    if (typeof wrapped !== 'function') {
      throw new Error('Expected wrapped listener to be a function');
    }

    // 模拟触发点击回调
    const fakeTab = { id: 123 } as chrome.tabs.Tab;
    await (wrapped as (tab: chrome.tabs.Tab) => unknown)(fakeTab);
    expect(handler).toHaveBeenCalledWith(fakeTab);

    dispose();
    expect(removeListener).toHaveBeenCalledWith(wrapped);
  });
});
