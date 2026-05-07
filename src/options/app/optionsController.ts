import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import { deepClone } from '../utils/clone';
import type { OptionsPersistenceService } from '../services/persistence';
import type { OptionsFormAdapter } from '../components/optionsFormAdapter';

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

function toStoredOptions(options: CompleteOptions | StoredOptions): StoredOptions {
  return options as StoredOptions;
}

type AutoSaveCollector =
  | (() =>
      | CompleteOptions
      | StoredOptions
      | null
      | undefined
      | Promise<CompleteOptions | StoredOptions | null | undefined>)
  | undefined;

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
  private readonly persistence: OptionsPersistenceService;
  private readonly formAdapter: OptionsFormAdapter;
  private readonly autoSaveDebounceMs: number;
  private readonly callbacks: OptionsControllerCallbacks;
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
  }

  scheduleAutoSave(collect?: AutoSaveCollector): void {
    this.cancelAutoSave();
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      void (async () => {
        let draft: CompleteOptions | StoredOptions | null | undefined;

        if (collect) {
          try {
            draft = await collect();
          } catch (error) {
            this.callbacks.onSaveError?.('auto', error);
            return;
          }
        }

        const saveOptions: SaveSnapshotOptions =
          draft === null || draft === undefined ? { reason: 'auto' } : { reason: 'auto', draft };

        try {
          await this.saveSnapshot(saveOptions);
        } catch {
          // saveSnapshot already triggers onSaveError callback; no further action required.
        }
      })();
    }, this.autoSaveDebounceMs);
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
      await this.persistence.save(cloned);
      this.snapshot = toStoredOptions(cloned);
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
    this.setSnapshot(toStoredOptions(options));
    // Fix null assignment error - applyToForm expects StoredOptions | undefined, not null
    await this.applyToForm(this.snapshot || undefined);
    await this.saveSnapshot({ reason: 'import', draft: options });
  }

  dispose(): void {
    this.cancelAutoSave();
    if (this.unsubscribePersistence) {
      this.unsubscribePersistence();
      this.unsubscribePersistence = null;
    }
  }
}

export function createOptionsController(deps: OptionsControllerDeps): OptionsController {
  return new OptionsController(deps);
}
