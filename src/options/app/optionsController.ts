import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import { deepClone } from '../utils/clone';
import type { OptionsPersistenceService } from '../services/persistence';
import type { OptionsFormAdapter } from '../components/optionsFormAdapter';
import {
  createOptionsControllerDurability,
  type OptionsControllerDurability
} from './optionsControllerDurability';

export type SaveReason = 'manual' | 'auto' | 'import';

export interface OptionsControllerCallbacks {
  onSaveSuccess?: (reason: SaveReason, saved: CompleteOptions | StoredOptions) => void;
  onSaveError?: (reason: SaveReason, error: unknown) => void;
}

export interface OptionsControllerDeps extends OptionsControllerCallbacks {
  persistence: OptionsPersistenceService;
  formAdapter: OptionsFormAdapter;
  autoSaveDebounceMs?: number;
}

export interface SaveSnapshotOptions {
  reason: SaveReason;
  draft?: CompleteOptions | StoredOptions;
}

type AutoSaveCollector =
  | (() =>
      | CompleteOptions
      | StoredOptions
      | null
      | undefined
      | Promise<CompleteOptions | StoredOptions | null | undefined>)
  | undefined;

function isAsyncAutoSaveDraft(
  value:
    | CompleteOptions
    | StoredOptions
    | null
    | undefined
    | Promise<CompleteOptions | StoredOptions | null | undefined>
): value is Promise<CompleteOptions | StoredOptions | null | undefined> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

function buildCallbacks(callbacks: OptionsControllerCallbacks): OptionsControllerCallbacks {
  const result: Partial<OptionsControllerCallbacks> = {};
  if (callbacks.onSaveError) {
    result.onSaveError = callbacks.onSaveError;
  }
  if (callbacks.onSaveSuccess) {
    result.onSaveSuccess = callbacks.onSaveSuccess;
  }
  return result;
}

export class OptionsController {
  private snapshot: StoredOptions | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAutoSaveCollector: AutoSaveCollector;
  private hasPendingAutoSave = false;
  private readonly persistence: OptionsPersistenceService;
  private readonly formAdapter: OptionsFormAdapter;
  private readonly autoSaveDebounceMs: number;
  private readonly callbacks: OptionsControllerCallbacks;
  private readonly autoSaveDurability: OptionsControllerDurability;
  private unsubscribePersistence: (() => void) | null = null;

  constructor({
    persistence,
    formAdapter,
    autoSaveDebounceMs = 400,
    onSaveError,
    onSaveSuccess
  }: OptionsControllerDeps) {
    this.persistence = persistence;
    this.formAdapter = formAdapter;
    this.autoSaveDebounceMs = autoSaveDebounceMs;
    this.callbacks = buildCallbacks({
      ...(onSaveError !== undefined && { onSaveError }),
      ...(onSaveSuccess !== undefined && { onSaveSuccess })
    });
    this.autoSaveDurability = createOptionsControllerDurability({
      persist: async (draft) => {
        await this.saveSnapshot({ reason: 'auto', draft });
      }
    });

    if (typeof persistence.subscribe === 'function') {
      this.unsubscribePersistence = persistence.subscribe((options) => {
        this.setSnapshot(options);
      });
    }
  }

  getSnapshot(): StoredOptions | null {
    return this.snapshot ? deepClone(this.snapshot) : null;
  }

  setSnapshot(options: StoredOptions): void {
    this.snapshot = deepClone(options);
  }

  readForm(): CompleteOptions {
    return this.formAdapter.read(this.snapshot);
  }

  cancelAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.pendingAutoSaveCollector = undefined;
    this.hasPendingAutoSave = false;
  }

  scheduleAutoSave(collect?: AutoSaveCollector): void {
    this.cancelAutoSave();
    this.pendingAutoSaveCollector = collect;
    this.hasPendingAutoSave = true;
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      void this.handoffPendingAutoSave().catch(() => undefined);
    }, this.autoSaveDebounceMs);
  }

  async flushPendingAutoSave(): Promise<void> {
    while (this.hasPendingAutoSave) {
      await this.handoffPendingAutoSave();
    }
    await this.autoSaveDurability.flush();
    while (this.hasPendingAutoSave) {
      await this.handoffPendingAutoSave();
      await this.autoSaveDurability.flush();
    }
  }

  private async handoffPendingAutoSave(): Promise<void> {
    if (!this.hasPendingAutoSave) return;
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    const collect = this.pendingAutoSaveCollector;
    this.pendingAutoSaveCollector = undefined;
    this.hasPendingAutoSave = false;

    let draft: CompleteOptions | StoredOptions | null | undefined;
    if (collect) {
      try {
        const collected = collect();
        draft = isAsyncAutoSaveDraft(collected) ? await collected : collected;
      } catch (error) {
        this.callbacks.onSaveError?.('auto', error);
        if (!this.hasPendingAutoSave) {
          this.pendingAutoSaveCollector = collect;
          this.hasPendingAutoSave = true;
          throw error;
        }
        return;
      }
    }

    const desired = draft ?? this.formAdapter.read(this.snapshot);
    this.autoSaveDurability.enqueue(desired);
  }

  async loadInitialState(): Promise<StoredOptions> {
    const stored = await this.persistence.load();
    this.setSnapshot(stored);
    return stored;
  }

  async loadRaw(): Promise<StoredOptions> {
    const stored = await this.persistence.load();
    this.setSnapshot(stored);
    return stored;
  }

  async applyToForm(options?: StoredOptions): Promise<void> {
    const target = options ?? this.snapshot ?? {};
    await this.formAdapter.apply(target);
  }

  async saveSnapshot({
    reason,
    draft
  }: SaveSnapshotOptions): Promise<CompleteOptions | StoredOptions> {
    const payload = draft ?? this.formAdapter.read(this.snapshot);
    const cloned = deepClone(payload);
    try {
      if (reason === 'import' && this.persistence.replace) {
        await this.persistence.replace(cloned);
      } else {
        await this.persistence.save(cloned);
      }
      this.snapshot = cloned;
      this.callbacks.onSaveSuccess?.(reason, cloned);
    } catch (error) {
      this.callbacks.onSaveError?.(reason, error);
      throw error;
    }
    return cloned;
  }

  async saveRaw(options: StoredOptions | CompleteOptions): Promise<void> {
    await this.saveSnapshot({ reason: 'manual', draft: options });
  }

  async applyImportedConfig(options: CompleteOptions): Promise<void> {
    this.setSnapshot(options);
    // Fix null assignment error - applyToForm expects StoredOptions | undefined, not null
    await this.applyToForm(this.snapshot || undefined);
    await this.saveSnapshot({ reason: 'import', draft: options });
  }

  async dispose(): Promise<void> {
    await this.flushPendingAutoSave();
    if (this.unsubscribePersistence) {
      this.unsubscribePersistence();
      this.unsubscribePersistence = null;
    }
  }
}

export function createOptionsController(deps: OptionsControllerDeps): OptionsController {
  return new OptionsController(deps);
}
