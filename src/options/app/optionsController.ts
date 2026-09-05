import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import { mergeOptions } from '../../shared/config/optionsMerger';
import { deepClone } from '../utils/clone';
import type { OptionsPersistenceService } from '../services/persistence';
import type { OptionsFormAdapter } from '../components/optionsFormAdapter';
import {
  createOptionsControllerDurability,
  type OptionsControllerDurability
} from './optionsControllerDurability';
import {
  createOptionsDraftSession,
  type MountedDraftRebase,
  type OptionsDraftSession,
  type OptionsDraftSessionTransition
} from './optionsDraftSession';

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

type AutoSaveCollector = (() => CompleteOptions | StoredOptions | null | undefined) | undefined;

type MountedDraftRebaseListener = (draft: CompleteOptions, transition: MountedDraftRebase) => void;

export class OptionsController {
  private snapshot: StoredOptions | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private hasPendingAutoSave = false;
  private readonly persistence: OptionsPersistenceService;
  private readonly formAdapter: OptionsFormAdapter;
  private readonly autoSaveDebounceMs: number;
  private readonly callbacks: OptionsControllerCallbacks;
  private readonly autoSaveDurability: OptionsControllerDurability;
  private draftSession: OptionsDraftSession | null = null;
  private mountedDraftRebase: MountedDraftRebaseListener | null = null;
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
    this.callbacks = {
      ...(onSaveError !== undefined && { onSaveError }),
      ...(onSaveSuccess !== undefined && { onSaveSuccess })
    };
    this.autoSaveDurability = createOptionsControllerDurability({
      persist: async ({ intent, reason }) => {
        this.requireDraftSession().admit(intent);
        try {
          const acknowledged = mergeOptions(await this.persistence.save(intent.patches));
          const transition = this.requireDraftSession().acknowledge(intent, acknowledged);
          this.snapshot = this.requireDraftSession().getAuthoritativeSnapshot();
          this.applyMountedTransition(transition);
          if (this.requireDraftSession().getDirtyPathKeys().length === 0)
            this.autoSaveDurability.discardRetryable();
          this.callbacks.onSaveSuccess?.(reason, this.requireDraftSession().getWorkingDraft());
        } catch (error) {
          this.draftSession?.fail(intent);
          this.callbacks.onSaveError?.(reason, error);
          throw error;
        }
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
    if (!this.draftSession) return;
    const transition = this.draftSession.observeAuthoritative(mergeOptions(options));
    this.snapshot = this.draftSession.getAuthoritativeSnapshot();
    this.applyMountedTransition(transition);
    if (!this.draftSession.getDirtyPathKeys().length) this.autoSaveDurability.discardRetryable();
  }
  bindMountedDraftRebase(listener: MountedDraftRebaseListener): () => void {
    this.mountedDraftRebase = listener;
    return () => {
      if (this.mountedDraftRebase === listener) this.mountedDraftRebase = null;
    };
  }
  readForm(): CompleteOptions {
    return this.formAdapter.read(this.snapshot);
  }
  cancelAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.hasPendingAutoSave = false;
  }
  scheduleAutoSave(collect?: AutoSaveCollector): void {
    this.cancelAutoSave();
    let draft: CompleteOptions | StoredOptions | null | undefined;
    try {
      draft = collect ? collect() : this.formAdapter.read(this.snapshot);
    } catch (error) {
      this.callbacks.onSaveError?.('auto', error);
      return;
    }
    if (draft) {
      const transition = this.requireDraftSession().captureLocalDraft(mergeOptions(draft));
      this.applyMountedTransition({ ...transition, changed: false, changedPaths: [] }, true);
    }
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
    this.hasPendingAutoSave = false;
    const intent = this.requireDraftSession().createIntent();
    if (intent) this.autoSaveDurability.enqueue({ intent, reason: 'auto' });
    else this.autoSaveDurability.discardRetryable();
  }
  async loadInitialState(): Promise<StoredOptions> {
    const stored = await this.persistence.load();
    this.snapshot = deepClone(stored);
    this.draftSession = createOptionsDraftSession(mergeOptions(stored));
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
    if (reason === 'import') {
      if (!this.persistence.replace) throw new Error('OPTIONS_STRICT_REPLACE_UNAVAILABLE');
      const shouldResumeAutoSave =
        this.hasPendingAutoSave || this.requireDraftSession().getDirtyPathKeys().length > 0;
      this.cancelAutoSave();
      await this.autoSaveDurability.flush();
      try {
        const acknowledged = mergeOptions(await this.persistence.replace(cloned));
        const transition = this.requireDraftSession().resetAuthoritative(acknowledged);
        this.snapshot = acknowledged;
        this.applyMountedTransition(transition);
        this.callbacks.onSaveSuccess?.(reason, acknowledged);
        return acknowledged;
      } catch (error) {
        if (shouldResumeAutoSave) this.armCapturedAutoSave();
        this.callbacks.onSaveError?.(reason, error);
        throw error;
      }
    }
    this.requireDraftSession().captureLocalDraft(mergeOptions(cloned));
    const intent = this.requireDraftSession().createIntent();
    if (intent) {
      this.autoSaveDurability.enqueue({ intent, reason });
      await this.autoSaveDurability.flush();
    } else {
      this.autoSaveDurability.discardRetryable();
      this.callbacks.onSaveSuccess?.(reason, this.requireDraftSession().getWorkingDraft());
    }
    return this.requireDraftSession().getWorkingDraft();
  }
  async saveRaw(options: StoredOptions | CompleteOptions): Promise<void> {
    await this.saveSnapshot({ reason: 'manual', draft: options });
  }
  async applyImportedConfig(options: CompleteOptions): Promise<void> {
    await this.saveSnapshot({ reason: 'import', draft: options });
    await this.applyToForm(this.snapshot ?? undefined);
  }
  async dispose(): Promise<void> {
    await this.flushPendingAutoSave();
    if (this.unsubscribePersistence) {
      this.unsubscribePersistence();
      this.unsubscribePersistence = null;
    }
  }
  private requireDraftSession(): OptionsDraftSession {
    if (!this.draftSession) {
      this.draftSession = createOptionsDraftSession(mergeOptions(this.snapshot ?? {}));
    }
    return this.draftSession;
  }
  private applyMountedTransition(
    transition: OptionsDraftSessionTransition,
    forceReconcile = false
  ): void {
    if (!forceReconcile && !transition.changed && !transition.ownershipChanged) return;
    this.mountedDraftRebase?.(this.requireDraftSession().getWorkingDraft(), {
      changedPaths: transition.changedPaths,
      dirtyPathKeys: this.requireDraftSession().getDirtyPathKeys()
    });
  }
  private armCapturedAutoSave(): void {
    this.hasPendingAutoSave = true;
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      void this.handoffPendingAutoSave().catch(() => undefined);
    }, this.autoSaveDebounceMs);
  }
}
export function createOptionsController(deps: OptionsControllerDeps): OptionsController {
  return new OptionsController(deps);
}
