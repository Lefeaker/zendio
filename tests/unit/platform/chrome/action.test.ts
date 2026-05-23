import { beforeEach, describe, expect, it, vi } from 'vitest';

let clickListener: ((tab: chrome.tabs.Tab) => void) | undefined;
const chromeApi = vi.hoisted(() => ({
  action: {
    onClicked: {
      addListener: vi.fn((listener: typeof clickListener) => {
        clickListener = listener ?? undefined;
      }),
      removeListener: vi.fn()
    },
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn()
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
    clickListener = undefined;
    chromeApi.action.setBadgeText.mockImplementation(
      (_details: { text: string; tabId?: number }, cb: () => void) => cb()
    );
    chromeApi.action.setBadgeBackgroundColor.mockImplementation(
      (
        _details: { color: string | [number, number, number, number]; tabId?: number },
        cb: () => void
      ) => cb()
    );
  });

  it('registers click listeners and updates badge state', async () => {
    const { chromeActionService } = await import('../../../../src/platform/chrome/action');
    const listener = vi.fn(() => Promise.resolve(undefined));
    const off = chromeActionService.onClicked(listener);
    if (!clickListener) {
      throw new Error('click listener missing');
    }
    clickListener({ id: 9 } as chrome.tabs.Tab);
    expect(listener).toHaveBeenCalled();
    off();
    const setBadgeText = chromeActionService.setBadgeText;
    const setBadgeBackgroundColor = chromeActionService.setBadgeBackgroundColor;
    if (!setBadgeText || !setBadgeBackgroundColor) {
      throw new Error('badge apis missing');
    }
    await setBadgeText({ text: '1' });
    await setBadgeBackgroundColor({ color: '#fff' });
    expect(chromeApi.action.setBadgeText).toHaveBeenCalled();
  });
});
