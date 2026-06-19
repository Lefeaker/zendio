import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
import { button, el, selectInput, textInput } from './dom';
import { FALLBACK_YAML_EDITOR_LABELS, YAML_EDITOR_FIELD_TYPES } from './labels';
import type { YamlEditorLabels } from './labels';
import { buildYamlEditorPreview } from './preview';
import {
  YAML_EDITOR_CONTENT_TYPES,
  type YamlEditorDomainEntry,
  type YamlEditorDomainField,
  type YamlEditorField,
  type YamlEditorState,
  type YamlEditorValidation,
  type YamlEditorValidationError
} from './types';
import {
  allocateId,
  buildRows,
  getRowDefaultValue,
  getRowFields,
  getRowName,
  getRowScopedDefaultValues,
  getRowScopedValuePaths,
  getRowType,
  getRowValuePath,
  removeRow,
  setRowEnabled,
  updateFilteredField,
  updateRow,
  type YamlContentScopedValue,
  type YamlEditorFilter,
  type YamlTableRow
} from './rowModel';

export type { YamlEditorFilter } from './rowModel';

interface YamlConfigEditorViewOptions {
  state: YamlEditorState;
  filter: YamlEditorFilter;
  validation: YamlEditorValidation | null;
  labels: YamlEditorLabels;
  onChange: () => void;
  onRender: () => void;
  onSetFilter: (filter: YamlEditorFilter) => void;
}

function createCustomField(state: YamlEditorState, filter: YamlEditorFilter): void {
  const contentType = filter === 'all' ? 'article' : filter;
  state.contentTypes[contentType].customFields.push({
    id: allocateId(state, 'yaml-custom'),
    name: 'custom_field',
    type: 'text',
    enabled: true,
    required: false,
    defaultValue: '',
    valuePath: '',
    builtIn: false,
    isCustom: true
  });
}

function getDomainEntries(state: YamlEditorState): YamlEditorDomainEntry[] {
  return YAML_EDITOR_CONTENT_TYPES.flatMap(
    (contentType) => state.contentTypes[contentType].domainOverrides
  );
}

function getAvailableFields(
  state: YamlEditorState,
  contentType: YamlContentType
): YamlEditorField[] {
  const content = state.contentTypes[contentType];
  return [...content.fields, ...content.customFields, ...state.globalFields];
}

function createDomainField(
  state: YamlEditorState,
  contentType: YamlContentType
): YamlEditorDomainField {
  const source = getAvailableFields(state, contentType)[0];
  return {
    id: allocateId(state, 'domain-field'),
    name: source?.name ?? 'title',
    type: source?.type ?? 'text',
    enabled: true,
    defaultValue: '',
    valuePath: source?.valuePath ?? ''
  };
}

function addDomainRule(state: YamlEditorState, filter: YamlEditorFilter): void {
  const contentType = filter === 'all' ? 'article' : filter;
  state.contentTypes[contentType].domainOverrides.push({
    id: allocateId(state, `domain-${contentType}`),
    domain: '',
    contentType,
    fields: [createDomainField(state, contentType)]
  });
}

function moveDomainEntry(
  state: YamlEditorState,
  entry: YamlEditorDomainEntry,
  contentType: YamlContentType
): void {
  state.contentTypes[entry.contentType].domainOverrides = state.contentTypes[
    entry.contentType
  ].domainOverrides.filter((candidate) => candidate.id !== entry.id);
  entry.contentType = contentType;
  state.contentTypes[contentType].domainOverrides.push(entry);
}

function removeDomainEntry(state: YamlEditorState, entry: YamlEditorDomainEntry): void {
  state.contentTypes[entry.contentType].domainOverrides = state.contentTypes[
    entry.contentType
  ].domainOverrides.filter((candidate) => candidate.id !== entry.id);
}

function fieldIds(row: YamlTableRow): string {
  return getRowFields(row)
    .map((field) => field.id)
    .join(' ');
}

function cell(child: Node): HTMLTableCellElement {
  const td = el('td');
  td.append(child);
  return td;
}

function renderFilter(options: YamlConfigEditorViewOptions): HTMLElement {
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

function renderScopedValues(
  options: YamlConfigEditorViewOptions,
  fieldName: 'defaultValue' | 'valuePath',
  values: YamlContentScopedValue[]
): HTMLElement {
  const list = el('div', {
    className: 'yaml-content-value-list',
    dataset: { yamlFieldValues: fieldName }
  });
  values.forEach(({ contentType, value }) => {
    list.append(
      el(
        'span',
        {
          className: 'yaml-content-value',
          dataset: { mode: contentType }
        },
        el('span', {
          className: 'yaml-content-value-label',
          text: options.labels.contentTypes[contentType]
        }),
        el('code', {
          className: 'yaml-content-value-code',
          text: value || '-'
        })
      )
    );
  });
  return list;
}

function renderDefaultValueControl(
  options: YamlConfigEditorViewOptions,
  row: YamlTableRow
): HTMLElement {
  const scopedValues = getRowScopedDefaultValues(row, options.filter);
  if (scopedValues) {
    return renderScopedValues(options, 'defaultValue', scopedValues);
  }
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
  const scopedValues = getRowScopedValuePaths(row, options.filter);
  if (scopedValues) {
    return renderScopedValues(options, 'valuePath', scopedValues);
  }
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

function renderDeleteButton(
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

function renderFieldTable(options: YamlConfigEditorViewOptions): HTMLElement {
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

function renderDomainMeta(
  options: YamlConfigEditorViewOptions,
  entry: YamlEditorDomainEntry
): HTMLElement {
  const meta = el('div', { className: 'yaml-rule-meta' });
  meta.append(
    selectInput<YamlContentType>({
      className: 'select',
      value: entry.contentType,
      options: YAML_EDITOR_CONTENT_TYPES.map((contentType) => ({
        value: contentType,
        label: options.labels.contentTypes[contentType]
      })),
      onChange: (contentType) => {
        moveDomainEntry(options.state, entry, contentType);
        options.onChange();
        options.onRender();
      }
    }),
    textInput({
      className: 'input mono',
      value: entry.domain,
      placeholder: options.labels.table.domainPlaceholder,
      dataset: { yamlDomain: 'domain' },
      onInput: (value) => {
        entry.domain = value;
        options.onChange();
      }
    }),
    renderDeleteButton(
      options.labels.table.domainRemoveRule,
      () => removeDomainEntry(options.state, entry),
      options
    )
  );
  return meta;
}

function renderDomainField(
  options: YamlConfigEditorViewOptions,
  entry: YamlEditorDomainEntry,
  field: YamlEditorDomainField
): HTMLElement {
  const row = el('div', {
    className: 'schema-row yaml-domain-field-row',
    dataset: { domainFieldId: field.id }
  });
  const availableFields = getAvailableFields(options.state, entry.contentType);
  const fieldOptions = availableFields.some((candidate) => candidate.name === field.name)
    ? availableFields
    : [
        {
          id: `missing-${field.id}`,
          name: field.name,
          type: field.type,
          enabled: field.enabled,
          defaultValue: field.defaultValue,
          valuePath: field.valuePath,
          required: false,
          builtIn: false,
          isCustom: true
        } satisfies YamlEditorField,
        ...availableFields
      ];
  const enabled = el('input', {
    className: 'schema-switch-input',
    type: 'checkbox',
    dataset: { yamlDomainField: 'enabled' }
  });
  enabled.checked = field.enabled;
  enabled.addEventListener('change', () => {
    field.enabled = enabled.checked;
    options.onChange();
  });
  row.append(
    enabled,
    selectInput<string>({
      className: 'select',
      value: field.name,
      options: fieldOptions.map((candidate) => ({
        value: candidate.name,
        label: candidate.name
      })),
      dataset: { yamlDomainField: 'name' },
      onChange: (value) => {
        const definition = availableFields.find((candidate) => candidate.name === value);
        field.name = value;
        field.type = definition?.type ?? field.type;
        field.valuePath ||= definition?.valuePath ?? '';
        options.onChange();
      }
    }),
    textInput({
      className: 'input mono',
      value: field.defaultValue,
      placeholder: options.labels.table.defaultValue,
      dataset: { yamlField: 'defaultValue', yamlDomainField: 'defaultValue' },
      onInput: (value) => {
        field.defaultValue = value;
        options.onChange();
      }
    }),
    textInput({
      className: 'input mono',
      value: field.valuePath,
      placeholder: options.labels.table.valuePathPlaceholder,
      dataset: { yamlField: 'valuePath', yamlDomainField: 'valuePath' },
      onInput: (value) => {
        field.valuePath = value;
        options.onChange();
      }
    }),
    renderDeleteButton(
      options.labels.table.domainRemoveField,
      () => {
        entry.fields = entry.fields.filter((candidate) => candidate.id !== field.id);
      },
      options
    )
  );
  return row;
}

function renderDomainRule(
  options: YamlConfigEditorViewOptions,
  entry: YamlEditorDomainEntry
): HTMLElement {
  const card = el('section', {
    className: 'yaml-domain-rule stitch-yaml-domain-rule',
    dataset: { domainRuleId: entry.id }
  });
  const fields = el('div', { className: 'schema-stack' });
  fields.append(
    el('div', {
      className: 'yaml-domain-errors',
      dataset: { yamlDomainErrors: entry.id }
    })
  );
  entry.fields.forEach((field) => fields.append(renderDomainField(options, entry, field)));
  fields.append(
    button({
      className: 'schema-button yaml-action-button secondary',
      text: options.labels.table.addDomainField,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        entry.fields.push(createDomainField(options.state, entry.contentType));
        options.onChange();
        options.onRender();
      }
    })
  );
  card.append(renderDomainMeta(options, entry), fields);
  return card;
}

function renderDomainRules(options: YamlConfigEditorViewOptions): HTMLElement {
  const grid = el('div', { className: 'yaml-domain-grid stitch-yaml-domain-grid' });
  const entries = getDomainEntries(options.state);
  if (!entries.length) {
    grid.append(el('p', { className: 'yaml-helper', text: options.labels.table.emptyDomainRules }));
    return grid;
  }
  entries.forEach((entry) => grid.append(renderDomainRule(options, entry)));
  return grid;
}

function renderActions(options: YamlConfigEditorViewOptions): HTMLElement {
  const actions = el('div', { className: 'yaml-actions stitch-yaml-actions' });
  actions.append(
    button({
      className: 'schema-button yaml-action-button primary',
      text: options.labels.table.addField,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        createCustomField(options.state, options.filter);
        options.onChange();
        options.onRender();
      }
    }),
    button({
      className: 'schema-button yaml-action-button secondary',
      text: options.labels.table.addDomainRule,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        addDomainRule(options.state, options.filter);
        options.onChange();
        options.onRender();
      }
    })
  );
  return actions;
}

function updateYamlPreview(host: HTMLElement, options: YamlConfigEditorViewOptions): void {
  const target = host.querySelector<HTMLElement>('[data-yaml-preview="content"] pre');
  if (!target) {
    return;
  }
  target.replaceChildren(
    target.ownerDocument.createTextNode(
      buildYamlEditorPreview(options.state, options.filter, options.labels.contentTypes)
    )
  );
}

function renderPreview(options: YamlConfigEditorViewOptions): HTMLElement {
  const details = el('details', { className: 'u-mt-block yaml-preview-details' });
  const output = el('div', {
    className: 'yaml-preview',
    dataset: { yamlPreview: 'content' }
  });
  output.append(
    el('pre', {
      text: buildYamlEditorPreview(options.state, options.filter, options.labels.contentTypes)
    })
  );
  details.append(el('summary', { text: options.labels.table.previewSummary }), output);
  return details;
}

function formatError(error: YamlEditorValidationError, labels: YamlEditorLabels): string {
  if (error.code === 'default_invalid' && error.message in labels.errors) {
    return labels.errors[error.message] ?? labels.errors.default_invalid ?? error.message;
  }
  return labels.errors[error.code] ?? error.message;
}

function renderErrorList(
  errors: YamlEditorValidationError[],
  className: string,
  labels: YamlEditorLabels
) {
  const list = el('ul', { className });
  Array.from(new Set(errors.map((error) => formatError(error, labels)))).forEach((message) => {
    list.append(el('li', { text: message }));
  });
  return list;
}

export function renderYamlEditorValidation(
  container: HTMLElement | null,
  validation: YamlEditorValidation | null,
  labels: YamlEditorLabels = FALLBACK_YAML_EDITOR_LABELS
): void {
  if (!container) {
    return;
  }
  container
    .querySelectorAll('.yaml-row-errors, .yaml-domain-error-list')
    .forEach((node) => node.remove());
  container.querySelectorAll('.is-invalid').forEach((node) => node.classList.remove('is-invalid'));

  const global = container.querySelector<HTMLElement>('[data-yaml-errors="global"]');
  if (global) {
    global.replaceChildren();
    if (validation && !validation.valid) {
      global.append(
        el('p', {
          className: 'yaml-global-error-list',
          text: labels.table.invalidWarning
        })
      );
    }
    if (validation?.globalErrors.length) {
      global.append(renderErrorList(validation.globalErrors, 'yaml-global-error-list', labels));
    }
  }

  Object.entries(validation?.fieldErrors ?? {}).forEach(([fieldId, errors]) => {
    const row = Array.from(container.querySelectorAll<HTMLElement>('[data-field-ids]')).find(
      (candidate) => (candidate.dataset.fieldIds ?? '').split(' ').includes(fieldId)
    );
    if (!row) {
      return;
    }
    row.classList.add('is-invalid');
    row
      .querySelector<HTMLTableCellElement>('td:last-child')
      ?.append(renderErrorList(errors, 'yaml-row-errors', labels));
  });

  Object.entries(validation?.domainErrors ?? {}).forEach(([entryId, errors]) => {
    const card = Array.from(container.querySelectorAll<HTMLElement>('[data-domain-rule-id]')).find(
      (candidate) => candidate.dataset.domainRuleId === entryId
    );
    card?.classList.add('is-invalid');
    card
      ?.querySelector<HTMLElement>('[data-yaml-domain-errors]')
      ?.append(renderErrorList(errors, 'yaml-domain-error-list', labels));
  });
}

export function renderYamlConfigEditorView(options: YamlConfigEditorViewOptions): HTMLElement {
  const host = el('div', {
    className: 'schema-widget-stack yaml-config-widget stitch-yaml-config-widget',
    dataset: { stitchWidget: 'yaml-config' }
  });
  const liveOptions: YamlConfigEditorViewOptions = {
    ...options,
    onChange: () => {
      options.onChange();
      updateYamlPreview(host, liveOptions);
    }
  };
  host.append(
    el('div', {
      className: 'yaml-validation-errors stitch-yaml-validation-errors',
      dataset: { yamlErrors: 'global' }
    }),
    renderFilter(liveOptions),
    renderFieldTable(liveOptions),
    renderDomainRules(liveOptions),
    renderActions(liveOptions),
    el('p', { className: 'yaml-helper', text: options.labels.table.helper }),
    renderPreview(liveOptions)
  );
  renderYamlEditorValidation(host, options.validation, options.labels);
  return host;
}
