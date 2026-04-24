import type { YamlContentType } from '@shared/types/yamlConfig';
import { createOptionsButtonElement } from '../../primitives/button';
import {
  createOptionsActionRow,
  createLayoutElement,
  createOptionsPanel
} from '../../primitives/layout';
import { CONTENT_TYPES, type FieldRow, type YamlConfigTableLabels } from './yamlConfigTableTypes';
import {
  buildYamlErrorList,
  buildYamlTableRow,
  renderDomainOverrides,
  type DomainActions,
  type RowActions
} from './yamlConfigTableSharedRenderers';
export { renderDomainOverrides } from './yamlConfigTableSharedRenderers';

export function renderFilters(args: {
  labels: YamlConfigTableLabels;
  currentFilterMode: YamlContentType | null;
  onToggleFilter: (mode: YamlContentType | null) => void;
}): HTMLElement {
  const { labels, currentFilterMode, onToggleFilter } = args;
  const container = createOptionsActionRow({
    className: 'schema-output-tab-row mb-4 flex flex-wrap gap-2 pt-0'
  });
  const filters: Array<{ mode: YamlContentType | null; label: string }> = [
    { mode: null, label: labels.filterAll },
    { mode: 'article', label: labels.article },
    { mode: 'clipper', label: labels.clipper },
    { mode: 'video', label: labels.video },
    { mode: 'ai_chat', label: labels.ai }
  ];

  filters.forEach(({ mode, label }) => {
    const button = createOptionsButtonElement({
      label,
      size: 'xs',
      className:
        'schema-output-tab rounded-full bg-base-200 text-base-content/60 border border-base-300 hover:bg-base-300 hover:text-base-content hover:border-base-content'
    });
    if (currentFilterMode === mode) {
      button.classList.add('bg-accent/10', 'text-accent', 'border-accent/20');
      button.classList.remove('bg-base-200', 'text-base-content/60', 'border-base-300');
    }
    button.addEventListener('click', () => onToggleFilter(mode));
    container.append(button);
  });

  return container;
}

export function buildHeader(args: {
  labels: YamlConfigTableLabels;
  currentSortMode: YamlContentType | null;
  onToggleSort: (mode: YamlContentType) => void;
}): HTMLElement {
  const { labels, currentSortMode, onToggleSort } = args;
  const header = createLayoutElement({
    className:
      'schema-output-table-header grid grid-cols-[minmax(120px,1.5fr)_100px_repeat(4,60px)_minmax(120px,1fr)_80px] gap-2 border-b border-base-300 bg-base-200 p-3 text-xs font-medium uppercase tracking-wider text-base-content/60'
  });

  const columns: Array<{ key: string; label: string; mode?: YamlContentType }> = [
    { key: 'field', label: labels.field },
    { key: 'type', label: labels.type },
    { key: 'article', label: labels.article, mode: 'article' },
    { key: 'clipper', label: labels.clipper, mode: 'clipper' },
    { key: 'video', label: labels.video, mode: 'video' },
    { key: 'ai', label: labels.ai, mode: 'ai_chat' },
    { key: 'defaultValue', label: labels.defaultValue },
    { key: 'actions', label: labels.actions }
  ];

  columns.forEach((column) => {
    const span = document.createElement('span');
    const mode = column.mode;
    if (mode) {
      const button = createOptionsButtonElement({
        label: column.label,
        variant: 'ghost',
        size: 'sm',
        className: 'gap-1 hover:text-text'
      });
      if (currentSortMode === mode) {
        button.classList.add('text-accent', 'font-bold');
      }
      button.addEventListener('click', () => onToggleSort(mode));
      span.append(button);
    } else {
      span.textContent = column.label;
    }
    header.append(span);
  });

  return header;
}

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

  const root = createOptionsPanel({
    className:
      'aobx-table schema-output-table-shell min-w-[800px] w-full overflow-hidden rounded-lg border border-base-300 bg-base-100 text-sm shadow-sm'
  });
  root.append(
    renderFilters({
      labels,
      currentFilterMode,
      onToggleFilter
    })
  );
  root.append(buildHeader({ labels, currentSortMode, onToggleSort }));

  const builtInRows = rows.filter((row) => row.builtIn);
  const customRows = rows.filter((row) => !row.builtIn);
  const firstBuiltInIndex = rows.findIndex((row) => row.builtIn);
  const firstCustomIndex = rows.findIndex((row) => !row.builtIn);
  const order: Array<'builtIn' | 'custom'> = [];
  if (builtInRows.length) {
    order.push('builtIn');
  }
  if (customRows.length) {
    order.push('custom');
  }
  if (currentSortMode && builtInRows.length && customRows.length && firstCustomIndex !== -1) {
    if (firstBuiltInIndex === -1 || firstCustomIndex < firstBuiltInIndex) {
      order.sort((value) => (value === 'custom' ? -1 : 1));
    }
  }

  order.forEach((groupType) => {
    if (groupType === 'builtIn') {
      const group = createLayoutElement({ tag: 'details', className: 'group' });
      group.open = defaultGroupExpanded;
      group.addEventListener('toggle', () => onDefaultGroupToggle(group.open));

      const summary = createLayoutElement({
        tag: 'summary',
        className:
          'schema-output-group-summary flex cursor-pointer select-none items-center gap-2 bg-base-200 px-3 py-2 font-medium text-base-content/60 transition-colors hover:text-base-content marker:text-base-content/50'
      });
      const total = builtInRows.length;
      const enabled = currentFilterMode
        ? builtInRows.filter((row) => row.enabled[currentFilterMode]).length
        : builtInRows.filter((row) => CONTENT_TYPES.some((mode) => row.enabled[mode])).length;
      summary.textContent = `${labels.defaultGroup} (${enabled}/${total})`;
      group.append(summary);

      const body = createLayoutElement({ className: 'divide-y divide-base-300' });
      builtInRows.forEach((row) =>
        body.append(
          buildYamlTableRow({
            row,
            labels,
            advancedOpenRows,
            rowErrors,
            getMoveAvailability,
            actions: rowActions
          })
        )
      );
      group.append(body);
      root.append(group);
      return;
    }

    const container = createLayoutElement({ className: 'border-t border-base-300' });
    const customHeader = createLayoutElement({
      className:
        'schema-output-group-summary border-b border-base-300 bg-base-200 px-3 py-2 font-medium text-base-content/60'
    });
    const total = customRows.length;
    const enabled = currentFilterMode
      ? customRows.filter((row) => row.enabled[currentFilterMode]).length
      : customRows.filter((row) => CONTENT_TYPES.some((mode) => row.enabled[mode])).length;
    customHeader.textContent = `${labels.customGroup} (${enabled}/${total})`;
    container.append(customHeader);
    customRows.forEach((row) =>
      container.append(
        buildYamlTableRow({
          row,
          labels,
          advancedOpenRows,
          rowErrors,
          getMoveAvailability,
          actions: rowActions
        })
      )
    );
    root.append(container);
  });

  return root;
}

export function buildGlobalWarnings(globalErrors: string[]): HTMLElement | null {
  if (!globalErrors.length) {
    return null;
  }
  const container = createOptionsPanel({
    className:
      'alert alert-error aobx-table__global-errors schema-output-inline-warning p-3 text-sm',
    attributes: { role: 'alert' }
  });
  globalErrors.forEach((message) => {
    container.append(createLayoutElement({ textContent: message }));
  });
  return container;
}
