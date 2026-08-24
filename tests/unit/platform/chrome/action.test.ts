import { beforeEach, describe, expect, it, vi } from 'vitest';

type ChromeClickListener = (tab: chrome.tabs.Tab) => void;
type ChromeBadgeTextDetails = { text: string; tabId?: number };
type ChromeBadgeColorDetails = {
  color: string | [number, number, number, number];
  tabId?: number;
};

const chromeApi = vi.hoisted(() => ({
  action: {
    onClicked: {
      addListener: vi.fn<(listener: ChromeClickListener) => void>(),
      removeListener: vi.fn<(listener: ChromeClickListener) => void>()
    },
    setBadgeText: vi.fn<(details: ChromeBadgeTextDetails, callback: () => void) => void>(),
    setBadgeBackgroundColor:
      vi.fn<(details: ChromeBadgeColorDetails, callback: () => void) => void>()
  }
}));
const lastErrorMock = vi.hoisted(() =>
  vi.fn<(...args: []) => chrome.runtime.LastError | null>(() => null)
);
const suppressLastErrorMock = vi.hoisted(() => vi.fn());
const handleMock = vi.hoisted(() => vi.fn());
const runtimeErrorMock = vi.hoisted(() => vi.fn((message: string) => new Error(message)));

vi.mock('../../../../src/platform/chrome/utils', () => ({
  ensureChrome: (): typeof chromeApi => chromeApi,
  getChromeLastError: (): chrome.runtime.LastError | null => lastErrorMock(),
  suppressLastError: suppressLastErrorMock,
  normalizePromise: <T>(
    executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
  ) => new Promise<T>(executor)
}));
vi.mock('../../../../src/shared/errors', () => ({
  chromeApiErrors: { runtimeError: runtimeErrorMock },
  errorHandler: { handle: handleMock }
}));

describe('chromeActionService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    chromeApi.action.setBadgeText.mockImplementation(
      (_details: ChromeBadgeTextDetails, callback: () => void) => callback()
    );
    chromeApi.action.setBadgeBackgroundColor.mockImplementation(
      (_details: ChromeBadgeColorDetails, callback: () => void) => callback()
    );
  });

  it('[R01-CHROME-01] setBadgeText forwards exact details and resolves only after the Chrome callback', async () => {
    const { chromeActionService } = await import('../../../../src/platform/chrome/action');
    const setBadgeText = chromeActionService.setBadgeText;
    if (!setBadgeText) {
      throw new Error('setBadgeText is unavailable');
    }
    let callback: (() => void) | undefined;
    chromeApi.action.setBadgeText.mockImplementation((_details, capturedCallback) => {
      callback = capturedCallback;
    });
    const details = { text: '1', tabId: 9 };
    let settled = false;

    const pending = setBadgeText(details).then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(chromeApi.action.setBadgeText).toHaveBeenCalledTimes(1);
    expect(chromeApi.action.setBadgeText).toHaveBeenCalledWith(details, callback);
    expect(callback).toBeTypeOf('function');
    callback?.();
    await pending;
    expect(settled).toBe(true);
  });

  it('[R01-CHROME-02] setBadgeBackgroundColor forwards exact details and resolves only after the Chrome callback', async () => {
    const { chromeActionService } = await import('../../../../src/platform/chrome/action');
    const setBadgeBackgroundColor = chromeActionService.setBadgeBackgroundColor;
    if (!setBadgeBackgroundColor) {
      throw new Error('setBadgeBackgroundColor is unavailable');
    }
    let callback: (() => void) | undefined;
    chromeApi.action.setBadgeBackgroundColor.mockImplementation((_details, capturedCallback) => {
      callback = capturedCallback;
    });
    const details = { color: [1, 2, 3, 255] as [number, number, number, number], tabId: 11 };
    let settled = false;

    const pending = setBadgeBackgroundColor(details).then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(chromeApi.action.setBadgeBackgroundColor).toHaveBeenCalledTimes(1);
    expect(chromeApi.action.setBadgeBackgroundColor).toHaveBeenCalledWith(details, callback);
    expect(callback).toBeTypeOf('function');
    callback?.();
    await pending;
    expect(settled).toBe(true);
  });

  it('[R01-CHROME-03] onClicked forwards through one wrapper and removes that same wrapper on dispose', async () => {
    const { chromeActionService } = await import('../../../../src/platform/chrome/action');
    let releaseHandler: (() => void) | undefined;
    const handlerGate = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    let forwardedHandler: Promise<void> | undefined;
    const handler = vi.fn<(tab: chrome.tabs.Tab) => Promise<void>>(() => {
      forwardedHandler = handlerGate.then(() => undefined);
      return forwardedHandler;
    });

    const dispose = chromeActionService.onClicked(handler);
    expect(chromeApi.action.onClicked.addListener).toHaveBeenCalledTimes(1);
    const wrapped = chromeApi.action.onClicked.addListener.mock.calls[0]?.[0];
    if (!wrapped) {
      throw new Error('click wrapper was not registered');
    }
    const tab = { id: 9 } as chrome.tabs.Tab;

    wrapped(tab);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(tab);
    expect(handler.mock.calls[0]?.[0]).toBe(tab);
    expect(forwardedHandler).toBeInstanceOf(Promise);
    if (!forwardedHandler) {
      throw new Error('forwarded handler Promise was not captured');
    }
    releaseHandler?.();
    await forwardedHandler;
    dispose();
    expect(chromeApi.action.onClicked.removeListener).toHaveBeenCalledTimes(1);
    expect(chromeApi.action.onClicked.removeListener).toHaveBeenCalledWith(wrapped);
  });
});
