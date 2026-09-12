import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import { mergeOptions } from '../../shared/config/optionsMerger';
import { deepClone } from '../utils/clone';
import type { OptionsPersistenceService } from '../services/persistence';
import type { OptionsFormAdapter } from '../components/optionsFormAdapter';
import { OptionsAutoSaveFailureTracker } from './optionsAutoSaveFailureTracker';
import { createSaveSuccessArguments } from './optionsAutoSaveFailureTracker';
import {
  createOptionsControllerDurability,
  type OptionsControllerDurability
} from './optionsControllerDurability';
import { createOptionsDraftSession, type OptionsDraftSession } from './optionsDraftSession';
import type {
  AutoSaveAttemptIdentity,
  AutoSaveCollector,
  OptionsControllerCallbacks,
  OptionsControllerDeps,
  SaveSnapshotOptions
} from './optionsControllerTypes';
import type {
  MountedDraftRebaseListener,
  OptionsDraftSessionTransition
} from './optionsDraftSessionTypes';

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
  private readonly autoSaveFailureTracker = new OptionsAutoSaveFailureTracker();

  constructor({
    persistence,
    formAdapter,
    autoSaveDebounceMs = 400,
    ...callbacks
  }: OptionsControllerDeps) {
    this.persistence = persistence;
    this.formAdapter = formAdapter;
    this.autoSaveDebounceMs = autoSaveDebounceMs;
    this.callbacks = callbacks;
    this.autoSaveDurability = createOptionsControllerDurability({
      persist: async ({ intent, reason }) => {
        const identity = {
          intentId: intent.intentId,
          admissionGeneration: intent.admissionGeneration
        };
        this.requireDraftSession().admit(intent);
        try {
          const acknowledged = mergeOptions(await this.persistence.save(intent.patches));
          const transition = this.requireDraftSession().acknowledge(intent, acknowledged);
          this.snapshot = this.requireDraftSession().getAuthoritativeSnapshot();
          this.applyMountedTransition(transition);
          if (this.requireDraftSession().getDirtyPathKeys().length === 0)
            this.autoSaveDurability.discardRetryable();
          const savedDraft = this.requireDraftSession().getWorkingDraft();
          const successArgs = createSaveSuccessArguments(reason, savedDraft, identity);
          this.callbacks.onSaveSuccess?.(...successArgs);
          if (reason === 'auto') this.recoverAutoSaveFailure(identity);
        } catch (error) {
          this.draftSession?.fail(intent);
          if (reason === 'auto') {
            this.autoSaveFailureTracker.record(identity);
            this.callbacks.onSaveError?.(reason, error, identity);
          } else {
            this.callbacks.onSaveError?.(reason, error);
          }
          throw error;
        }
      }
    });

    if (persistence.subscribe)
      this.unsubscribePersistence = persistence.subscribe((options) => this.setSnapshot(options));
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
    if (!this.draftSession.getDirtyPathKeys().length) {
      this.reconcileCleanAutoSave();
    }
  }
  bindMountedDraftRebase(listener: MountedDraftRebaseListener): () => void {
    this.mountedDraftRebase = listener;
    return () => {
      if (this.mountedDraftRebase === listener) this.mountedDraftRebase = null;
    };
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
    else this.reconcileCleanAutoSave();
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
      this.reconcileCleanAutoSave();
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
    this.unsubscribePersistence?.();
    this.unsubscribePersistence = null;
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
  private recoverAutoSaveFailure(identity?: AutoSaveAttemptIdentity): void {
    const recovered = this.autoSaveFailureTracker.recover(
      identity,
      this.requireDraftSession().getDirtyPathKeys().length > 0
    );
    if (recovered) this.callbacks.onAutoSaveRecovered?.(recovered);
  }
  private reconcileCleanAutoSave(): void {
    this.autoSaveDurability.discardRetryable();
    this.recoverAutoSaveFailure();
  }
}
export function createOptionsController(deps: OptionsControllerDeps): OptionsController {
  return new OptionsController(deps);
}
