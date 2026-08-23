export type TabActivatedListener = (activeInfo: chrome.tabs.OnActivatedInfo) => void;
export type TabUpdatedListener = (
  tabId: number,
  changeInfo: chrome.tabs.OnUpdatedInfo,
  tab: chrome.tabs.Tab
) => void;
export type TabRemovedListener = (tabId: number, removeInfo: chrome.tabs.OnRemovedInfo) => void;

export interface TabsSendOptions {
  frameId?: number;
}

export type TabsBoundaryErrorCode = 'TAB_NOT_FOUND' | 'NO_RECEIVER';

export class TabsBoundaryError extends Error {
  constructor(readonly code: TabsBoundaryErrorCode) {
    super(code);
    this.name = 'TabsBoundaryError';
  }
}

export function isTabsBoundaryError(
  value: unknown,
  code?: TabsBoundaryErrorCode
): value is TabsBoundaryError {
  return value instanceof TabsBoundaryError && (code === undefined || value.code === code);
}

export interface VisibleTabCaptureOptions {
  format?: 'jpeg' | 'png';
  quality?: number;
}

export interface TabsService {
  create(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab | undefined>;
  remove(tabId: number): Promise<void>;
  getCurrent(): Promise<chrome.tabs.Tab | undefined>;
  get(tabId: number): Promise<chrome.tabs.Tab | undefined>;
  query(queryInfo?: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
  captureVisibleTab?(
    windowId?: number,
    options?: VisibleTabCaptureOptions
  ): Promise<string | undefined>;
  sendMessage<TResult = unknown>(
    tabId: number,
    message: unknown,
    options?: TabsSendOptions
  ): Promise<TResult>;
  onActivated(listener: TabActivatedListener): () => void;
  onUpdated(listener: TabUpdatedListener): () => void;
  onRemoved(listener: TabRemovedListener): () => void;
}
