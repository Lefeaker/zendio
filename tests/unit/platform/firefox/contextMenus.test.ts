import { beforeEach, describe, expect, it, vi } from 'vitest';

const firefoxApi = vi.hoisted(() => ({
  contextMenus: {
    create: vi.fn(), update: vi.fn(), removeAll: vi.fn(), refresh: vi.fn(),
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
    onShown: { addListener: vi.fn(), removeListener: vi.fn() }
  }
}));
vi.mock('../../../../src/platform/firefox/utils', () => ({ ensureFirefox: (): typeof firefoxApi => firefoxApi }));

describe('firefoxContextMenusService', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    firefoxApi.contextMenus.create.mockResolvedValue('menu-1');
    firefoxApi.contextMenus.update.mockResolvedValue(undefined);
    firefoxApi.contextMenus.removeAll.mockResolvedValue(undefined);
  });

  it('wraps firefox context menu apis and listeners', async () => {
    const { firefoxContextMenusService } = await import('../../../../src/platform/firefox/contextMenus');
    await expect(firefoxContextMenusService.create({ id: 'menu-1', title: 'Title', contexts: ['all'] })).resolves.toBe('menu-1');
    await firefoxContextMenusService.update('menu-1', { title: 'Next', contexts: ['selection'] });
    await firefoxContextMenusService.removeAll();
    const refresh = firefoxContextMenusService.refresh;
    if (!refresh) {
      throw new Error('refresh api missing');
    }
    refresh();
    expect(firefoxApi.contextMenus.refresh).toHaveBeenCalled();
    const off = firefoxContextMenusService.onClicked(vi.fn());
    expect(firefoxApi.contextMenus.onClicked.addListener).toHaveBeenCalled();
    off();
  });
});
