export type SessionPanelStorageItems = Record<string, unknown>;

export interface SessionPanelResizeStorage {
  load(): Promise<SessionPanelStorageItems>;
  save(items: SessionPanelStorageItems): void | Promise<void>;
}

export interface SessionPanelResizeOptions {
  storage: SessionPanelResizeStorage;
}

export interface SessionPanelLayoutSnapshot {
  width: number;
  maxWidth: number;
  height: number;
  collapsed: boolean | null;
}
