import { beforeEach, describe, expect, it, vi } from 'vitest';

const firefoxApi = vi.hoisted(() => ({
  tabs: {
    create: vi.fn(), remove: vi.fn(), getCurrent: vi.fn(), get: vi.fn(), query: vi.fn(), sendMessage: vi.fn(),
    onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() }
  }
}));
vi.mock('../../../../src/platform/firefox/utils', () => ({ ensureFirefox: (): typeof firefoxApi => firefoxApi }));

describe('firefoxTabsService', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    firefoxApi.tabs.create.mockResolvedValue({ id: 1 });
    firefoxApi.tabs.remove.mockResolvedValue(undefined);
    firefoxApi.tabs.getCurrent.mockResolvedValue({ id: 2 });
    firefoxApi.tabs.get.mockResolvedValue({ id: 3 });
    firefoxApi.tabs.query.mockResolvedValue([{ id: 4 }]);
    firefoxApi.tabs.sendMessage.mockResolvedValue({ ok: true });
  });

  it('wraps firefox tabs APIs and listeners', async () => {
    const { firefoxTabsService } = await import('../../../../src/platform/firefox/tabs');
    await expect(firefoxTabsService.create({ url: 'https://example.com' })).resolves.toMatchObject({ id: 1 });
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
    firefoxApi.tabs.query = undefined as unknown as typeof firefoxApi.tabs.query;
    firefoxApi.tabs.get = undefined as unknown as typeof firefoxApi.tabs.get;
    await expect(firefoxTabsService.query({})).resolves.toEqual([]);
    await expect(firefoxTabsService.get(3)).resolves.toBeUndefined();
  });

});
