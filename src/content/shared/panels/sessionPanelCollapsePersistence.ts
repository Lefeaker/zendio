import {
  loadPersistedSessionPanelLayout,
  saveSessionPanelCollapsed
} from './sessionPanelLayoutPersistence';

interface SessionPanelCollapsePersistenceOptions {
  initialCollapsed?: boolean;
  restoreFromStorage?: boolean;
  rerender(): void;
}

export class SessionPanelCollapsePersistence {
  private restoreTask: Promise<void> | null = null;
  private changedBeforeRestore = false;
  private destroyed = false;
  private collapsed: boolean;

  constructor(private readonly options: SessionPanelCollapsePersistenceOptions) {
    this.collapsed = Boolean(options.initialCollapsed);
  }

  get value(): boolean {
    return this.collapsed;
  }

  set(collapsed: boolean, options: { persist?: boolean; rerender?: boolean } = {}): boolean {
    const changed = this.collapsed !== collapsed;
    this.collapsed = collapsed;
    if (options.persist) {
      this.persist(collapsed);
    }
    if (changed && options.rerender !== false) {
      this.options.rerender();
    }
    return changed;
  }

  toggle(options: { persist?: boolean } = {}): void {
    this.set(!this.collapsed, options);
  }

  persist(collapsed: boolean): void {
    this.changedBeforeRestore = true;
    saveSessionPanelCollapsed(collapsed);
  }

  restore(): Promise<void> {
    if (this.options.restoreFromStorage === false) {
      return Promise.resolve();
    }
    if (!this.restoreTask) {
      this.restoreTask = loadPersistedSessionPanelLayout()
        .then((layout) => {
          if (
            this.destroyed ||
            this.changedBeforeRestore ||
            typeof layout.collapsed !== 'boolean'
          ) {
            return;
          }
          this.set(layout.collapsed, { rerender: true });
        })
        .catch(() => undefined);
    }
    return this.restoreTask;
  }

  destroy(): void {
    this.destroyed = true;
  }
}
