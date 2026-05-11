import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
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
  markDirty(): void;
  removeRow(row: YamlFieldRow): void;
  render(): void;
  setFilter(filter: YamlFilter): void;
}

function cell(child: Node): HTMLTableCellElement {
  const td = document.createElement('td');
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
  const input = document.createElement('input');
  input.className = `input${options.mono ? ' mono' : ''}`;
  input.value = value;
  input.dataset.yamlField = field;
  if (options.custom) {
    input.dataset.custom = 'true';
  }
  input.addEventListener('input', () => {
    update(input.value);
    callbacks.markDirty();
  });
  return input;
}

function renderTypeSelect(row: YamlFieldRow, callbacks: FieldTableCallbacks): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'select';
  select.dataset.yamlField = 'type';
  select.disabled = row.builtIn;
  TYPE_OPTIONS.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    option.selected = row.type === type;
    select.append(option);
  });
  select.addEventListener('change', () => {
    row.type = select.value as YamlFieldType;
    callbacks.markDirty();
  });
  return select;
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
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'schema-button yaml-delete-button';
  button.textContent = TABLE_LABELS.deleteButton;
  button.disabled = disabled;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    remove();
    callbacks.markDirty();
    callbacks.render();
  });
  return button;
}

export function renderFilter(filter: YamlFilter, callbacks: FieldTableCallbacks): HTMLElement {
  const row = document.createElement('div');
  row.className = 'yaml-filter-row stitch-yaml-filter-row';
  const items: Array<[YamlFilter, string]> = [
    ['all', TABLE_LABELS.filterAll],
    ['article', CONTENT_TYPE_LABELS.article],
    ['clipper', CONTENT_TYPE_LABELS.clipper],
    ['video', CONTENT_TYPE_LABELS.video],
    ['ai_chat', CONTENT_TYPE_LABELS.ai_chat]
  ];
  items.forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `yaml-filter${filter === value ? ' is-active' : ''}`;
    button.textContent = label;
    button.dataset.value = value;
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
  const shell = document.createElement('div');
  shell.className = 'yaml-table-shell yaml-table-scroll stitch-yaml-config-table';
  const table = document.createElement('table');
  table.className = 'schema-table';
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
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
    const th = document.createElement('th');
    th.textContent = label;
    header.append(th);
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
  const tr = document.createElement('tr');
  tr.dataset.rowId = row.id;
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
  const errors = document.createElement('div');
  errors.className = 'yaml-validation-errors stitch-yaml-validation-errors';
  errors.dataset.yamlErrors = 'global';
  return errors;
}
