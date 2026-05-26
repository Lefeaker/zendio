import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
import { button, el, selectInput, textInput } from './dom';
import { CONTENT_TYPE_LABELS, TABLE_LABELS } from './labels';
import {
  CONTENT_TYPES,
  TYPE_OPTIONS,
  getVisibleDefaultValue,
  getVisibleValuePath,
  updateDefaultValue,
  updateValuePath,
  type YamlFieldRow,
  type YamlFilter
} from './model';

export interface FieldTableCallbacks {
  markDirty: () => void;
  removeRow: (row: YamlFieldRow) => void;
  render: () => void;
  setFilter: (filter: YamlFilter) => void;
}

function cell(child: Node): HTMLTableCellElement {
  const td = el('td');
  td.append(child);
  return td;
}

function renderTextInput(
  value: string,
  field: string,
  update: (value: string) => void,
  callbacks: Pick<FieldTableCallbacks, 'markDirty'>,
  options: { mono?: boolean; custom?: boolean } = {}
): HTMLInputElement {
  return textInput({
    className: `input${options.mono ? ' mono' : ''}`,
    value,
    dataset: {
      yamlField: field,
      custom: options.custom ? 'true' : undefined
    },
    onInput: (nextValue) => {
      update(nextValue);
      callbacks.markDirty();
    }
  });
}

function renderTypeSelect(row: YamlFieldRow, callbacks: FieldTableCallbacks): HTMLSelectElement {
  return selectInput<YamlFieldType>({
    className: 'select',
    value: row.type,
    disabled: row.builtIn,
    options: TYPE_OPTIONS.map((type) => ({ value: type, label: type })),
    dataset: { yamlField: 'type' },
    onChange: (value) => {
      row.type = value;
      callbacks.markDirty();
    }
  });
}

function renderToggle(
  row: YamlFieldRow,
  contentType: YamlContentType,
  callbacks: FieldTableCallbacks
): HTMLInputElement {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'schema-switch-input stitch-yaml-toggle';
  checkbox.dataset.mode = contentType;
  checkbox.checked = Boolean(row.enabled[contentType]);
  checkbox.disabled = row.builtIn && !row.supported[contentType];
  checkbox.addEventListener('change', () => {
    row.enabled[contentType] = checkbox.checked;
    row.supported[contentType] = row.supported[contentType] || checkbox.checked || !row.builtIn;
    callbacks.markDirty();
  });
  return checkbox;
}

export function renderDeleteButton(
  remove: () => void,
  callbacks: Pick<FieldTableCallbacks, 'markDirty' | 'render'>,
  disabled = false
): HTMLButtonElement {
  return button({
    className: 'schema-button yaml-delete-button',
    text: TABLE_LABELS.deleteButton,
    disabled,
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      remove();
      callbacks.markDirty();
      callbacks.render();
    }
  });
}

export function renderFilter(filter: YamlFilter, callbacks: FieldTableCallbacks): HTMLElement {
  const row = el('div', { className: 'yaml-filter-row stitch-yaml-filter-row' });
  const items: Array<[YamlFilter, string]> = [
    ['all', TABLE_LABELS.filterAll],
    ['article', CONTENT_TYPE_LABELS.article],
    ['clipper', CONTENT_TYPE_LABELS.clipper],
    ['video', CONTENT_TYPE_LABELS.video],
    ['ai_chat', CONTENT_TYPE_LABELS.ai_chat]
  ];
  items.forEach(([value, label]) => {
    const button = el('button', {
      className: `yaml-filter${filter === value ? ' is-active' : ''}`,
      text: label,
      dataset: { value }
    });
    button.type = 'button';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      callbacks.setFilter(value);
      callbacks.render();
    });
    row.append(button);
  });
  return row;
}

export function renderFieldTable(
  rows: YamlFieldRow[],
  filter: YamlFilter,
  callbacks: FieldTableCallbacks
): HTMLElement {
  const shell = el('div', {
    className: 'yaml-table-shell yaml-table-scroll stitch-yaml-config-table'
  });
  const table = el('table', { className: 'schema-table' });
  const thead = el('thead');
  const header = el('tr');
  [
    TABLE_LABELS.field,
    TABLE_LABELS.type,
    TABLE_LABELS.article,
    TABLE_LABELS.clipper,
    TABLE_LABELS.video,
    TABLE_LABELS.ai,
    TABLE_LABELS.defaultValue,
    TABLE_LABELS.valuePathLabel,
    TABLE_LABELS.actions
  ].forEach((label) => {
    header.append(el('th', { text: label }));
  });
  thead.append(header);

  const tbody = document.createElement('tbody');
  rows
    .filter((row) => filter === 'all' || row.supported[filter] || row.enabled[filter])
    .forEach((row) => tbody.append(renderFieldRow(row, filter, callbacks)));

  table.append(thead, tbody);
  shell.append(table);
  return shell;
}

function renderFieldRow(
  row: YamlFieldRow,
  filter: YamlFilter,
  callbacks: FieldTableCallbacks
): HTMLTableRowElement {
  const tr = el('tr', { dataset: { rowId: row.id } });
  if (!row.builtIn) {
    tr.classList.add('is-custom');
  }

  tr.append(
    cell(
      renderTextInput(
        row.name,
        'name',
        (value) => {
          row.name = value;
        },
        callbacks,
        { mono: true, custom: !row.builtIn }
      )
    ),
    cell(renderTypeSelect(row, callbacks)),
    ...CONTENT_TYPES.map((contentType) => cell(renderToggle(row, contentType, callbacks))),
    cell(
      renderTextInput(
        getVisibleDefaultValue(row, filter),
        'defaultValue',
        (value) => updateDefaultValue(row, filter, value),
        callbacks,
        { mono: true }
      )
    ),
    cell(
      renderTextInput(
        getVisibleValuePath(row, filter),
        'valuePath',
        (value) => updateValuePath(row, filter, value),
        callbacks,
        { mono: true }
      )
    ),
    cell(renderDeleteButton(() => callbacks.removeRow(row), callbacks, row.builtIn))
  );
  return tr;
}

export function renderGlobalErrors(): HTMLElement {
  return el('div', {
    className: 'yaml-validation-errors stitch-yaml-validation-errors',
    dataset: { yamlErrors: 'global' }
  });
}
