export interface SessionPanelResizeStorage {
  load(): Promise<Record<string, unknown>>;
  save(items: Record<string, unknown>): void | Promise<void>;
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
