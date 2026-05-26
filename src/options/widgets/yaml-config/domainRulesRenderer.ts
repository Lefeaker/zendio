import type { YamlContentType } from '@shared/types/yamlConfig';
import { button, el, selectInput, textInput } from './dom';
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
  const grid = el('div', { className: 'yaml-domain-grid stitch-yaml-domain-grid' });
  if (!entries.length) {
    grid.append(el('p', { className: 'yaml-helper', text: DOMAIN_LABELS.empty }));
    return grid;
  }

  entries.forEach((entry) => {
    const card = el('section', {
      className: 'yaml-domain-rule stitch-yaml-domain-rule',
      dataset: { domainRuleId: entry.id }
    });
    card.append(renderRuleMeta(entry, callbacks), renderRuleFields(entry, rows, callbacks));
    grid.append(card);
  });
  return grid;
}

function renderRuleMeta(entry: YamlDomainEntry, callbacks: DomainRulesCallbacks): HTMLElement {
  const meta = el('div', { className: 'yaml-rule-meta' });
  const typeSelect = selectInput<YamlContentType>({
    className: 'select',
    value: entry.contentType,
    options: CONTENT_TYPES.map((type) => ({ value: type, label: CONTENT_TYPE_LABELS[type] })),
    onChange: (value) => {
      entry.contentType = value;
      callbacks.markDirty();
      callbacks.render();
    }
  });

  const domain = textInput({
    className: 'input mono',
    value: entry.domain,
    placeholder: DOMAIN_LABELS.placeholder,
    dataset: { yamlDomain: 'domain' },
    onInput: (value) => {
      entry.domain = value;
      callbacks.markDirty();
    }
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
  const fields = el('div', { className: 'schema-stack' });
  const domainErrors = el('div', {
    className: 'yaml-domain-errors',
    dataset: { yamlDomainErrors: entry.id }
  });
  fields.append(domainErrors);
  entry.fields.forEach((field) => {
    fields.append(renderDomainFieldRow(entry, field, rows, callbacks));
  });

  const addField = button({
    className: 'schema-button yaml-action-button secondary',
    text: DOMAIN_LABELS.addField,
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      entry.fields.push(createDomainField(rows, entry.contentType));
      callbacks.markDirty();
      callbacks.render();
    }
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
  const row = el('div', {
    className: 'schema-row yaml-domain-field-row',
    dataset: { domainFieldId: field.id }
  });
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
  return selectInput<string>({
    className: 'select',
    value: field.name,
    options: getDomainFieldOptions(rows, entry, field).map((candidate) => ({
      value: candidate.name,
      label: candidate.name
    })),
    dataset: { yamlDomainField: 'name' },
    onChange: (value) => {
      const definition = rows.find((candidate) => candidate.name === value);
      field.name = value;
      field.type = definition?.type ?? field.type;
      field.valuePath ||= definition?.valuePath ?? '';
      callbacks.markDirty();
    }
  });
}

function renderDomainTextInput(
  value: string,
  fieldName: string,
  update: (value: string) => void,
  callbacks: Pick<DomainRulesCallbacks, 'markDirty'>
): HTMLInputElement {
  return textInput({
    className: 'input mono',
    value,
    placeholder:
      fieldName === 'valuePath' ? TABLE_LABELS.valuePathPlaceholder : TABLE_LABELS.valuePlaceholder,
    dataset: {
      yamlField: fieldName,
      yamlDomainField: fieldName
    },
    onInput: (nextValue) => {
      update(nextValue);
      callbacks.markDirty();
    }
  });
}
