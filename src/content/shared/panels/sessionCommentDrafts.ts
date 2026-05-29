export interface SessionCommentDraftItem {
  id: string;
  comment: string;
}

export type SessionCommentDraftedItem<T extends SessionCommentDraftItem> = T & {
  draft?: string;
};

interface SessionCommentDraftControllerOptions<T extends SessionCommentDraftItem> {
  datasetKey: string;
  inputSelector: string;
  getItems: () => T[];
  getRoot: () => ParentNode | null;
  submitDraft: (id: string, draft: string) => void | Promise<void>;
}

export class SessionCommentDraftStore {
  private readonly drafts = new Map<string, string>();

  get(id: string): string | undefined {
    return this.drafts.get(id);
  }

  hasDrafts(): boolean {
    return this.drafts.size > 0;
  }

  set(id: string, draft: string, canonicalComment: string): void {
    if (draft === canonicalComment) {
      this.drafts.delete(id);
      return;
    }
    this.drafts.set(id, draft);
  }

  clear(id: string | null | undefined): void {
    if (!id) {
      return;
    }
    this.drafts.delete(id);
  }

  reconcile(items: SessionCommentDraftItem[]): void {
    const commentsById = new Map(items.map((item) => [item.id, item.comment]));
    for (const [id, draft] of this.drafts) {
      const comment = commentsById.get(id);
      if (comment === undefined || draft === comment) {
        this.drafts.delete(id);
      }
    }
  }
}

export class SessionCommentDraftController<T extends SessionCommentDraftItem> {
  private readonly store = new SessionCommentDraftStore();

  constructor(private readonly options: SessionCommentDraftControllerOptions<T>) {}

  remember(id: string, value: string): void {
    this.store.set(id, value, this.findCanonicalComment(id));
  }

  clear(id: string | null | undefined): void {
    this.store.clear(id);
  }

  reconcile(items: T[]): void {
    this.store.reconcile(items);
  }

  withDraft(item: T): SessionCommentDraftedItem<T> {
    const draft = this.store.get(item.id);
    return draft === undefined ? item : { ...item, draft };
  }

  bindInput(input: HTMLInputElement | null | undefined, id: string): void {
    input?.addEventListener('input', () => this.remember(id, input.value));
    input?.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent) || event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      void this.submit(id, input.value);
    });
  }

  captureRenderedInputs(): void {
    this.options
      .getRoot()
      ?.querySelectorAll<HTMLInputElement>(this.options.inputSelector)
      .forEach((input) => {
        const id = input.dataset[this.options.datasetKey];
        if (id) {
          this.remember(id, input.value);
        }
      });
  }

  async submit(id: string, value: string): Promise<void> {
    this.remember(id, value);
    await this.options.submitDraft(id, value);
    this.store.clear(id);
  }

  runAfterFlush(action: () => void | Promise<void>): void {
    this.captureRenderedInputs();
    if (!this.store.hasDrafts()) {
      void action();
      return;
    }
    void this.flush().then(action);
  }

  private async flush(): Promise<void> {
    this.captureRenderedInputs();
    for (const item of this.options.getItems()) {
      const draft = this.store.get(item.id);
      if (draft === undefined) {
        continue;
      }
      await this.options.submitDraft(item.id, draft);
      this.store.clear(item.id);
    }
  }

  private findCanonicalComment(id: string): string {
    return this.options.getItems().find((item) => item.id === id)?.comment ?? '';
  }
}
