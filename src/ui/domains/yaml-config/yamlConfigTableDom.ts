import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
import { createOptionsButtonElement } from '../../primitives/button';
import { createCheckboxElement } from '../../primitives/checkbox';
import { createInputElement } from '../../primitives/input';
import { createSelectElement } from '../../primitives/select';
import {
  createOptionsActionRow,
  createOptionsHintText,
  createLayoutElement,
  createOptionsMessageList,
  createOptionsPanel
} from '../../primitives/layout';
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
  onDomainFieldNameChange: (
    entry: DomainOverrideEntry,
    field: DomainFieldRow,
    name: string
  ) => void;
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
  const container = createOptionsActionRow({ className: 'mb-4 flex flex-wrap gap-2 pt-0' });
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
        'rounded-full bg-base-200 text-base-content/60 border border-base-300 hover:bg-base-300 hover:text-base-content hover:border-base-content'
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
      'grid grid-cols-[minmax(120px,1.5fr)_100px_repeat(4,60px)_minmax(120px,1fr)_80px] gap-2 border-b border-base-300 bg-base-200 p-3 text-xs font-medium uppercase tracking-wider text-base-content/60'
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
    if (column.mode) {
      const button = createOptionsButtonElement({
        label: column.label,
        variant: 'ghost',
        size: 'sm',
        className: 'gap-1 hover:text-text'
      });
      if (currentSortMode === column.mode) {
        button.classList.add('text-accent', 'font-bold');
      }
      button.addEventListener('click', () => onToggleSort(column.mode));
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
      'aobx-table min-w-[800px] w-full overflow-hidden rounded-lg border border-base-300 bg-base-100 text-sm shadow-sm'
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
          'flex cursor-pointer select-none items-center gap-2 bg-base-200 px-3 py-2 font-medium text-base-content/60 transition-colors hover:text-base-content marker:text-base-content/50'
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

    const container = createLayoutElement({ className: 'border-t border-base-300' });
    const customHeader = createLayoutElement({
      className: 'border-b border-base-300 bg-base-200 px-3 py-2 font-medium text-base-content/60'
    });
    const total = customRows.length;
    const enabled = currentFilterMode
      ? customRows.filter((row) => row.enabled[currentFilterMode]).length
      : customRows.filter((row) => CONTENT_TYPES.some((mode) => row.enabled[mode])).length;
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
  const rowElement = createLayoutElement({
    className:
      'aobx-table__row grid grid-cols-[minmax(120px,1.5fr)_100px_repeat(4,60px)_minmax(120px,1fr)_80px] items-center gap-2 border-b border-base-300 p-3 transition-colors hover:bg-base-200 last:border-b-0'
  });
  rowElement.dataset.rowId = row.id;

  const appendCell = (content: HTMLElement): void => {
    const cell = createLayoutElement({ className: 'flex items-center overflow-hidden' });
    cell.append(content);
    rowElement.append(cell);
  };

  const nameInput = createInputElement({
    type: 'text',
    value: row.name,
    placeholder: labels.namePlaceholder,
    disabled: row.builtIn,
    className: 'w-full h-8 text-sm disabled:opacity-50'
  });
  nameInput.addEventListener('input', (event) =>
    actions.onNameInput(row, (event.target as HTMLInputElement).value)
  );
  nameInput.addEventListener('blur', () => actions.onNameBlur(row));
  appendCell(nameInput);

  const typeSelect = createSelectElement({
    value: row.type,
    disabled: row.builtIn,
    className: 'w-full h-8 text-sm disabled:opacity-50',
    options: TYPE_OPTIONS.map((option) => ({ value: option, label: option }))
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

    const checkboxWrapper = createLayoutElement({
      className: 'flex w-full items-center justify-center'
    });
    checkboxWrapper.setAttribute('aria-label', labels.typeLabels[contentType]);
    const { root, input: checkbox } = createCheckboxElement({
      checked: row.enabled[contentType],
      labelClassName: 'justify-center',
      inputClassName: 'cursor-pointer'
    });
    checkbox.addEventListener('change', (event) => {
      actions.onToggleContentType(row, contentType, (event.target as HTMLInputElement).checked);
    });
    checkboxWrapper.append(root);
    appendCell(checkboxWrapper);
  }

  appendCell(buildDefaultValueEditor(row, labels, actions));

  const actionContainer = createOptionsActionRow({
    className: 'flex items-center justify-end gap-1 pt-0'
  });
  const isAdvancedOpen = advancedOpenRows.has(row.id);
  const advancedButton = createOptionsButtonElement({
    label: isAdvancedOpen ? labels.advancedHide : labels.advancedShow,
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
    const moveUp = createOptionsButtonElement({
      label: '↑',
      variant: 'ghost',
      size: 'sm',
      disabled: !moveInfo.canMoveUp,
      className:
        'w-6 h-6 rounded text-base-content/60 hover:text-base-content hover:bg-base-200 disabled:opacity-30 disabled:hover:bg-transparent'
    });
    moveUp.addEventListener('click', () => actions.onMoveRow(row.id, -1));
    actionContainer.append(moveUp);

    const moveDown = createOptionsButtonElement({
      label: '↓',
      variant: 'ghost',
      size: 'sm',
      disabled: !moveInfo.canMoveDown,
      className:
        'w-6 h-6 rounded text-base-content/60 hover:text-base-content hover:bg-base-200 disabled:opacity-30 disabled:hover:bg-transparent'
    });
    moveDown.addEventListener('click', () => actions.onMoveRow(row.id, 1));
    actionContainer.append(moveDown);

    const actionButton = createOptionsButtonElement({
      label: '×',
      variant: 'ghost',
      size: 'sm',
      title: labels.deleteButton,
      className: 'w-6 h-6 rounded text-destructive hover:bg-destructive/10'
    });
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

function buildAdvancedPanel(
  row: FieldRow,
  labels: YamlConfigTableLabels,
  actions: RowActions
): HTMLElement {
  const panel = createOptionsPanel({
    className:
      'col-span-full mt-2 grid gap-2 rounded border border-base-300 bg-base-200 p-3 text-sm'
  });
  panel.style.gridColumn = '1 / -1';

  const label = createLayoutElement({
    tag: 'label',
    className: 'aobx-table__advanced-label'
  });
  const inputId = `yaml-advanced-${row.id}`;
  label.setAttribute('for', inputId);
  label.textContent = labels.valuePathLabel;

  const input = createInputElement({
    id: inputId,
    type: 'text',
    placeholder: labels.valuePathPlaceholder,
    value: row.valuePath ?? '',
    className: 'w-full min-h-[36px] aobx-table__advanced-input'
  });
  input.addEventListener('input', (event) =>
    actions.onAdvancedValuePathInput(row, (event.target as HTMLInputElement).value)
  );
  input.addEventListener('blur', (event) => {
    const target = event.target as HTMLInputElement;
    actions.onAdvancedValuePathBlur(row, target.value);
    target.value = row.valuePath ?? '';
  });

  const hint = createOptionsHintText({
    className: 'aobx-table__advanced-hint',
    text: labels.valuePathHint
  });
  panel.append(label, input, hint);

  if (labels.valuePathExamples.trim()) {
    const examples = createLayoutElement({
      tag: 'details',
      className: 'aobx-table__advanced-examples'
    });
    const summary = createLayoutElement({
      tag: 'summary',
      textContent: labels.valuePathExamplesTitle
    });
    const code = createLayoutElement({
      tag: 'pre',
      className: 'aobx-table__advanced-examples-body',
      textContent: labels.valuePathExamples
    });
    examples.append(summary, code);
    panel.append(examples);
  }

  return panel;
}

function buildDefaultValueEditor(
  row: FieldRow,
  labels: YamlConfigTableLabels,
  actions: RowActions
): HTMLElement {
  const container = createLayoutElement({ className: 'aobx-table__value-container' });
  const initialValue = row.defaultValue ?? '';

  if (row.type === 'array') {
    const placeholderRaw = labels.arrayPlaceholder.trim();
    const input = createInputElement({
      type: 'text',
      placeholder: placeholderRaw.includes(';') ? placeholderRaw : ARRAY_INPUT_PLACEHOLDER,
      value: formatArrayValue(initialValue),
      disabled: row.builtIn,
      className: 'w-full min-h-[36px] disabled:opacity-50 aobx-table__array-input'
    });
    input.addEventListener('input', (event) =>
      actions.onDefaultValueInput(row, (event.target as HTMLInputElement).value)
    );
    input.addEventListener('blur', (event) => {
      const target = event.target as HTMLInputElement;
      actions.onDefaultValueBlur(row, target.value);
      target.value = row.defaultValue ?? '';
    });
    container.append(input);
    return container;
  }

  const input = createInputElement({
    type: 'text',
    value: initialValue,
    placeholder: labels.valuePlaceholder,
    disabled: row.builtIn,
    className: 'w-full min-h-[36px] disabled:opacity-50'
  });
  input.addEventListener('input', (event) =>
    actions.onDefaultValueInput(row, (event.target as HTMLInputElement).value)
  );
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
  const container = createOptionsPanel({
    className: 'alert alert-error aobx-table__global-errors p-3 text-sm',
    attributes: { role: 'alert' }
  });
  globalErrors.forEach((message) => {
    container.append(createLayoutElement({ textContent: message }));
  });
  return container;
}

export function renderDomainOverrides(args: {
  host: HTMLElement;
  entries: DomainOverrideEntry[];
  labels: YamlConfigDomainLabels;
  tableLabels: YamlConfigTableLabels;
  domainErrors: Map<string, string[]>;
  getFieldOptionsForEntry: (
    entry: DomainOverrideEntry,
    currentField?: DomainFieldRow
  ) => FieldRow[];
  buildDomainFieldDefinition: (
    contentType: YamlContentType,
    fieldName: string
  ) => FieldRow | undefined;
  actions: DomainActions;
}): void {
  const {
    host,
    entries,
    labels,
    tableLabels,
    domainErrors,
    getFieldOptionsForEntry,
    buildDomainFieldDefinition,
    actions
  } = args;
  const wrapper = createLayoutElement({ className: 'aobx-domain' });

  const header = createOptionsActionRow({ className: 'aobx-domain__header pt-0' });
  const title = createLayoutElement({ tag: 'h3' });
  title.textContent = labels.title;
  const addButton = createOptionsButtonElement({
    label: labels.addRule,
    variant: 'primary',
    size: 'sm',
    className: 'aobx-btn aobx-domain__add-btn'
  });
  addButton.addEventListener('click', actions.onAddDomainEntry);
  header.append(title, addButton);

  const list = createLayoutElement({ className: 'aobx-domain__list' });
  if (!entries.length) {
    const empty = createLayoutElement({
      className: 'aobx-domain__empty',
      textContent: labels.empty
    });
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

  const hint = createOptionsHintText({
    className: 'aobx-domain__hint',
    text: labels.hint
  });
  wrapper.append(header, list, hint);
  host.replaceChildren(wrapper);
}

function buildDomainCard(args: {
  entry: DomainOverrideEntry;
  labels: YamlConfigDomainLabels;
  tableLabels: YamlConfigTableLabels;
  errors: string[];
  getFieldOptionsForEntry: (
    entry: DomainOverrideEntry,
    currentField?: DomainFieldRow
  ) => FieldRow[];
  findFieldDefinition: (contentType: YamlContentType, fieldName: string) => FieldRow | undefined;
  actions: DomainActions;
}): HTMLElement {
  const {
    entry,
    labels,
    tableLabels,
    errors,
    getFieldOptionsForEntry,
    findFieldDefinition,
    actions
  } = args;
  const card = createOptionsPanel({
    className: 'aobx-domain__card alert alert-error aobx-table__global-errors p-3 text-sm'
  });
  card.dataset.entryId = entry.id;
  if (errors.length) {
    card.classList.add('has-error');
  }

  const header = createOptionsActionRow({ className: 'aobx-domain__card-header pt-0' });
  const domainInput = createInputElement({
    type: 'text',
    value: entry.domain,
    placeholder: labels.placeholder,
    className: 'w-full min-h-[36px] aobx-domain__domain-input'
  });
  domainInput.addEventListener('input', (event) =>
    actions.onDomainInput(entry, (event.target as HTMLInputElement).value)
  );
  domainInput.addEventListener('blur', () => actions.onDomainBlur());
  header.append(domainInput);

  const typeSelect = createSelectElement({
    value: entry.contentType,
    className: 'w-full min-h-[36px] aobx-domain__type-select',
    options: CONTENT_TYPES.map((type) => ({
      value: type,
      label: tableLabels.typeLabels[type] ?? type
    }))
  });
  typeSelect.addEventListener('change', (event) => {
    actions.onContentTypeChange(
      entry,
      (event.target as HTMLSelectElement).value as YamlContentType
    );
  });
  header.append(typeSelect);

  const removeButton = createOptionsButtonElement({
    label: labels.removeRule,
    variant: 'danger',
    size: 'sm',
    className: 'aobx-btn aobx-domain__remove-btn'
  });
  removeButton.addEventListener('click', () => actions.onRemoveDomainEntry(entry.id));
  header.append(removeButton);
  card.append(header);

  const fieldsContainer = createLayoutElement({ className: 'aobx-domain__fields' });
  if (!entry.fields.length) {
    const empty = createLayoutElement({
      className: 'aobx-domain__field-empty',
      textContent: labels.fieldEmpty
    });
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

  const addFieldButton = createOptionsButtonElement({
    label: labels.addField,
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
  const container = createLayoutElement({ className: 'aobx-domain__field' });
  container.dataset.fieldId = field.id;

  const header = createOptionsActionRow({ className: 'aobx-domain__field-header pt-0' });
  const nameSelect = createSelectElement({
    value: field.name,
    className: 'w-full min-h-[36px] aobx-domain__field-select',
    options: options.map((option) => ({
      value: option.name,
      label: `${option.name} (${option.type})`
    }))
  });
  nameSelect.addEventListener('change', (event) => {
    actions.onDomainFieldNameChange(entry, field, (event.target as HTMLSelectElement).value);
  });
  header.append(nameSelect);

  const { root: enabledLabel, input: checkbox } = createCheckboxElement({
    checked: field.enabled,
    label: labels.fieldEnabled,
    labelClassName: 'aobx-domain__field-enabled'
  });
  checkbox.addEventListener('change', (event) => {
    actions.onDomainFieldEnabledChange(field, (event.target as HTMLInputElement).checked);
  });
  header.append(enabledLabel);

  const removeButton = createOptionsButtonElement({
    label: labels.fieldRemove,
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
  const container = createLayoutElement({ className: 'aobx-domain__field-body' });

  const valueContainer = createLayoutElement({ className: 'aobx-table__value-container' });
  if (field.type === 'array') {
    const placeholderRaw = labels.arrayPlaceholder.trim();
    const input = createInputElement({
      type: 'text',
      placeholder: placeholderRaw.includes(';') ? placeholderRaw : ARRAY_INPUT_PLACEHOLDER,
      value: formatArrayValue(field.defaultValue ?? ''),
      className: 'w-full min-h-[36px] aobx-table__array-input'
    });
    input.addEventListener('input', (event) =>
      actions.onDomainFieldDefaultInput(field, (event.target as HTMLInputElement).value)
    );
    input.addEventListener('blur', (event) => {
      const target = event.target as HTMLInputElement;
      actions.onDomainFieldDefaultBlur(field, target.value);
      target.value = field.defaultValue ?? '';
    });
    valueContainer.append(input);
  } else {
    const input = createInputElement({
      type: 'text',
      placeholder: labels.valuePlaceholder,
      value: field.defaultValue ?? '',
      className: 'w-full min-h-[36px] aobx-input'
    });
    input.addEventListener('input', (event) =>
      actions.onDomainFieldDefaultInput(field, (event.target as HTMLInputElement).value)
    );
    input.addEventListener('blur', (event) => {
      const target = event.target as HTMLInputElement;
      actions.onDomainFieldDefaultBlur(field, target.value);
      target.value = field.defaultValue ?? '';
    });
    valueContainer.append(input);
  }
  container.append(valueContainer);

  const valuePathLabel = createLayoutElement({
    tag: 'label',
    className: 'aobx-domain__value-path-label',
    textContent: labels.valuePathLabel
  });
  const valuePathInput = createInputElement({
    type: 'text',
    placeholder: labels.valuePathPlaceholder,
    value: field.valuePath ?? '',
    className: 'w-full min-h-[36px] aobx-domain__value-path-input'
  });
  valuePathInput.addEventListener('input', (event) =>
    actions.onDomainFieldValuePathInput(field, (event.target as HTMLInputElement).value)
  );
  valuePathInput.addEventListener('blur', (event) => {
    const target = event.target as HTMLInputElement;
    actions.onDomainFieldValuePathBlur(field, target.value);
    target.value = field.valuePath ?? '';
  });
  container.append(valuePathLabel, valuePathInput);
  return container;
}

function buildErrorList(className: string, errors: string[]): HTMLElement {
  return createOptionsMessageList(errors, { className });
}
