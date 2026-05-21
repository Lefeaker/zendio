import type { YamlContentType } from '@shared/types/yamlConfig';
import { type FieldRow, type YamlConfigTableLabels } from './yamlConfigTableTypes';
import type { RowActions } from './yamlConfigTableSharedRenderers';
import { appendYamlConfigTableSections } from './yamlConfigTableRendererSections';
import {
  buildGlobalWarnings,
  buildHeader,
  createYamlConfigTableShell,
  renderFilters
} from './yamlConfigTableRendererShell';
export { renderDomainOverrides } from './yamlConfigTableSharedRenderers';
export { buildGlobalWarnings, buildHeader, renderFilters } from './yamlConfigTableRendererShell';

export function buildTable(args: {
  labels: YamlConfigTableLabels;
  rows: FieldRow[];
  currentFilterMode: YamlContentType | null;
  currentSortMode: YamlContentType | null;
  defaultGroupExpanded: boolean;
  advancedOpenRows: Set<string>;
  rowErrors: Map<string, string[]>;
  getMoveAvailability: (rowId: string) => { canMoveUp: boolean; canMoveDown: boolean };
  onDefaultGroupToggle: (open: boolean) => void;
  onToggleFilter: (mode: YamlContentType | null) => void;
  onToggleSort: (mode: YamlContentType) => void;
  rowActions: RowActions;
}): HTMLElement {
  const {
    labels,
    rows,
    currentFilterMode,
    currentSortMode,
    defaultGroupExpanded,
    advancedOpenRows,
    rowErrors,
    getMoveAvailability,
    onDefaultGroupToggle,
    onToggleFilter,
    onToggleSort,
    rowActions
  } = args;

  const root = createYamlConfigTableShell();
  root.append(
    renderFilters({
      labels,
      currentFilterMode,
      onToggleFilter
    })
  );
  root.append(buildHeader({ labels, currentSortMode, onToggleSort }));
  appendYamlConfigTableSections(root, {
    labels,
    rows,
    currentFilterMode,
    currentSortMode,
    defaultGroupExpanded,
    advancedOpenRows,
    rowErrors,
    getMoveAvailability,
    onDefaultGroupToggle,
    rowActions
  });

  return root;
}
