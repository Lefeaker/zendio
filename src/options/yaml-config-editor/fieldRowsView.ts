import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
import { button, el, selectInput, textInput } from './dom';
import { YAML_EDITOR_FIELD_TYPES } from './labels';
import type { YamlEditorLabels } from './labels';
import {
  YAML_EDITOR_CONTENT_TYPES,
  type YamlEditorState,
  type YamlEditorValidation
} from './types';
import {
  allocateId,
  buildRows,
  getRowDefaultValue,
  getRowFields,
  getRowName,
  getRowType,
  getRowValuePath,
  removeRow,
  setRowEnabled,
  updateFilteredField,
  updateRow,
  type YamlEditorFilter,
  type YamlTableRow
} from './rowModel';

export type { YamlEditorFilter } from './rowModel';

export interface YamlConfigEditorViewOptions {
  state: YamlEditorState;
  filter: YamlEditorFilter;
  validation: YamlEditorValidation | null;
  labels: YamlEditorLabels;
  onChange: () => void;
  onRender: (request?: YamlEditorRenderRequest) => void;
  onSetFilter: (filter: YamlEditorFilter) => void;
}

export type YamlEditorScrollTarget =
  | { kind: 'field'; fieldId: string }
  | { kind: 'domainField'; domainEntryId: string; fieldId: string };

export interface YamlEditorRenderRequest {
  scrollTarget?: YamlEditorScrollTarget;
}

export function createCustomField(state: YamlEditorState, filter: YamlEditorFilter): string {
  const contentType = filter === 'all' ? 'article' : filter;
  const id = allocateId(state, 'yaml-custom');
  state.contentTypes[contentType].customFields.push({
    id,
    name: '',
    type: 'text',
    enabled: true,
    required: false,
    defaultValue: '',
    valuePath: '',
    builtIn: false,
    isCustom: true
  });
  return id;
}

function fieldIds(row: YamlTableRow): string {
  return getRowFields(row)
    .map((field) => field.id)
    .join(' ');
}

export function cell(child: Node): HTMLTableCellElement {
  const td = el('td');
  td.append(child);
  return td;
}

export function renderFilter(options: YamlConfigEditorViewOptions): HTMLElement {
  const row = el('div', { className: 'yaml-filter-row stitch-yaml-filter-row' });
  const items: Array<[YamlEditorFilter, string]> = [
    ['all', options.labels.filters.all],
    ['article', options.labels.filters.article],
    ['clipper', options.labels.filters.clipper],
    ['video', options.labels.filters.video],
    ['ai_chat', options.labels.filters.ai_chat]
  ];
  items.forEach(([value, label]) => {
    const control = el('button', {
      className: `yaml-filter${options.filter === value ? ' is-active' : ''}`,
      text: label,
      type: 'button',
      dataset: { value }
    });
    control.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onSetFilter(value);
    });
    row.append(control);
  });
  return row;
}

function renderToggle(
  options: YamlConfigEditorViewOptions,
  row: YamlTableRow,
  contentType: YamlContentType
): HTMLInputElement {
  const cell = row.cells[contentType];
  const checkbox = el('input', {
    className: 'schema-switch-input stitch-yaml-toggle',
    type: 'checkbox',
    dataset: { mode: contentType },
    disabled: !cell.operable
  });
  checkbox.checked = Boolean(cell.field?.enabled);
  if (cell.operable) {
    checkbox.addEventListener('change', () => {
      setRowEnabled(options.state, row, contentType, checkbox.checked);
      options.onChange();
    });
  }
  return checkbox;
}

function renderDefaultValueControl(
  options: YamlConfigEditorViewOptions,
  row: YamlTableRow
): HTMLElement {
  return textInput({
    className: 'input mono',
    value: getRowDefaultValue(row, options.filter),
    dataset: { yamlField: 'defaultValue' },
    onInput: (value) => {
      updateFilteredField(row, options.filter, { defaultValue: value });
      options.onChange();
    }
  });
}

function renderValuePathControl(
  options: YamlConfigEditorViewOptions,
  row: YamlTableRow
): HTMLElement {
  return textInput({
    className: 'input mono',
    value: getRowValuePath(row, options.filter),
    placeholder: options.labels.table.valuePathPlaceholder,
    dataset: { yamlField: 'valuePath' },
    onInput: (value) => {
      updateFilteredField(row, options.filter, { valuePath: value });
      options.onChange();
    }
  });
}

export function renderDeleteButton(
  text: string,
  remove: () => void,
  options: Pick<YamlConfigEditorViewOptions, 'onChange' | 'onRender'>,
  disabled = false
): HTMLButtonElement {
  return button({
    className: 'schema-button yaml-delete-button',
    text,
    disabled,
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      remove();
      options.onChange();
      options.onRender();
    }
  });
}

function renderFieldRow(
  options: YamlConfigEditorViewOptions,
  row: YamlTableRow
): HTMLTableRowElement {
  const tr = el('tr', {
    dataset: {
      rowId: row.id,
      fieldIds: fieldIds(row)
    }
  });
  if (row.isCustom) {
    tr.classList.add('is-custom');
  }
  tr.append(
    cell(
      textInput({
        className: 'input mono',
        value: getRowName(row),
        disabled: row.builtIn || row.defaultCustom,
        dataset: { yamlField: 'name', custom: row.isCustom ? 'true' : undefined },
        onInput: (value) => {
          updateRow(row, { name: value });
          options.onChange();
        }
      })
    ),
    cell(
      selectInput<YamlFieldType>({
        className: 'select',
        value: getRowType(row),
        disabled: row.builtIn,
        options: YAML_EDITOR_FIELD_TYPES.map((type) => ({ value: type, label: type })),
        dataset: { yamlField: 'type' },
        onChange: (value) => {
          updateRow(row, { type: value });
          options.onChange();
        }
      })
    ),
    ...YAML_EDITOR_CONTENT_TYPES.map((contentType) =>
      cell(renderToggle(options, row, contentType))
    ),
    cell(renderDefaultValueControl(options, row)),
    cell(renderValuePathControl(options, row)),
    cell(
      renderDeleteButton(
        options.labels.table.deleteButton,
        () => removeRow(options.state, row),
        options,
        row.builtIn || row.defaultCustom
      )
    )
  );
  return tr;
}

export function renderFieldTable(options: YamlConfigEditorViewOptions): HTMLElement {
  const shell = el('div', {
    className: 'yaml-table-shell yaml-table-scroll stitch-yaml-config-table'
  });
  const table = el('table', { className: 'schema-table' });
  const thead = el('thead');
  const header = el('tr');
  [
    options.labels.table.field,
    options.labels.table.type,
    options.labels.table.article,
    options.labels.table.clipper,
    options.labels.table.video,
    options.labels.table.ai,
    options.labels.table.defaultValue,
    options.labels.table.valuePath,
    options.labels.table.actions
  ].forEach((label) => header.append(el('th', { text: label })));
  thead.append(header);
  const tbody = el('tbody');
  buildRows(options.state, options.filter).forEach((row) =>
    tbody.append(renderFieldRow(options, row))
  );
  table.append(thead, tbody);
  shell.append(table);
  return shell;
}
