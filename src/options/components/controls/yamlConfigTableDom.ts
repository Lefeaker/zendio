import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
import { createButton } from '../shared/DaisyUIHelpers';
import {
  ARRAY_INPUT_PLACEHOLDER,
  CONTENT_TYPES,
  TYPE_OPTIONS,
  type DomainFieldRow,
  type DomainOverrideEntry,
  type FieldRow,
  type YamlConfigDomainLabels,
  type YamlConfigTableLabels
} from './yamlConfigTableTypes';
import { formatArrayValue } from './yamlConfigTableModel';

interface RowActions {
  onNameInput: (row: FieldRow, value: string) => void;
  onNameBlur: (row: FieldRow) => void;
  onTypeChange: (row: FieldRow, type: YamlFieldType) => void;
  onToggleContentType: (row: FieldRow, contentType: YamlContentType, checked: boolean) => void;
  onAdvancedToggle: (row: FieldRow) => void;
  onMoveRow: (rowId: string, offset: number) => void;
  onDeleteRow: (row: FieldRow) => void;
  onDefaultValueInput: (row: FieldRow, value: string) => void;
  onDefaultValueBlur: (row: FieldRow, value: string) => void;
  onAdvancedValuePathInput: (row: FieldRow, value: string) => void;
  onAdvancedValuePathBlur: (row: FieldRow, value: string) => void;
}

interface DomainActions {
  onAddDomainEntry: () => void;
  onRemoveDomainEntry: (entryId: string) => void;
  onDomainInput: (entry: DomainOverrideEntry, value: string) => void;
  onDomainBlur: () => void;
  onContentTypeChange: (entry: DomainOverrideEntry, contentType: YamlContentType) => void;
  onAddDomainField: (entry: DomainOverrideEntry) => void;
  onRemoveDomainField: (entryId: string, fieldId: string) => void;
  onDomainFieldNameChange: (entry: DomainOverrideEntry, field: DomainFieldRow, name: string) => void;
  onDomainFieldEnabledChange: (field: DomainFieldRow, checked: boolean) => void;
  onDomainFieldDefaultInput: (field: DomainFieldRow, value: string) => void;
  onDomainFieldDefaultBlur: (field: DomainFieldRow, value: string) => void;
  onDomainFieldValuePathInput: (field: DomainFieldRow, value: string) => void;
  onDomainFieldValuePathBlur: (field: DomainFieldRow, value: string) => void;
}

export function renderFilters(args: {
  labels: YamlConfigTableLabels;
  currentFilterMode: YamlContentType | null;
  onToggleFilter: (mode: YamlContentType | null) => void;
}): HTMLElement {
  const { labels, currentFilterMode, onToggleFilter } = args;
  const container = document.createElement('div');
  container.className = 'flex flex-wrap gap-2 mb-4';
  const filters: Array<{ mode: YamlContentType | null; label: string }> = [
    { mode: null, label: labels.filterAll },
    { mode: 'article', label: labels.article },
    { mode: 'clipper', label: labels.clipper },
    { mode: 'video', label: labels.video },
    { mode: 'ai_chat', label: labels.ai }
  ];

  filters.forEach(({ mode, label }) => {
    const button = createButton(label, {
      size: 'xs',
      className: 'rounded-full bg-base-200 text-base-content/60 border border-base-300 hover:bg-base-300 hover:text-base-content hover:border-base-content'
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
  const header = document.createElement('div');
  header.className =
    'grid grid-cols-[minmax(120px,1.5fr)_100px_repeat(4,60px)_minmax(120px,1fr)_80px] gap-2 p-3 bg-base-200 border-b border-base-300 font-medium text-base-content/60 text-xs uppercase tracking-wider';

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
    if (column.mode) {
      const button = createButton(column.label, {
        variant: 'ghost',
        size: 'sm',
        className: 'gap-1 hover:text-text'
      });
      if (currentSortMode === column.mode) {
        button.classList.add('text-accent', 'font-bold');
      }
      button.addEventListener('click', () => onToggleSort(column.mode!));
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

  const root = document.createElement('div');
  root.className = 'aobx-table w-full border border-base-300 rounded-lg overflow-hidden bg-base-100 shadow-sm text-sm min-w-[800px]';
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
      const group = document.createElement('details');
      group.className = 'group';
      group.open = defaultGroupExpanded;
      group.addEventListener('toggle', () => onDefaultGroupToggle(group.open));

      const summary = document.createElement('summary');
      summary.className =
        'px-3 py-2 bg-base-200 font-medium text-base-content/60 cursor-pointer select-none flex items-center gap-2 hover:text-base-content transition-colors marker:text-base-content/50';
      const total = builtInRows.length;
      const enabled = currentFilterMode
        ? builtInRows.filter((row) => row.enabled[currentFilterMode]).length
        : builtInRows.filter((row) => CONTENT_TYPES.some((mode) => row.enabled[mode])).length;
      summary.textContent = `${labels.defaultGroup} (${enabled}/${total})`;
      group.append(summary);

      const body = document.createElement('div');
      body.className = 'divide-y divide-base-300';
      builtInRows.forEach((row) =>
        body.append(
          buildRow({
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

    const container = document.createElement('div');
    container.className = 'border-t border-base-300';
    const customHeader = document.createElement('div');
    const total = customRows.length;
    const enabled = currentFilterMode
      ? customRows.filter((row) => row.enabled[currentFilterMode]).length
      : customRows.filter((row) => CONTENT_TYPES.some((mode) => row.enabled[mode])).length;
    customHeader.className = 'px-3 py-2 bg-base-200 font-medium text-base-content/60 border-b border-base-300';
    customHeader.textContent = `${labels.customGroup} (${enabled}/${total})`;
    container.append(customHeader);
    customRows.forEach((row) =>
      container.append(
        buildRow({
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

function buildRow(args: {
  row: FieldRow;
  labels: YamlConfigTableLabels;
  advancedOpenRows: Set<string>;
  rowErrors: Map<string, string[]>;
  getMoveAvailability: (rowId: string) => { canMoveUp: boolean; canMoveDown: boolean };
  actions: RowActions;
}): HTMLElement {
  const { row, labels, advancedOpenRows, rowErrors, getMoveAvailability, actions } = args;
  const rowElement = document.createElement('div');
  rowElement.className =
    'aobx-table__row grid grid-cols-[minmax(120px,1.5fr)_100px_repeat(4,60px)_minmax(120px,1fr)_80px] gap-2 p-3 items-center hover:bg-base-200 transition-colors border-b border-base-300 last:border-b-0';
  rowElement.dataset.rowId = row.id;

  const appendCell = (content: HTMLElement): void => {
    const cell = document.createElement('div');
    cell.className = 'flex items-center overflow-hidden';
    cell.append(content);
    rowElement.append(cell);
  };

  const nameInput = document.createElement('input');
  nameInput.className = 'input input-bordered w-full h-8 text-sm disabled:opacity-50';
  nameInput.type = 'text';
  nameInput.value = row.name;
  nameInput.placeholder = labels.namePlaceholder;
  nameInput.disabled = row.builtIn;
  nameInput.addEventListener('input', (event) => actions.onNameInput(row, (event.target as HTMLInputElement).value));
  nameInput.addEventListener('blur', () => actions.onNameBlur(row));
  appendCell(nameInput);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'select select-bordered w-full h-8 text-sm disabled:opacity-50';
  typeSelect.disabled = row.builtIn;
  TYPE_OPTIONS.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    opt.selected = option === row.type;
    typeSelect.append(opt);
  });
  typeSelect.addEventListener('change', (event) => {
    actions.onTypeChange(row, (event.target as HTMLSelectElement).value as YamlFieldType);
  });
  appendCell(typeSelect);

  for (const contentType of CONTENT_TYPES) {
    const supported = row.supported[contentType] || row.isCustom;
    if (!supported) {
      const placeholder = document.createElement('span');
      placeholder.className = 'text-base-content/30 select-none';
      placeholder.textContent = '—';
      appendCell(placeholder);
      continue;
    }

    const checkboxWrapper = document.createElement('div');
    checkboxWrapper.className = 'flex items-center justify-center w-full';
    checkboxWrapper.setAttribute('aria-label', labels.typeLabels[contentType]);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox checkbox-accent w-[18px] h-[18px] cursor-pointer';
    checkbox.checked = row.enabled[contentType];
    checkbox.addEventListener('change', (event) => {
      actions.onToggleContentType(row, contentType, (event.target as HTMLInputElement).checked);
    });
    checkboxWrapper.append(checkbox);
    appendCell(checkboxWrapper);
  }

  appendCell(buildDefaultValueEditor(row, labels, actions));

  const actionContainer = document.createElement('div');
  actionContainer.className = 'flex items-center gap-1 justify-end';
  const isAdvancedOpen = advancedOpenRows.has(row.id);
  const advancedButton = createButton(isAdvancedOpen ? labels.advancedHide : labels.advancedShow, {
    variant: 'ghost',
    size: 'sm',
    className: 'w-6 h-6 rounded text-base-content/60 hover:text-base-content hover:bg-base-200'
  });
  if (row.valuePath && row.valuePath.trim()) {
    advancedButton.classList.add('text-accent');
  }
  advancedButton.addEventListener('click', () => actions.onAdvancedToggle(row));
  actionContainer.append(advancedButton);

  if (row.builtIn) {
    const disabledLabel = document.createElement('span');
    disabledLabel.className = 'text-base-content/30 select-none w-6 text-center';
    disabledLabel.textContent = '—';
    actionContainer.append(disabledLabel);
  } else {
    const moveInfo = getMoveAvailability(row.id);
    const moveUp = createButton('↑', {
      variant: 'ghost',
      size: 'sm',
      disabled: !moveInfo.canMoveUp,
      className: 'w-6 h-6 rounded text-base-content/60 hover:text-base-content hover:bg-base-200 disabled:opacity-30 disabled:hover:bg-transparent'
    });
    moveUp.addEventListener('click', () => actions.onMoveRow(row.id, -1));
    actionContainer.append(moveUp);

    const moveDown = createButton('↓', {
      variant: 'ghost',
      size: 'sm',
      disabled: !moveInfo.canMoveDown,
      className: 'w-6 h-6 rounded text-base-content/60 hover:text-base-content hover:bg-base-200 disabled:opacity-30 disabled:hover:bg-transparent'
    });
    moveDown.addEventListener('click', () => actions.onMoveRow(row.id, 1));
    actionContainer.append(moveDown);

    const actionButton = createButton('×', {
      variant: 'ghost',
      size: 'sm',
      className: 'w-6 h-6 rounded text-destructive hover:bg-destructive/10'
    });
    actionButton.title = labels.deleteButton;
    actionButton.addEventListener('click', () => actions.onDeleteRow(row));
    actionContainer.append(actionButton);
  }
  appendCell(actionContainer);

  if (isAdvancedOpen) {
    rowElement.classList.add('bg-base-200/50');
    rowElement.append(buildAdvancedPanel(row, labels, actions));
  }

  const errors = rowErrors.get(row.id);
  if (errors?.length) {
    rowElement.classList.add('bg-destructive/5');
    rowElement.append(buildErrorList('yaml-row-errors', errors));
  }

  return rowElement;
}

function buildAdvancedPanel(row: FieldRow, labels: YamlConfigTableLabels, actions: RowActions): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'col-span-full grid gap-2 p-3 mt-2 bg-base-200 rounded border border-base-300 text-sm';
  panel.style.gridColumn = '1 / -1';

  const label = document.createElement('label');
  label.className = 'aobx-table__advanced-label';
  const inputId = `yaml-advanced-${row.id}`;
  label.setAttribute('for', inputId);
  label.textContent = labels.valuePathLabel;

  const input = document.createElement('input');
  input.className = 'input input-bordered w-full min-h-[36px] aobx-table__advanced-input';
  input.type = 'text';
  input.id = inputId;
  input.placeholder = labels.valuePathPlaceholder;
  input.value = row.valuePath ?? '';
  input.addEventListener('input', (event) => actions.onAdvancedValuePathInput(row, (event.target as HTMLInputElement).value));
  input.addEventListener('blur', (event) => {
    const target = event.target as HTMLInputElement;
    actions.onAdvancedValuePathBlur(row, target.value);
    target.value = row.valuePath ?? '';
  });

  const hint = document.createElement('p');
  hint.className = 'aobx-table__advanced-hint';
  hint.textContent = labels.valuePathHint;
  panel.append(label, input, hint);

  if (labels.valuePathExamples.trim()) {
    const examples = document.createElement('details');
    examples.className = 'aobx-table__advanced-examples';
    const summary = document.createElement('summary');
    summary.textContent = labels.valuePathExamplesTitle;
    const code = document.createElement('pre');
    code.className = 'aobx-table__advanced-examples-body';
    code.textContent = labels.valuePathExamples;
    examples.append(summary, code);
    panel.append(examples);
  }

  return panel;
}

function buildDefaultValueEditor(row: FieldRow, labels: YamlConfigTableLabels, actions: RowActions): HTMLElement {
  const container = document.createElement('div');
  container.className = 'aobx-table__value-container';
  const initialValue = row.defaultValue ?? '';

  if (row.type === 'array') {
    const input = document.createElement('input');
    input.className = 'input input-bordered w-full min-h-[36px] disabled:opacity-50 aobx-table__array-input';
    input.type = 'text';
    const placeholderRaw = labels.arrayPlaceholder.trim();
    input.placeholder = placeholderRaw.includes(';') ? placeholderRaw : ARRAY_INPUT_PLACEHOLDER;
    input.value = formatArrayValue(initialValue);
    input.disabled = row.builtIn;
    input.addEventListener('input', (event) => actions.onDefaultValueInput(row, (event.target as HTMLInputElement).value));
    input.addEventListener('blur', (event) => {
      const target = event.target as HTMLInputElement;
      actions.onDefaultValueBlur(row, target.value);
      target.value = row.defaultValue ?? '';
    });
    container.append(input);
    return container;
  }

  const input = document.createElement('input');
  input.className = 'input input-bordered w-full min-h-[36px] disabled:opacity-50';
  input.type = 'text';
  input.value = initialValue;
  input.placeholder = labels.valuePlaceholder;
  input.disabled = row.builtIn;
  input.addEventListener('input', (event) => actions.onDefaultValueInput(row, (event.target as HTMLInputElement).value));
  input.addEventListener('blur', (event) => {
    const target = event.target as HTMLInputElement;
    actions.onDefaultValueBlur(row, target.value);
    target.value = row.defaultValue ?? '';
  });
  container.append(input);
  return container;
}

export function buildGlobalWarnings(globalErrors: string[]): HTMLElement | null {
  if (!globalErrors.length) {
    return null;
  }
  const container = document.createElement('div');
  container.className = 'alert alert-error p-3 text-sm aobx-table__global-errors';
  container.setAttribute('role', 'alert');
  globalErrors.forEach((message) => {
    const item = document.createElement('div');
    item.textContent = message;
    container.append(item);
  });
  return container;
}

export function renderDomainOverrides(args: {
  host: HTMLElement;
  entries: DomainOverrideEntry[];
  labels: YamlConfigDomainLabels;
  tableLabels: YamlConfigTableLabels;
  domainErrors: Map<string, string[]>;
  getFieldOptionsForEntry: (entry: DomainOverrideEntry, currentField?: DomainFieldRow) => FieldRow[];
  buildDomainFieldDefinition: (contentType: YamlContentType, fieldName: string) => FieldRow | undefined;
  actions: DomainActions;
}): void {
  const { host, entries, labels, tableLabels, domainErrors, getFieldOptionsForEntry, buildDomainFieldDefinition, actions } = args;
  const wrapper = document.createElement('div');
  wrapper.className = 'aobx-domain';

  const header = document.createElement('div');
  header.className = 'aobx-domain__header';
  const title = document.createElement('h3');
  title.textContent = labels.title;
  const addButton = createButton(labels.addRule, {
    variant: 'primary',
    size: 'sm',
    className: 'aobx-btn aobx-domain__add-btn'
  });
  addButton.addEventListener('click', actions.onAddDomainEntry);
  header.append(title, addButton);

  const list = document.createElement('div');
  list.className = 'aobx-domain__list';
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'aobx-domain__empty';
    empty.textContent = labels.empty;
    list.append(empty);
  } else {
    entries.forEach((entry) => {
      list.append(
        buildDomainCard({
          entry,
          labels,
          tableLabels,
          errors: domainErrors.get(entry.id) ?? [],
          getFieldOptionsForEntry,
          findFieldDefinition: buildDomainFieldDefinition,
          actions
        })
      );
    });
  }

  const hint = document.createElement('p');
  hint.className = 'aobx-domain__hint';
  hint.textContent = labels.hint;
  wrapper.append(header, list, hint);
  host.replaceChildren(wrapper);
}

function buildDomainCard(args: {
  entry: DomainOverrideEntry;
  labels: YamlConfigDomainLabels;
  tableLabels: YamlConfigTableLabels;
  errors: string[];
  getFieldOptionsForEntry: (entry: DomainOverrideEntry, currentField?: DomainFieldRow) => FieldRow[];
  findFieldDefinition: (contentType: YamlContentType, fieldName: string) => FieldRow | undefined;
  actions: DomainActions;
}): HTMLElement {
  const { entry, labels, tableLabels, errors, getFieldOptionsForEntry, findFieldDefinition, actions } = args;
  const card = document.createElement('div');
  card.className = 'aobx-domain__card alert alert-error p-3 text-sm aobx-table__global-errors';
  card.dataset.entryId = entry.id;
  if (errors.length) {
    card.classList.add('has-error');
  }

  const header = document.createElement('div');
  header.className = 'aobx-domain__card-header';
  const domainInput = document.createElement('input');
  domainInput.className = 'input input-bordered w-full min-h-[36px] aobx-domain__domain-input';
  domainInput.type = 'text';
  domainInput.value = entry.domain;
  domainInput.placeholder = labels.placeholder;
  domainInput.addEventListener('input', (event) => actions.onDomainInput(entry, (event.target as HTMLInputElement).value));
  domainInput.addEventListener('blur', () => actions.onDomainBlur());
  header.append(domainInput);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'select select-bordered w-full min-h-[36px] aobx-domain__type-select';
  CONTENT_TYPES.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = tableLabels.typeLabels[type] ?? type;
    option.selected = type === entry.contentType;
    typeSelect.append(option);
  });
  typeSelect.addEventListener('change', (event) => {
    actions.onContentTypeChange(entry, (event.target as HTMLSelectElement).value as YamlContentType);
  });
  header.append(typeSelect);

  const removeButton = createButton(labels.removeRule, {
    variant: 'danger',
    size: 'sm',
    className: 'aobx-btn aobx-domain__remove-btn'
  });
  removeButton.addEventListener('click', () => actions.onRemoveDomainEntry(entry.id));
  header.append(removeButton);
  card.append(header);

  const fieldsContainer = document.createElement('div');
  fieldsContainer.className = 'aobx-domain__fields';
  if (!entry.fields.length) {
    const empty = document.createElement('div');
    empty.className = 'aobx-domain__field-empty';
    empty.textContent = labels.fieldEmpty;
    fieldsContainer.append(empty);
  } else {
    entry.fields.forEach((field) => {
      fieldsContainer.append(
        buildDomainField({
          entry,
          field,
          labels,
          options: getFieldOptionsForEntry(entry, field),
          definition: findFieldDefinition(entry.contentType, field.name),
          actions
        })
      );
    });
  }
  card.append(fieldsContainer);

  const addFieldButton = createButton(labels.addField, {
    variant: 'secondary',
    size: 'sm',
    disabled: getFieldOptionsForEntry(entry).length === 0,
    className: 'aobx-domain__add-field-btn'
  });
  addFieldButton.addEventListener('click', () => actions.onAddDomainField(entry));
  card.append(addFieldButton);

  if (errors.length) {
    card.append(buildErrorList('aobx-domain__errors', errors));
  }

  return card;
}

function buildDomainField(args: {
  entry: DomainOverrideEntry;
  field: DomainFieldRow;
  labels: YamlConfigDomainLabels;
  options: FieldRow[];
  definition: FieldRow | undefined;
  actions: DomainActions;
}): HTMLElement {
  const { entry, field, labels, options, actions } = args;
  const container = document.createElement('div');
  container.className = 'aobx-domain__field';
  container.dataset.fieldId = field.id;

  const header = document.createElement('div');
  header.className = 'aobx-domain__field-header';
  const nameSelect = document.createElement('select');
  nameSelect.className = 'select select-bordered w-full min-h-[36px] aobx-domain__field-select';
  options.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.name;
    opt.textContent = `${option.name} (${option.type})`;
    opt.selected = option.name === field.name;
    nameSelect.append(opt);
  });
  nameSelect.addEventListener('change', (event) => {
    actions.onDomainFieldNameChange(entry, field, (event.target as HTMLSelectElement).value);
  });
  header.append(nameSelect);

  const enabledLabel = document.createElement('label');
  enabledLabel.className = 'aobx-domain__field-enabled';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'checkbox checkbox-accent w-[18px] h-[18px]';
  checkbox.checked = field.enabled;
  checkbox.addEventListener('change', (event) => {
    actions.onDomainFieldEnabledChange(field, (event.target as HTMLInputElement).checked);
  });
  enabledLabel.append(checkbox, document.createTextNode(labels.fieldEnabled));
  header.append(enabledLabel);

  const removeButton = createButton(labels.fieldRemove, {
    variant: 'danger',
    size: 'sm',
    className: 'aobx-btn aobx-domain__field-remove'
  });
  removeButton.addEventListener('click', () => actions.onRemoveDomainField(entry.id, field.id));
  header.append(removeButton);
  container.append(header, buildDomainFieldValueEditor(field, labels, actions));
  return container;
}

function buildDomainFieldValueEditor(
  field: DomainFieldRow,
  labels: YamlConfigDomainLabels,
  actions: DomainActions
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'aobx-domain__field-body';

  const valueContainer = document.createElement('div');
  valueContainer.className = 'aobx-table__value-container';
  if (field.type === 'array') {
    const input = document.createElement('input');
    input.className = 'input input-bordered w-full min-h-[36px] aobx-table__array-input';
    input.type = 'text';
    const placeholderRaw = labels.arrayPlaceholder.trim();
    input.placeholder = placeholderRaw.includes(';') ? placeholderRaw : ARRAY_INPUT_PLACEHOLDER;
    input.value = formatArrayValue(field.defaultValue ?? '');
    input.addEventListener('input', (event) => actions.onDomainFieldDefaultInput(field, (event.target as HTMLInputElement).value));
    input.addEventListener('blur', (event) => {
      const target = event.target as HTMLInputElement;
      actions.onDomainFieldDefaultBlur(field, target.value);
      target.value = field.defaultValue ?? '';
    });
    valueContainer.append(input);
  } else {
    const input = document.createElement('input');
    input.className = 'input input-bordered w-full min-h-[36px] aobx-input';
    input.type = 'text';
    input.placeholder = labels.valuePlaceholder;
    input.value = field.defaultValue ?? '';
    input.addEventListener('input', (event) => actions.onDomainFieldDefaultInput(field, (event.target as HTMLInputElement).value));
    input.addEventListener('blur', (event) => {
      const target = event.target as HTMLInputElement;
      actions.onDomainFieldDefaultBlur(field, target.value);
      target.value = field.defaultValue ?? '';
    });
    valueContainer.append(input);
  }
  container.append(valueContainer);

  const valuePathLabel = document.createElement('label');
  valuePathLabel.className = 'aobx-domain__value-path-label';
  valuePathLabel.textContent = labels.valuePathLabel;
  const valuePathInput = document.createElement('input');
  valuePathInput.className = 'input input-bordered w-full min-h-[36px] aobx-domain__value-path-input';
  valuePathInput.type = 'text';
  valuePathInput.placeholder = labels.valuePathPlaceholder;
  valuePathInput.value = field.valuePath ?? '';
  valuePathInput.addEventListener('input', (event) => actions.onDomainFieldValuePathInput(field, (event.target as HTMLInputElement).value));
  valuePathInput.addEventListener('blur', (event) => {
    const target = event.target as HTMLInputElement;
    actions.onDomainFieldValuePathBlur(field, target.value);
    target.value = field.valuePath ?? '';
  });
  container.append(valuePathLabel, valuePathInput);
  return container;
}

function buildErrorList(className: string, errors: string[]): HTMLElement {
  const list = document.createElement('ul');
  list.className = className;
  errors.forEach((message) => {
    const item = document.createElement('li');
    item.textContent = message;
    list.append(item);
  });
  return list;
}
