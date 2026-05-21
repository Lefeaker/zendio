import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import {
  buildInitialDomainOverrides,
  buildInitialRows,
  collectYamlConfigOverrides,
  sortRowsByMode
} from './yamlConfigTableModel';
import {
  openYamlConfigRowsWithValuePaths,
  resetYamlConfigSelectionState
} from './yamlConfigTableControllerSelection';
import type { YamlConfigControllerInternalState } from './yamlConfigTableControllerStateTypes';

export function applyYamlConfigControllerSnapshot(
  state: YamlConfigControllerInternalState,
  initial: YamlConfigOverrides | null
): void {
  state.rows = buildInitialRows(initial ?? undefined);
  state.baseOrder = new Map(state.rows.map((row, index) => [row.id, index]));
  resetYamlConfigSelectionState(state);
  openYamlConfigRowsWithValuePaths(state);
  state.rowErrors = new Map();
  state.globalErrors = [];
  state.domainEntries = buildInitialDomainOverrides(initial ?? undefined, state.rows);
  state.domainErrors = new Map();
  state.rows = sortRowsByMode(state.rows, state.currentSortMode, state.baseOrder);
}

export function collectYamlConfigControllerSnapshot(
  state: YamlConfigControllerInternalState,
  callbacks: {
    syncValidationState: () => void;
    syncTable: () => void;
    getUnresolvedErrorMessage: () => string;
  }
): YamlConfigOverrides | null {
  if (!state.rows.length) {
    return null;
  }
  callbacks.syncValidationState();
  callbacks.syncTable();
  if (state.rowErrors.size || state.globalErrors.length) {
    throw new Error(state.globalErrors[0] ?? callbacks.getUnresolvedErrorMessage());
  }
  return collectYamlConfigOverrides({
    rows: state.rows,
    domainEntries: state.domainEntries,
    baseOrder: state.baseOrder
  });
}
