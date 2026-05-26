export type MenuID = number | string;

export interface MenuCreateProperties extends chrome.contextMenus.CreateProperties {}
export interface MenuUpdateProperties extends Omit<chrome.contextMenus.CreateProperties, 'id'> {}
export interface MenuClickData extends chrome.contextMenus.OnClickData {}

export type ContextMenuOnClickListener = (
  info: MenuClickData,
  tab?: chrome.tabs.Tab | null
) => void | Promise<void>;
export type ContextMenuOnShownListener = (
  info: MenuClickData,
  tab?: chrome.tabs.Tab | null
) => void | Promise<void>;

export interface ContextMenusService {
  create: (properties: MenuCreateProperties) => Promise<MenuID>;
  update: (id: MenuID, properties: MenuUpdateProperties) => Promise<void>;
  removeAll: () => Promise<void>;
  onClicked: (listener: ContextMenuOnClickListener) => () => void;
  onShown: (listener: ContextMenuOnShownListener) => () => void;
  refresh?: () => void;
}
