import { beforeEach, describe, expect, it, vi } from 'vitest';

let clickedListener: ((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab | null) => void) | undefined;
let shownListener: ((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab | null) => void) | undefined;
const chromeApi = vi.hoisted(() => ({
  contextMenus: {
    create: vi.fn(), update: vi.fn(), removeAll: vi.fn(), refresh: vi.fn(),
    onClicked: { addListener: vi.fn((listener: typeof clickedListener) => { clickedListener = listener ?? undefined; }), removeListener: vi.fn() },
    onShown: { addListener: vi.fn((listener: typeof shownListener) => { shownListener = listener ?? undefined; }), removeListener: vi.fn() }
  }
}));
const lastErrorMock = vi.hoisted(() => vi.fn<[], chrome.runtime.LastError | null>(() => null));
const suppressLastErrorMock = vi.hoisted(() => vi.fn());
const handleMock = vi.hoisted(() => vi.fn());
const runtimeErrorMock = vi.hoisted(() => vi.fn((message: string) => new Error(message)));

vi.mock('../../../../src/platform/chrome/utils', () => ({
  ensureChrome: (): typeof chromeApi => chromeApi,
  getChromeLastError: (): chrome.runtime.LastError | null => lastErrorMock(),
  suppressLastError: suppressLastErrorMock,
  normalizePromise: <T>(executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) => new Promise<T>(executor)
}));
vi.mock('../../../../src/shared/errors', () => ({ chromeApiErrors: { runtimeError: runtimeErrorMock }, errorHandler: { handle: handleMock } }));

describe('chromeContextMenusService', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); clickedListener = undefined; shownListener = undefined;
    chromeApi.contextMenus.create.mockReturnValue('menu-1');
    chromeApi.contextMenus.update.mockImplementation((_id: string, _props: Record<string, unknown>, cb: () => void) => cb());
    chromeApi.contextMenus.removeAll.mockImplementation((cb: () => void) => cb());
  });

  it('creates updates removes and refreshes menus and listeners', async () => {
    const { chromeContextMenusService } = await import('../../../../src/platform/chrome/contextMenus');
    await expect(chromeContextMenusService.create({ id: 'menu-1', title: 'Title', contexts: ['all'] })).resolves.toBe('menu-1');
    await chromeContextMenusService.update('menu-1', { title: 'Next', contexts: ['selection'] });
    await chromeContextMenusService.removeAll();
    const refresh = chromeContextMenusService.refresh;
    if (!refresh) {
      throw new Error('refresh api missing');
    }
    refresh();
    expect(chromeApi.contextMenus.refresh).toHaveBeenCalled();

    const clickHandler = vi.fn(() => Promise.resolve(undefined));
    chromeContextMenusService.onClicked(clickHandler);
    if (!clickedListener) {
      throw new Error('clicked listener missing');
    }
    clickedListener(
      { menuItemId: 'menu-1', pageUrl: 'https://example.com' } as chrome.contextMenus.OnClickData,
      { id: 1 } as chrome.tabs.Tab
    );
    expect(clickHandler).toHaveBeenCalled();

    const shownHandler = vi.fn();
    chromeContextMenusService.onShown(shownHandler);
    if (!shownListener) {
      throw new Error('shown listener missing');
    }
    shownListener(
      { menuItemId: 'menu-1', pageUrl: 'https://example.com' } as chrome.contextMenus.OnClickData,
      { id: 1 } as chrome.tabs.Tab
    );
    expect(shownHandler).toHaveBeenCalled();
  });

  it('rejects create when chrome lastError is present', async () => {
    const { chromeContextMenusService } = await import('../../../../src/platform/chrome/contextMenus');
    lastErrorMock.mockReturnValueOnce({ message: 'create failed' } as chrome.runtime.LastError);
    await expect(
      chromeContextMenusService.create({ id: 'bad-menu', title: 'Bad', contexts: ['all'] })
    ).rejects.toBeInstanceOf(Error);
    expect(handleMock).toHaveBeenCalled();
  });

});
