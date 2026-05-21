import type { YamlContentType } from '@shared/types/yamlConfig';
import { sortRowsByMode } from './yamlConfigTableModel';
import type { FieldRow } from './yamlConfigTableTypes';
import type { YamlConfigControllerInternalState } from './yamlConfigTableControllerStateTypes';

export function setYamlConfigDefaultGroupExpanded(
  state: YamlConfigControllerInternalState,
  open: boolean
): void {
  state.defaultGroupExpanded = open;
}

export function toggleYamlConfigFilterMode(
  state: YamlConfigControllerInternalState,
  mode: YamlContentType | null
): void {
  state.currentFilterMode = mode && state.currentFilterMode !== mode ? mode : null;
  state.rows = sortRowsByMode(state.rows, state.currentSortMode, state.baseOrder);
}

export function toggleYamlConfigSortMode(
  state: YamlConfigControllerInternalState,
  mode: YamlContentType
): void {
  state.currentSortMode = state.currentSortMode === mode ? null : mode;
  state.rows = sortRowsByMode(state.rows, state.currentSortMode, state.baseOrder);
}

export function toggleYamlConfigAdvancedRow(
  state: YamlConfigControllerInternalState,
  row: FieldRow
): void {
  if (state.advancedOpenRows.has(row.id)) {
    state.advancedOpenRows.delete(row.id);
    return;
  }
  state.advancedOpenRows.add(row.id);
}

export function openYamlConfigRowsWithValuePaths(state: YamlConfigControllerInternalState): void {
  state.advancedOpenRows.clear();
  state.rows.forEach((row) => {
    if (row.valuePath?.trim()) {
      state.advancedOpenRows.add(row.id);
    }
  });
}

export function resetYamlConfigSelectionState(state: YamlConfigControllerInternalState): void {
  state.currentSortMode = null;
  state.currentFilterMode = null;
  state.defaultGroupExpanded = true;
  state.advancedOpenRows.clear();
}
