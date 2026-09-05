import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import type { OptionsPatch } from '../../shared/types/optionsMutationMessages';
import type { UsageStats } from '../../shared/types/usage';
import type { PlainStructuredValue } from '../../shared/config/losslessObjectBoundaryTypes';

export interface OptionsState {
  language: string;
  options: StoredOptions | null;
  usage: UsageStats | null;
  /**
   * Which section is currently considered active in the UI shell.
   */
  activeSection: string | null;
  /**
   * Tracks which option sections have been mounted to the DOM.
   */
  mountedSections: Record<string, boolean>;
  isInitialized: boolean;
}

export type OptionsStateUpdate = Partial<OptionsState>;

export type StateListener = (state: OptionsState) => void;

export type OptionsSubscriber = (options: StoredOptions | undefined) => void;

type RawYamlOptionsInputPatch = {
  readonly path: readonly ['yamlConfig'];
  readonly value: PlainStructuredValue;
};

export type OptionsStoreInputPatch = OptionsPatch | RawYamlOptionsInputPatch;

export interface OptionsStore {
  load(): Promise<StoredOptions>;
  save(patches: readonly OptionsStoreInputPatch[]): Promise<StoredOptions>;
  snapshot(): StoredOptions | null;
  replace(options: StoredOptions | CompleteOptions | null): void;
  reset(): void;
  subscribe(listener: OptionsSubscriber): () => void;
}

export interface StateManager {
  getState(): OptionsState;
  /**
   * Performs a shallow merge with the current state then notifies listeners.
   */
  setState(update: OptionsStateUpdate): void;
  /**
   * Allows callers to mutate a cloned snapshot and replace the state in one step.
   */
  update(mutator: (draft: OptionsState) => void): void;
  /**
   * Resets the state to the initial snapshot or the provided override.
   */
  reset(nextState?: OptionsState): void;
  subscribe(listener: StateListener): () => void;
}

export const defaultOptionsState: OptionsState = {
  language: 'en',
  options: null,
  usage: null,
  activeSection: null,
  mountedSections: {},
  isInitialized: false
};
