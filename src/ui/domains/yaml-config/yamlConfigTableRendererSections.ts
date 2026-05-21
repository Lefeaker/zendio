import type { YamlContentType } from '@shared/types/yamlConfig';
import { createLayoutElement } from '../../primitives/layout';
import {
  CONTENT_TYPES,
  type FieldRow,
  type RowActions,
  type YamlConfigTableLabels
} from './yamlConfigTableTypes';
import { buildYamlTableRow } from './yamlConfigTableSharedRenderers';
import { bindYamlToggle } from './yamlConfigTableRendererEvents';

export function appendYamlConfigTableSections(
  root: HTMLElement,
  args: {
    labels: YamlConfigTableLabels;
    rows: FieldRow[];
    currentFilterMode: YamlContentType | null;
    currentSortMode: YamlContentType | null;
    defaultGroupExpanded: boolean;
    advancedOpenRows: Set<string>;
    rowErrors: Map<string, string[]>;
    getMoveAvailability: (rowId: string) => { canMoveUp: boolean; canMoveDown: boolean };
    onDefaultGroupToggle: (open: boolean) => void;
    rowActions: RowActions;
  }
): void {
  const builtInRows = args.rows.filter((row) => row.builtIn);
  const customRows = args.rows.filter((row) => !row.builtIn);
  const order = resolveGroupOrder(args.rows, builtInRows, customRows, args.currentSortMode);

  order.forEach((groupType) => {
    if (groupType === 'builtIn') {
      root.append(buildBuiltInGroup({ ...args, rows: builtInRows }));
      return;
    }
    root.append(buildCustomGroup({ ...args, rows: customRows }));
  });
}

function resolveGroupOrder(
  rows: FieldRow[],
  builtInRows: FieldRow[],
  customRows: FieldRow[],
  currentSortMode: YamlContentType | null
): Array<'builtIn' | 'custom'> {
  const order: Array<'builtIn' | 'custom'> = [];
  if (builtInRows.length) {
    order.push('builtIn');
  }
  if (customRows.length) {
    order.push('custom');
  }
  const firstBuiltInIndex = rows.findIndex((row) => row.builtIn);
  const firstCustomIndex = rows.findIndex((row) => !row.builtIn);
  if (currentSortMode && builtInRows.length && customRows.length && firstCustomIndex !== -1) {
    if (firstBuiltInIndex === -1 || firstCustomIndex < firstBuiltInIndex) {
      order.sort((value) => (value === 'custom' ? -1 : 1));
    }
  }
  return order;
}

function buildBuiltInGroup(args: {
  labels: YamlConfigTableLabels;
  rows: FieldRow[];
  currentFilterMode: YamlContentType | null;
  defaultGroupExpanded: boolean;
  advancedOpenRows: Set<string>;
  rowErrors: Map<string, string[]>;
  getMoveAvailability: (rowId: string) => { canMoveUp: boolean; canMoveDown: boolean };
  onDefaultGroupToggle: (open: boolean) => void;
  rowActions: RowActions;
}): HTMLElement {
  const group = createLayoutElement({ tag: 'details', className: 'group' });
  group.open = args.defaultGroupExpanded;
  bindYamlToggle(group, args.onDefaultGroupToggle);

  const summary = createLayoutElement({
    tag: 'summary',
    className:
      'flex cursor-pointer select-none items-center gap-2 bg-base-200 px-3 py-2 font-medium text-base-content/60 transition-colors hover:text-base-content marker:text-base-content/50'
  });
  summary.textContent = buildGroupLabel({
    label: args.labels.defaultGroup,
    rows: args.rows,
    currentFilterMode: args.currentFilterMode
  });
  group.append(summary, buildRowsBody(args.rows, args));
  return group;
}

function buildCustomGroup(args: {
  labels: YamlConfigTableLabels;
  rows: FieldRow[];
  currentFilterMode: YamlContentType | null;
  advancedOpenRows: Set<string>;
  rowErrors: Map<string, string[]>;
  getMoveAvailability: (rowId: string) => { canMoveUp: boolean; canMoveDown: boolean };
  rowActions: RowActions;
}): HTMLElement {
  const container = createLayoutElement({ className: 'border-t border-base-300' });
  const header = createLayoutElement({
    className: 'border-b border-base-300 bg-base-200 px-3 py-2 font-medium text-base-content/60'
  });
  header.textContent = buildGroupLabel({
    label: args.labels.customGroup,
    rows: args.rows,
    currentFilterMode: args.currentFilterMode
  });
  container.append(header);
  args.rows.forEach((row) => container.append(buildSectionRow(row, args)));
  return container;
}

function buildRowsBody(
  rows: FieldRow[],
  args: {
    labels: YamlConfigTableLabels;
    advancedOpenRows: Set<string>;
    rowErrors: Map<string, string[]>;
    getMoveAvailability: (rowId: string) => { canMoveUp: boolean; canMoveDown: boolean };
    rowActions: RowActions;
  }
): HTMLElement {
  const body = createLayoutElement({ className: 'divide-y divide-base-300' });
  rows.forEach((row) => body.append(buildSectionRow(row, args)));
  return body;
}

function buildSectionRow(
  row: FieldRow,
  args: {
    labels: YamlConfigTableLabels;
    advancedOpenRows: Set<string>;
    rowErrors: Map<string, string[]>;
    getMoveAvailability: (rowId: string) => { canMoveUp: boolean; canMoveDown: boolean };
    rowActions: RowActions;
  }
): HTMLElement {
  return buildYamlTableRow({
    row,
    labels: args.labels,
    advancedOpenRows: args.advancedOpenRows,
    rowErrors: args.rowErrors,
    getMoveAvailability: args.getMoveAvailability,
    actions: args.rowActions
  });
}

function buildGroupLabel(args: {
  label: string;
  rows: FieldRow[];
  currentFilterMode: YamlContentType | null;
}): string {
  const total = args.rows.length;
  const enabled = args.currentFilterMode
    ? args.rows.filter((row) => row.enabled[args.currentFilterMode as YamlContentType]).length
    : args.rows.filter((row) => CONTENT_TYPES.some((mode) => row.enabled[mode])).length;
  return `${args.label} (${enabled}/${total})`;
}
