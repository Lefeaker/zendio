import type { CompleteOptions, StoredOptions } from '@shared/types/options';

export type FormSectionKey = string;

export interface FormSectionHandlers {
  applySnapshot(options: StoredOptions): Promise<void> | void;
  collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> | null | undefined;
}

export class FormSectionRegistry {
  private readonly sections = new Map<FormSectionKey, FormSectionHandlers>();
  private lastOptionsSnapshot: StoredOptions | null = null;

  register(key: FormSectionKey, handlers: FormSectionHandlers): void {
    this.sections.set(key, handlers);
    if (this.lastOptionsSnapshot) {
      void handlers.applySnapshot(this.lastOptionsSnapshot);
    }
  }

  unregister(key: FormSectionKey, handlers: FormSectionHandlers): void {
    const current = this.sections.get(key);
    if (current === handlers) {
      this.sections.delete(key);
    }
  }

  async apply(options: StoredOptions): Promise<void> {
    this.lastOptionsSnapshot = options;
    for (const handlers of this.sections.values()) {
      await handlers.applySnapshot(options);
    }
  }

  collect(previous: StoredOptions | null): Partial<CompleteOptions> {
    const result: Partial<CompleteOptions> = {};
    for (const handlers of this.sections.values()) {
      const partial = handlers.collectChanges(previous);
      if (partial && typeof partial === 'object') {
        Object.assign(result, partial);
      }
    }
    return result;
  }

  clear(): void {
    this.sections.clear();
    this.lastOptionsSnapshot = null;
  }

  get size(): number {
    return this.sections.size;
  }
}
