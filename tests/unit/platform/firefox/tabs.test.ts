import { beforeEach, describe, expect, it, vi } from 'vitest';

const firefoxApi = vi.hoisted(() => ({
  tabs: {
    create: vi.fn(),
    remove: vi.fn(),
    getCurrent: vi.fn(),
    get: vi.fn(),
    query: vi.fn(),
    captureVisibleTab: vi.fn(),
    sendMessage: vi.fn(),
    onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() }
  }
}));
vi.mock('../../../../src/platform/firefox/utils', () => ({
  ensureFirefox: (): typeof firefoxApi => firefoxApi
}));

describe('firefoxTabsService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    firefoxApi.tabs.create = vi.fn().mockResolvedValue({ id: 1 });
    firefoxApi.tabs.remove = vi.fn().mockResolvedValue(undefined);
    firefoxApi.tabs.getCurrent = vi.fn().mockResolvedValue({ id: 2 });
    firefoxApi.tabs.get = vi.fn().mockResolvedValue({ id: 3 });
    firefoxApi.tabs.query = vi.fn().mockResolvedValue([{ id: 4 }]);
    firefoxApi.tabs.captureVisibleTab = vi.fn().mockResolvedValue('data:image/jpeg;base64,frame');
    firefoxApi.tabs.sendMessage = vi.fn().mockResolvedValue({ ok: true });
  });

  it('wraps firefox tabs APIs and listeners', async () => {
    const { firefoxTabsService } = await import('../../../../src/platform/firefox/tabs');
    await expect(firefoxTabsService.create({ url: 'https://example.com' })).resolves.toMatchObject({
      id: 1
    });
    await expect(firefoxTabsService.getCurrent()).resolves.toMatchObject({ id: 2 });
    await expect(firefoxTabsService.get(3)).resolves.toMatchObject({ id: 3 });
    await expect(firefoxTabsService.query({})).resolves.toEqual([{ id: 4 }]);
    await expect(firefoxTabsService.sendMessage(4, { ping: true })).resolves.toEqual({ ok: true });
    const off = firefoxTabsService.onActivated(vi.fn());
    expect(firefoxApi.tabs.onActivated.addListener).toHaveBeenCalled();
    off();
  });

  it('returns safe defaults when optional Firefox tab methods are unavailable', async () => {
    const { firefoxTabsService } = await import('../../../../src/platform/firefox/tabs');
    Object.defineProperty(firefoxApi.tabs, 'query', {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(firefoxApi.tabs, 'get', {
      configurable: true,
      value: undefined
    });
    await expect(firefoxTabsService.query({})).resolves.toEqual([]);
    await expect(firefoxTabsService.get(3)).resolves.toBeUndefined();
  });

  it('wraps visible-tab capture with and without an explicit window id', async () => {
    const { firefoxTabsService } = await import('../../../../src/platform/firefox/tabs');
    if (!firefoxTabsService.captureVisibleTab) {
      throw new Error('captureVisibleTab missing');
    }

    await expect(
      firefoxTabsService.captureVisibleTab(5, { format: 'jpeg', quality: 88 })
    ).resolves.toBe('data:image/jpeg;base64,frame');
    expect(firefoxApi.tabs.captureVisibleTab).toHaveBeenCalledWith(5, {
      format: 'jpeg',
      quality: 88
    });

    await expect(firefoxTabsService.captureVisibleTab(undefined, { format: 'png' })).resolves.toBe(
      'data:image/jpeg;base64,frame'
    );
    expect(firefoxApi.tabs.captureVisibleTab).toHaveBeenLastCalledWith({ format: 'png' });

    Object.defineProperty(firefoxApi.tabs, 'captureVisibleTab', {
      configurable: true,
      value: undefined
    });
    await expect(
      firefoxTabsService.captureVisibleTab(5, { format: 'jpeg', quality: 88 })
    ).resolves.toBeUndefined();
  });
});
