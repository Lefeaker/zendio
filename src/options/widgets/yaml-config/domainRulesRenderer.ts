import type { YamlContentType } from '@shared/types/yamlConfig';
import { CONTENT_TYPE_LABELS, DOMAIN_LABELS, TABLE_LABELS } from './labels';
import { renderDeleteButton, type FieldTableCallbacks } from './fieldTableRenderer';
import {
  CONTENT_TYPES,
  createDomainField,
  getDomainFieldOptions,
  type YamlDomainEntry,
  type YamlDomainField,
  type YamlFieldRow
} from './model';

export interface DomainRulesCallbacks extends Pick<FieldTableCallbacks, 'markDirty' | 'render'> {
  addDomainEntry(entry: YamlDomainEntry): void;
  removeDomainEntry(entry: YamlDomainEntry): void;
}

export function renderDomainRules(
  entries: YamlDomainEntry[],
  rows: YamlFieldRow[],
  callbacks: DomainRulesCallbacks
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'yaml-domain-grid stitch-yaml-domain-grid';
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'yaml-helper';
    empty.textContent = DOMAIN_LABELS.empty;
    grid.append(empty);
    return grid;
  }

  entries.forEach((entry) => {
    const card = document.createElement('section');
    card.className = 'yaml-domain-rule stitch-yaml-domain-rule';
    card.dataset.domainRuleId = entry.id;
    card.append(renderRuleMeta(entry, callbacks), renderRuleFields(entry, rows, callbacks));
    grid.append(card);
  });
  return grid;
}

function renderRuleMeta(entry: YamlDomainEntry, callbacks: DomainRulesCallbacks): HTMLElement {
  const meta = document.createElement('div');
  meta.className = 'yaml-rule-meta';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'select';
  CONTENT_TYPES.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = CONTENT_TYPE_LABELS[type];
    option.selected = entry.contentType === type;
    typeSelect.append(option);
  });
  typeSelect.addEventListener('change', () => {
    entry.contentType = typeSelect.value as YamlContentType;
    callbacks.markDirty();
    callbacks.render();
  });

  const domain = document.createElement('input');
  domain.className = 'input mono';
  domain.value = entry.domain;
  domain.placeholder = DOMAIN_LABELS.placeholder;
  domain.dataset.yamlDomain = 'domain';
  domain.addEventListener('input', () => {
    entry.domain = domain.value;
    callbacks.markDirty();
  });
  meta.append(
    typeSelect,
    domain,
    renderDeleteButton(() => callbacks.removeDomainEntry(entry), callbacks)
  );
  return meta;
}

function renderRuleFields(
  entry: YamlDomainEntry,
  rows: YamlFieldRow[],
  callbacks: DomainRulesCallbacks
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'schema-stack';
  const domainErrors = document.createElement('div');
  domainErrors.className = 'yaml-domain-errors';
  domainErrors.dataset.yamlDomainErrors = entry.id;
  fields.append(domainErrors);
  entry.fields.forEach((field) => {
    fields.append(renderDomainFieldRow(entry, field, rows, callbacks));
  });

  const addField = document.createElement('button');
  addField.type = 'button';
  addField.className = 'schema-button yaml-action-button secondary';
  addField.textContent = DOMAIN_LABELS.addField;
  addField.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    entry.fields.push(createDomainField(rows, entry.contentType));
    callbacks.markDirty();
    callbacks.render();
  });
  fields.append(addField);
  return fields;
}

function renderDomainFieldRow(
  entry: YamlDomainEntry,
  field: YamlDomainField,
  rows: YamlFieldRow[],
  callbacks: DomainRulesCallbacks
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'schema-row yaml-domain-field-row';
  row.dataset.domainFieldId = field.id;
  row.append(
    renderEnabledCheckbox(field, callbacks),
    renderFieldSelect(entry, field, rows, callbacks),
    renderDomainTextInput(
      field.defaultValue,
      'defaultValue',
      (value) => {
        field.defaultValue = value;
      },
      callbacks
    ),
    renderDomainTextInput(
      field.valuePath,
      'valuePath',
      (value) => {
        field.valuePath = value;
      },
      callbacks
    ),
    renderDeleteButton(() => {
      entry.fields = entry.fields.filter((candidate) => candidate !== field);
    }, callbacks)
  );
  return row;
}

function renderEnabledCheckbox(
  field: YamlDomainField,
  callbacks: Pick<DomainRulesCallbacks, 'markDirty'>
): HTMLInputElement {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'schema-switch-input';
  checkbox.dataset.yamlDomainField = 'enabled';
  checkbox.checked = field.enabled;
  checkbox.addEventListener('change', () => {
    field.enabled = checkbox.checked;
    callbacks.markDirty();
  });
  return checkbox;
}

function renderFieldSelect(
  entry: YamlDomainEntry,
  field: YamlDomainField,
  rows: YamlFieldRow[],
  callbacks: Pick<DomainRulesCallbacks, 'markDirty'>
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'select';
  select.dataset.yamlDomainField = 'name';
  getDomainFieldOptions(rows, entry, field).forEach((candidate) => {
    const option = document.createElement('option');
    option.value = candidate.name;
    option.textContent = candidate.name;
    option.selected = field.name === candidate.name;
    select.append(option);
  });
  select.addEventListener('change', () => {
    const definition = rows.find((candidate) => candidate.name === select.value);
    field.name = select.value;
    field.type = definition?.type ?? field.type;
    field.valuePath ||= definition?.valuePath ?? '';
    callbacks.markDirty();
  });
  return select;
}

function renderDomainTextInput(
  value: string,
  fieldName: string,
  update: (value: string) => void,
  callbacks: Pick<DomainRulesCallbacks, 'markDirty'>
): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'input mono';
  input.value = value;
  input.placeholder =
    fieldName === 'valuePath' ? TABLE_LABELS.valuePathPlaceholder : TABLE_LABELS.valuePlaceholder;
  input.dataset.yamlField = fieldName;
  input.dataset.yamlDomainField = fieldName;
  input.addEventListener('input', () => {
    update(input.value);
    callbacks.markDirty();
  });
  return input;
}
