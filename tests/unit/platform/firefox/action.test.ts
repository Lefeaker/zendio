import { beforeEach, describe, expect, it, vi } from 'vitest';

let clickListener: ((tab: browser.tabs.Tab) => void) | undefined;
const firefoxFixture = vi.hoisted(() => {
  const primarySetBadgeText = vi.fn(() => Promise.resolve());
  const primarySetBadgeBackgroundColor = vi.fn(() => Promise.resolve());
  const browserAction = {
    onClicked: {
      addListener: vi.fn((listener: typeof clickListener) => {
        clickListener = listener ?? undefined;
      }),
      removeListener: vi.fn()
    },
    setBadgeText: primarySetBadgeText,
    setBadgeBackgroundColor: primarySetBadgeBackgroundColor
  };
  const action = {
    onClicked: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    setBadgeText: vi.fn(() => Promise.resolve()),
    setBadgeBackgroundColor: vi.fn(() => Promise.resolve())
  };
  return {
    browserAction,
    action,
    primarySetBadgeText,
    primarySetBadgeBackgroundColor,
    api: { browserAction, action }
  };
});
const firefoxApi = firefoxFixture.api;
vi.mock('../../../../src/platform/firefox/utils', () => ({
  ensureFirefox: (): typeof firefoxApi => firefoxApi
}));

describe('firefoxActionService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clickListener = undefined;
    firefoxApi.browserAction = firefoxFixture.browserAction;
    firefoxApi.action = firefoxFixture.action;
    Object.defineProperty(firefoxFixture.browserAction, 'setBadgeText', {
      configurable: true,
      writable: true,
      value: firefoxFixture.primarySetBadgeText
    });
    Object.defineProperty(firefoxFixture.browserAction, 'setBadgeBackgroundColor', {
      configurable: true,
      writable: true,
      value: firefoxFixture.primarySetBadgeBackgroundColor
    });
  });

  it('uses browserAction handlers and badge apis', async () => {
    const { firefoxActionService } = await import('../../../../src/platform/firefox/action');
    const listener = vi.fn();
    const off = firefoxActionService.onClicked(listener);
    if (!clickListener) {
      throw new Error('click listener missing');
    }
    clickListener({ id: 1 } as browser.tabs.Tab);
    expect(listener).toHaveBeenCalled();
    off();
    const setBadgeText = firefoxActionService.setBadgeText;
    const setBadgeBackgroundColor = firefoxActionService.setBadgeBackgroundColor;
    if (!setBadgeText || !setBadgeBackgroundColor) {
      throw new Error('badge apis missing');
    }
    await setBadgeText({ text: '2' });
    await setBadgeBackgroundColor({ color: '#fff' });
    expect(firefoxApi.browserAction.setBadgeText).toHaveBeenCalled();
  });

  it('returns a noop disposer when no click api is available', async () => {
    firefoxApi.browserAction = undefined as unknown as typeof firefoxApi.browserAction;
    firefoxApi.action = undefined as unknown as typeof firefoxApi.action;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { firefoxActionService } = await import('../../../../src/platform/firefox/action');
    const off = firefoxActionService.onClicked(vi.fn());
    off();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('[R01-FIREFOX-ACTION-01] forwards badge text to browserAction with exact details', async () => {
    const { firefoxActionService } = await import('../../../../src/platform/firefox/action');
    const details = { text: '1', tabId: 10 };

    await firefoxActionService.setBadgeText?.(details);

    expect(firefoxFixture.primarySetBadgeText).toHaveBeenCalledTimes(1);
    expect(firefoxFixture.primarySetBadgeText).toHaveBeenCalledWith(details);
    expect(firefoxFixture.action.setBadgeText).not.toHaveBeenCalled();
  });

  it('[R01-FIREFOX-ACTION-02] falls back to action for badge text', async () => {
    Object.defineProperty(firefoxFixture.browserAction, 'setBadgeText', {
      configurable: true,
      writable: true,
      value: undefined
    });
    const { firefoxActionService } = await import('../../../../src/platform/firefox/action');
    const textDetails = { text: '2' };

    await firefoxActionService.setBadgeText?.(textDetails);

    expect(firefoxFixture.action.setBadgeText).toHaveBeenCalledTimes(1);
    expect(firefoxFixture.action.setBadgeText).toHaveBeenCalledWith(textDetails);
  });

  it('[R01-FIREFOX-ACTION-03] forwards clicks through and removes the identical wrapper', async () => {
    const { firefoxActionService } = await import('../../../../src/platform/firefox/action');
    let releaseListener: (() => void) | undefined;
    const listenerGate = new Promise<void>((resolve) => {
      releaseListener = resolve;
    });
    let forwardedListener: Promise<void> | undefined;
    const listener = vi.fn<(tab: chrome.tabs.Tab) => Promise<void>>(() => {
      forwardedListener = listenerGate.then(() => undefined);
      return forwardedListener;
    });

    const dispose = firefoxActionService.onClicked(listener);
    expect(firefoxFixture.browserAction.onClicked.addListener).toHaveBeenCalledTimes(1);
    const wrapped = firefoxFixture.browserAction.onClicked.addListener.mock.calls[0]?.[0];
    if (!wrapped) {
      throw new Error('Firefox click wrapper was not registered');
    }
    const tab = { id: 17 } as browser.tabs.Tab;

    wrapped(tab);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toBe(tab);
    expect(forwardedListener).toBeInstanceOf(Promise);
    if (!forwardedListener) {
      throw new Error('forwarded listener Promise was not captured');
    }
    releaseListener?.();
    await forwardedListener;
    dispose();
    expect(firefoxFixture.browserAction.onClicked.removeListener).toHaveBeenCalledTimes(1);
    expect(firefoxFixture.browserAction.onClicked.removeListener).toHaveBeenCalledWith(wrapped);
  });
});
