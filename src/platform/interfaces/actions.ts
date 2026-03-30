export type ActionClickListener = (tab: chrome.tabs.Tab) => void | Promise<void>;

export interface ActionService {
  onClicked(listener: ActionClickListener): () => void;
  setBadgeText?(details: { text: string; tabId?: number }): Promise<void>;
  setBadgeBackgroundColor?(details: { color: string | [number, number, number, number]; tabId?: number }): Promise<void>;
}
