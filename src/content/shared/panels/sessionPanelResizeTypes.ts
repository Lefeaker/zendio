export interface SessionPanelResizeStorage {
  load(): Promise<Record<string, unknown>>;
  save(items: Record<string, unknown>): void;
}

export interface SessionPanelResizeOptions {
  storage: SessionPanelResizeStorage;
}
