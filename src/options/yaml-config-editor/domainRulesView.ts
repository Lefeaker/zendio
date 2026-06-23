import type { YamlContentType } from '@shared/types/yamlConfig';
import { button, el, selectInput, textInput } from './dom';
import type { YamlEditorLabels } from './labels';
import {
  YAML_EDITOR_CONTENT_TYPES,
  type YamlEditorDomainEntry,
  type YamlEditorDomainField,
  type YamlEditorField,
  type YamlEditorState
} from './types';
import { allocateId, type YamlEditorFilter } from './rowModel';
import type { YamlConfigEditorViewOptions } from './fieldRowsView';
import { cell, renderDeleteButton } from './fieldRowsView';

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

function createDomainField(state: YamlEditorState): YamlEditorDomainField {
  return {
    id: allocateId(state, 'domain-field'),
    name: '',
    type: 'text',
    enabled: true,
    defaultValue: '',
    valuePath: ''
  };
}

export function addDomainRule(
  state: YamlEditorState,
  filter: YamlEditorFilter
): { domainEntryId: string; domainFieldId: string } {
  const contentType = filter === 'all' ? 'article' : filter;
  const field = createDomainField(state);
  const entryId = allocateId(state, `domain-${contentType}`);
  state.contentTypes[contentType].domainOverrides.push({
    id: entryId,
    domain: '',
    contentType,
    fields: [field]
  });
  return { domainEntryId: entryId, domainFieldId: field.id };
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
): HTMLTableRowElement {
  const row = el('tr', {
    className: 'yaml-domain-field-row',
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
    cell(enabled),
    cell(
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
      })
    ),
    cell(
      textInput({
        className: 'input mono',
        value: field.defaultValue,
        placeholder: options.labels.table.defaultValue,
        dataset: { yamlField: 'defaultValue', yamlDomainField: 'defaultValue' },
        onInput: (value) => {
          field.defaultValue = value;
          options.onChange();
        }
      })
    ),
    cell(
      textInput({
        className: 'input mono',
        value: field.valuePath,
        placeholder: options.labels.table.valuePathPlaceholder,
        dataset: { yamlField: 'valuePath', yamlDomainField: 'valuePath' },
        onInput: (value) => {
          field.valuePath = value;
          options.onChange();
        }
      })
    ),
    cell(
      renderDeleteButton(
        options.labels.table.domainRemoveField,
        () => {
          entry.fields = entry.fields.filter((candidate) => candidate.id !== field.id);
        },
        options
      )
    )
  );
  return row;
}

function renderDomainFieldsTable(
  options: YamlConfigEditorViewOptions,
  entry: YamlEditorDomainEntry
): HTMLElement {
  const shell = el('div', {
    className: 'yaml-table-shell yaml-table-scroll yaml-domain-fields-shell'
  });
  const table = el('table', { className: 'schema-table stitch-yaml-domain-fields-table' });
  const thead = el('thead');
  const header = el('tr');
  [
    '',
    options.labels.table.field,
    options.labels.table.defaultValue,
    options.labels.table.valuePath,
    options.labels.table.actions
  ].forEach((label) => header.append(el('th', { text: label })));
  thead.append(header);
  const tbody = el('tbody');
  entry.fields.forEach((field) => tbody.append(renderDomainField(options, entry, field)));
  table.append(thead, tbody);
  shell.append(table);
  return shell;
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
  fields.append(
    renderDomainFieldsTable(options, entry),
    button({
      className: 'schema-button yaml-action-button secondary',
      text: options.labels.table.addDomainField,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const field = createDomainField(options.state);
        entry.fields.push(field);
        options.onChange();
        options.onRender({
          scrollTarget: {
            kind: 'domainField',
            domainEntryId: entry.id,
            fieldId: field.id
          }
        });
      }
    })
  );
  card.append(renderDomainMeta(options, entry), fields);
  return card;
}

export function renderDomainRules(options: YamlConfigEditorViewOptions): HTMLElement {
  const grid = el('div', { className: 'yaml-domain-grid stitch-yaml-domain-grid' });
  const entries = getDomainEntries(options.state);
  if (!entries.length) {
    grid.append(el('p', { className: 'yaml-helper', text: options.labels.table.emptyDomainRules }));
    return grid;
  }
  entries.forEach((entry) => grid.append(renderDomainRule(options, entry)));
  return grid;
}

export type { YamlEditorLabels };
