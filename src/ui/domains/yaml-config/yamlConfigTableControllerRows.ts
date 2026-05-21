import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
import {
  createToggleMap,
  formatArrayValue,
  getCustomRowsByOrder,
  nextBaseOrderValue,
  sortRowsByMode
} from './yamlConfigTableModel';
import type { FieldRow } from './yamlConfigTableTypes';
import type { YamlConfigControllerInternalState } from './yamlConfigTableControllerStateTypes';

export function createYamlConfigControllerRowId(seed: string): string {
  return `yaml-row-${seed}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addYamlConfigCustomRow(state: YamlConfigControllerInternalState): FieldRow {
  const row: FieldRow = {
    id: createYamlConfigControllerRowId('custom'),
    name: '',
    type: 'text',
    defaultValue: '',
    enabled: createToggleMap(false),
    supported: createToggleMap(true),
    builtIn: false,
    isCustom: true,
    required: false,
    originTypes: new Set()
  };
  state.baseOrder.set(row.id, nextBaseOrderValue(state.baseOrder));
  state.rows = sortRowsByMode([...state.rows, row], state.currentSortMode, state.baseOrder);
  return row;
}

export function moveYamlConfigCustomRow(
  state: YamlConfigControllerInternalState,
  rowId: string,
  offset: number
): boolean {
  if (state.currentSortMode || state.currentFilterMode || offset === 0) {
    return false;
  }
  const ordered = getCustomRowsByOrder(state.rows, state.baseOrder);
  const index = ordered.findIndex((item) => item.id === rowId);
  if (index === -1) {
    return false;
  }
  const targetIndex = index + offset;
  if (targetIndex < 0 || targetIndex >= ordered.length) {
    return false;
  }
  const sourceRow = ordered[index];
  const targetRow = ordered[targetIndex];
  const sourceOrder = state.baseOrder.get(sourceRow.id) ?? 0;
  const targetOrder = state.baseOrder.get(targetRow.id) ?? 0;
  state.baseOrder.set(sourceRow.id, targetOrder);
  state.baseOrder.set(targetRow.id, sourceOrder);
  state.rows = sortRowsByMode(state.rows, state.currentSortMode, state.baseOrder);
  return true;
}

export function getYamlConfigCustomMoveAvailability(
  state: YamlConfigControllerInternalState,
  rowId: string
): { canMoveUp: boolean; canMoveDown: boolean } {
  const row = state.rows.find((item) => item.id === rowId);
  if (!row || row.builtIn || state.currentSortMode || state.currentFilterMode) {
    return { canMoveUp: false, canMoveDown: false };
  }
  const ordered = getCustomRowsByOrder(state.rows, state.baseOrder);
  const index = ordered.findIndex((item) => item.id === rowId);
  return {
    canMoveUp: index > 0,
    canMoveDown: index !== -1 && index < ordered.length - 1
  };
}

export function updateYamlConfigRowName(row: FieldRow, value: string): void {
  row.name = value;
}

export function updateYamlConfigRowType(
  state: YamlConfigControllerInternalState,
  row: FieldRow,
  type: YamlFieldType
): void {
  row.type = type;
  row.defaultValue = '';
  state.rows = sortRowsByMode(state.rows, state.currentSortMode, state.baseOrder);
}

export function toggleYamlConfigRowContentType(
  state: YamlConfigControllerInternalState,
  row: FieldRow,
  contentType: YamlContentType,
  checked: boolean
): void {
  row.enabled[contentType] = checked;
  state.rows = sortRowsByMode(state.rows, state.currentSortMode, state.baseOrder);
}

export function deleteYamlConfigRow(state: YamlConfigControllerInternalState, row: FieldRow): void {
  state.baseOrder.delete(row.id);
  state.rows = state.rows.filter((item) => item.id !== row.id);
  state.advancedOpenRows.delete(row.id);
  state.rows = sortRowsByMode(state.rows, state.currentSortMode, state.baseOrder);
}

export function updateYamlConfigRowDefaultValue(row: FieldRow, value: string): void {
  row.defaultValue = value;
}

export function normalizeYamlConfigRowDefaultValue(row: FieldRow, value: string): string {
  const normalized = row.type === 'array' ? formatArrayValue(value) : value;
  row.defaultValue = normalized;
  return normalized;
}

export function updateYamlConfigRowValuePath(row: FieldRow, value: string): void {
  row.valuePath = value;
}

export function normalizeYamlConfigRowValuePath(row: FieldRow, value: string): string {
  const trimmed = value.trim();
  if (trimmed) {
    row.valuePath = trimmed;
  } else {
    delete row.valuePath;
  }
  return row.valuePath ?? '';
}
