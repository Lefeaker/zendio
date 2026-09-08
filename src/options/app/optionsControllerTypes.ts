import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import type { OptionsFormAdapter } from '../components/optionsFormAdapter';
import type { OptionsPersistenceService } from '../services/persistence';

export type SaveReason = 'manual' | 'auto' | 'import';

export interface AutoSaveAttemptIdentity {
  readonly intentId: number;
  readonly admissionGeneration: number;
}

export interface OptionsControllerCallbacks {
  onSaveSuccess?: (
    reason: SaveReason,
    saved: CompleteOptions | StoredOptions,
    identity?: AutoSaveAttemptIdentity
  ) => void;
  onSaveError?: (reason: SaveReason, error: unknown, identity?: AutoSaveAttemptIdentity) => void;
  onAutoSaveRecovered?: (identity: AutoSaveAttemptIdentity) => void;
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

export type AutoSaveCollector =
  | (() => CompleteOptions | StoredOptions | null | undefined)
  | undefined;
