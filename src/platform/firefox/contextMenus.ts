import type {
  ContextMenuOnClickListener,
  ContextMenuOnShownListener,
  ContextMenusService,
  MenuCreateProperties,
  MenuID,
  MenuUpdateProperties
} from '../interfaces/contextMenus';
import { ensureFirefox } from './utils';

type BrowserContextMenus = typeof browser.contextMenus;
type FirefoxOnClickedListener = Parameters<BrowserContextMenus['onClicked']['addListener']>[0];
type FirefoxOnShownListener = BrowserContextMenus extends { onShown: { addListener(cb: infer T): unknown } } ? T : never;

function getFirefoxMenus(): typeof browser.contextMenus {
  const firefoxApi = ensureFirefox();
  const menus = firefoxApi.contextMenus ?? (firefoxApi as typeof browser & { menus?: typeof browser.contextMenus }).menus;
  if (!menus) {
    throw new Error('Firefox contextMenus API is unavailable');
  }
  return menus;
}

function wrapTab(tab?: browser.tabs.Tab | null): chrome.tabs.Tab | null {
  return (tab as unknown as chrome.tabs.Tab | null | undefined) ?? null;
}

function wrapClickListener(listener: ContextMenuOnClickListener): FirefoxOnClickedListener {
  return (info, tab) => {
    void listener(info as unknown as chrome.contextMenus.OnClickData, wrapTab(tab));
  };
}

function wrapShownListener(listener: ContextMenuOnShownListener): FirefoxOnShownListener {
  return (info, tab) => {
    const clickInfo = {
      menuItemId: Array.isArray(info.menuIds) ? info.menuIds[0] ?? '' : '',
      editable: false,
      ...(info.pageUrl !== undefined && { pageUrl: info.pageUrl })
    } as unknown as chrome.contextMenus.OnClickData;
    void listener(clickInfo, wrapTab(tab));
  };
}

export const firefoxContextMenusService: ContextMenusService = {
  async create(properties: MenuCreateProperties): Promise<MenuID> {
    const menus = getFirefoxMenus();
    const createdId = await Promise.resolve(menus.create(properties as unknown as Parameters<typeof menus.create>[0]));
    return (createdId ?? properties.id ?? '') as MenuID;
  },

  async update(id: MenuID, properties: MenuUpdateProperties): Promise<void> {
    const menus = getFirefoxMenus();
    await Promise.resolve(
      menus.update(id as Parameters<typeof menus.update>[0], properties as unknown as Parameters<typeof menus.update>[1])
    );
  },

  async removeAll(): Promise<void> {
    const menus = getFirefoxMenus();
    await Promise.resolve(menus.removeAll());
  },

  onClicked(listener: ContextMenuOnClickListener): () => void {
    const menus = getFirefoxMenus();
    const wrapped = wrapClickListener(listener);
    menus.onClicked.addListener(wrapped);
    return () => menus.onClicked.removeListener(wrapped);
  },

  onShown(listener: ContextMenuOnShownListener): () => void {
    const menus = getFirefoxMenus();
    if (!menus.onShown) {
      return () => {};
    }
    const wrapped = wrapShownListener(listener);
    menus.onShown.addListener(wrapped);
    return () => menus.onShown?.removeListener(wrapped);
  },

  refresh(): void {
    const menus = getFirefoxMenus();
    void menus.refresh?.();
  }
};
