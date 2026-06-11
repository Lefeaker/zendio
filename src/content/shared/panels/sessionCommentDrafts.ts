export interface SessionCommentDraftItem {
  id: string;
  comment: string;
}

export type SessionCommentDraftSnapshot = Record<string, string>;

export type SessionCommentDraftedItem<T extends SessionCommentDraftItem> = T & {
  draft?: string;
};

interface SessionCommentDraftMutationOptions {
  notify?: boolean;
}

function isSessionCommentDraftMap(
  drafts: SessionCommentDraftSnapshot | ReadonlyMap<string, string>
): drafts is ReadonlyMap<string, string> {
  return 'entries' in drafts && typeof drafts.entries === 'function';
}

interface SessionCommentDraftControllerOptions<T extends SessionCommentDraftItem> {
  datasetKey: string;
  inputSelector: string;
  getItems: () => T[];
  getRoot: () => ParentNode | null;
  submitDraft: (id: string, draft: string) => void | Promise<void>;
  onChange?: (drafts: SessionCommentDraftSnapshot) => void;
}

export class SessionCommentDraftStore {
  private readonly drafts = new Map<string, string>();

  get(id: string): string | undefined {
    return this.drafts.get(id);
  }

  hasDrafts(): boolean {
    return this.drafts.size > 0;
  }

  set(id: string, draft: string, canonicalComment: string): boolean {
    if (draft === canonicalComment) {
      return this.drafts.delete(id);
    }
    const previous = this.drafts.get(id);
    this.drafts.set(id, draft);
    return previous !== draft;
  }

  clear(id: string | null | undefined): boolean {
    if (!id) {
      return false;
    }
    return this.drafts.delete(id);
  }

  clearIfCurrent(id: string | null | undefined, expectedDraft: string): boolean {
    if (!id || this.drafts.get(id) !== expectedDraft) {
      return false;
    }
    return this.drafts.delete(id);
  }

  reconcile(items: SessionCommentDraftItem[]): boolean {
    const commentsById = new Map(items.map((item) => [item.id, item.comment]));
    let changed = false;
    for (const [id, draft] of this.drafts) {
      const comment = commentsById.get(id);
      if (comment === undefined || draft === comment) {
        changed = this.drafts.delete(id) || changed;
      }
    }
    return changed;
  }

  snapshot(): SessionCommentDraftSnapshot {
    return Object.fromEntries(this.drafts.entries());
  }

  hydrate(drafts: SessionCommentDraftSnapshot | ReadonlyMap<string, string>): boolean {
    const next = new Map<string, string>();
    const entries = isSessionCommentDraftMap(drafts) ? drafts.entries() : Object.entries(drafts);
    for (const [id, draft] of entries) {
      if (!id) {
        continue;
      }
      next.set(id, draft);
    }
    const previous = this.snapshot();
    this.drafts.clear();
    for (const [id, draft] of next.entries()) {
      this.drafts.set(id, draft);
    }
    return JSON.stringify(previous) !== JSON.stringify(this.snapshot());
  }
}

export class SessionCommentDraftController<T extends SessionCommentDraftItem> {
  private readonly store = new SessionCommentDraftStore();

  constructor(private readonly options: SessionCommentDraftControllerOptions<T>) {}

  remember(id: string, value: string, options: { notify?: boolean } = {}): void {
    if (this.store.set(id, value, this.findCanonicalComment(id)) && options.notify !== false) {
      this.notifyChange();
    }
  }

  clear(id: string | null | undefined, options: SessionCommentDraftMutationOptions = {}): void {
    if (this.store.clear(id) && options.notify !== false) {
      this.notifyChange();
    }
  }

  restore(
    id: string,
    draft: string | undefined,
    options: SessionCommentDraftMutationOptions = {}
  ): void {
    const changed =
      draft === undefined
        ? this.store.clear(id)
        : this.store.set(id, draft, this.findCanonicalComment(id));
    if (changed && options.notify !== false) {
      this.notifyChange();
    }
  }

  reconcile(items: T[]): void {
    if (this.store.reconcile(items)) {
      this.notifyChange();
    }
  }

  withDraft(item: T): SessionCommentDraftedItem<T> {
    const draft = this.store.get(item.id);
    return draft === undefined ? item : { ...item, draft };
  }

  snapshot(): SessionCommentDraftSnapshot {
    this.captureRenderedInputs();
    return this.store.snapshot();
  }

  hydrate(drafts: SessionCommentDraftSnapshot | ReadonlyMap<string, string>): void {
    this.store.hydrate(drafts);
  }

  bindInput(input: HTMLInputElement | null | undefined, id: string): void {
    input?.addEventListener('input', () => this.remember(id, input.value));
    input?.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing) {
        return;
      }
      event.preventDefault();
      void this.runAsync(() => this.submit(id, input.value));
    });
  }

  captureRenderedInputs(): void {
    this.options
      .getRoot()
      ?.querySelectorAll<HTMLInputElement>(this.options.inputSelector)
      .forEach((input) => {
        const id = input.dataset[this.options.datasetKey];
        if (id) {
          this.remember(id, input.value, { notify: false });
        }
      });
  }

  async submit(id: string, value: string): Promise<void> {
    this.remember(id, value, { notify: false });
    await this.options.submitDraft(id, value);
    if (this.store.clearIfCurrent(id, value)) {
      this.notifyChange();
    }
  }

  runAfterFlush(action: () => void | Promise<void>): Promise<void> {
    this.captureRenderedInputs();
    const task = (async () => {
      if (this.store.hasDrafts()) {
        await this.flush();
      }
      await action();
    })();
    this.observeAsync(task);
    return task;
  }

  private async flush(): Promise<void> {
    this.captureRenderedInputs();
    const validIds = new Set(this.options.getItems().map((item) => item.id));
    const pending = Object.entries(this.store.snapshot()).filter(([id]) => validIds.has(id));
    let changed = false;
    for (const [id, draft] of pending) {
      await this.options.submitDraft(id, draft);
      changed = this.store.clearIfCurrent(id, draft) || changed;
    }
    if (changed) {
      this.notifyChange();
    }
  }

  private findCanonicalComment(id: string): string {
    return this.options.getItems().find((item) => item.id === id)?.comment ?? '';
  }

  private runAsync(action: () => void | Promise<void>): Promise<void> {
    const task = Promise.resolve().then(action);
    this.observeAsync(task);
    return task;
  }

  private observeAsync(task: Promise<void>): void {
    void task.catch((error) => {
      console.warn('[SessionCommentDrafts] Failed to submit session comment draft:', error);
    });
  }

  private notifyChange(): void {
    this.options.onChange?.(this.store.snapshot());
  }
}
