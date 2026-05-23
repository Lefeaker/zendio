import { beforeEach, describe, expect, it, vi } from 'vitest';

function createTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    id: 1,
    index: 0,
    windowId: 1,
    highlighted: false,
    active: true,
    pinned: false,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    frozen: false,
    groupId: -1,
    ...overrides
  };
}

let activatedListener: ((info: chrome.tabs.OnActivatedInfo) => void) | undefined;
const chromeApi = vi.hoisted(() => ({
  tabs: {
    create: vi.fn(),
    remove: vi.fn(),
    getCurrent: vi.fn(),
    get: vi.fn(),
    query: vi.fn(),
    sendMessage: vi.fn(),
    onActivated: {
      addListener: vi.fn((listener: (info: chrome.tabs.OnActivatedInfo) => void) => {
        activatedListener = listener;
      }),
      removeListener: vi.fn()
    },
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() }
  }
}));
const lastErrorMock = vi.hoisted(() =>
  vi.fn<(...args: []) => chrome.runtime.LastError | null>(() => null)
);
const suppressLastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/platform/chrome/utils', () => ({
  ensureChrome: (): typeof chromeApi => chromeApi,
  getChromeLastError: (): chrome.runtime.LastError | null => lastErrorMock(),
  suppressLastError: suppressLastErrorMock,
  normalizePromise: <T>(
    executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
  ) => new Promise<T>(executor)
}));

describe('chromeTabsService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    activatedListener = undefined;
    chromeApi.tabs.create.mockImplementation(
      (props: chrome.tabs.CreateProperties, cb: (tab?: chrome.tabs.Tab) => void) =>
        cb(createTab({ id: 1, ...props }))
    );
    chromeApi.tabs.remove.mockImplementation((_id: number, cb: () => void) => cb());
    chromeApi.tabs.getCurrent.mockImplementation((cb: (tab?: chrome.tabs.Tab) => void) =>
      cb(createTab({ id: 2 }))
    );
    chromeApi.tabs.get.mockImplementation((id: number, cb: (tab?: chrome.tabs.Tab) => void) =>
      cb(createTab({ id }))
    );
    chromeApi.tabs.query.mockImplementation(
      (_info: chrome.tabs.QueryInfo, cb: (tabs: chrome.tabs.Tab[]) => void) =>
        cb([createTab({ id: 3 })])
    );
    chromeApi.tabs.sendMessage.mockImplementation(
      (
        _id: number,
        _msg: unknown,
        _opt: chrome.tabs.MessageSendOptions,
        cb: (response?: unknown) => void
      ) => cb({ ok: true })
    );
  });

  it('wraps tab CRUD messaging and listeners', async () => {
    const { chromeTabsService } = await import('../../../../src/platform/chrome/tabs');
    await expect(chromeTabsService.create({ url: 'https://example.com' })).resolves.toMatchObject({
      id: 1
    });
    await expect(chromeTabsService.getCurrent()).resolves.toMatchObject({ id: 2 });
    await expect(chromeTabsService.get(9)).resolves.toMatchObject({ id: 9 });
    await expect(chromeTabsService.query({})).resolves.toEqual([
      expect.objectContaining({ id: 3 })
    ]);
    await expect(chromeTabsService.sendMessage(3, { ping: true })).resolves.toEqual({ ok: true });
    const onActivated = vi.fn();
    const off = chromeTabsService.onActivated(onActivated);
    activatedListener?.({ tabId: 5, windowId: 1 });
    expect(onActivated).toHaveBeenCalled();
    off();
  });

  it('rejects create when chrome reports a lastError', async () => {
    const { chromeTabsService } = await import('../../../../src/platform/chrome/tabs');
    lastErrorMock.mockReturnValueOnce({ message: 'boom' } as chrome.runtime.LastError);
    await expect(chromeTabsService.create({ url: 'https://example.com' })).rejects.toMatchObject({
      message: 'boom'
    });
  });
});
