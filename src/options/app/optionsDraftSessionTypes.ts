import type { CompleteOptions } from '../../shared/types/options';
import type { OptionsPatch } from '../../shared/types/optionsMutationMessages';
import type { OptionsPath } from '../state/optionsPatchModel';
import type { areStateValuesEqual } from '../state/stateValue';

type StateValue = Parameters<typeof areStateValuesEqual>[0];

export interface DirtyPathOwnership {
  readonly path: OptionsPath;
  readonly editGeneration: number;
  readonly authorityRevision: number;
  readonly value: StateValue;
}

export interface OptionsMutationIntent {
  readonly intentId: number;
  readonly baseRevision: number;
  readonly admissionGeneration: number;
  readonly owned: readonly DirtyPathOwnership[];
  readonly patches: readonly OptionsPatch[];
}

export interface OptionsDraftSessionTransition {
  readonly changed: boolean;
  readonly changedPaths: readonly OptionsPath[];
  readonly ownershipChanged: boolean;
}

export interface MountedDraftRebase {
  readonly changedPaths: readonly OptionsPath[];
  readonly dirtyPathKeys: readonly string[];
}

export type MountedDraftRebaseListener = (
  draft: CompleteOptions,
  transition: MountedDraftRebase
) => void;
