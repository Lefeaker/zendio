import {
  validateYamlConfig,
  type YamlValidationResult
} from '@ui/domains/yaml-config/yamlConfigTableValidation';
import type { DomainOverrideEntry, FieldRow } from '@ui/domains/yaml-config/yamlConfigTableTypes';
import type { YamlContentType } from '@shared/types/yamlConfig';
import { DOMAIN_LABELS, TABLE_LABELS } from './labels';
import {
  CONTENT_TYPES,
  createToggleMap,
  getFieldsForContentType,
  getRowDefaultValue,
  getRowValuePath,
  type YamlDomainEntry,
  type YamlFieldRow
} from './model';

function mergeValidationMessages(
  target: Map<string, string[]>,
  key: string,
  messages: string[]
): void {
  const existing = target.get(key) ?? [];
  messages.forEach((message) => {
    if (!existing.includes(message)) {
      existing.push(message);
    }
  });
  if (existing.length) {
    target.set(key, existing);
  }
}

function mergeValidationResult(target: YamlValidationResult, source: YamlValidationResult): void {
  source.rowErrors.forEach((errors, rowId) => {
    mergeValidationMessages(target.rowErrors, rowId, errors);
  });
  source.domainErrors.forEach((errors, domainId) => {
    mergeValidationMessages(target.domainErrors, domainId, errors);
  });
  source.globalErrors.forEach((message) => {
    if (!target.globalErrors.includes(message)) {
      target.globalErrors.push(message);
    }
  });
}

function shouldValidateRowForContentType(row: YamlFieldRow, contentType: YamlContentType): boolean {
  if (row.builtIn) {
    return row.supported[contentType] || row.enabled[contentType];
  }
  if (row.isGlobal || row.enabled[contentType] || row.originTypes.has(contentType)) {
    return true;
  }
  return contentType === 'article' && !CONTENT_TYPES.some((type) => row.enabled[type]);
}

function createValidationRowsForContentType(
  rows: YamlFieldRow[],
  contentType: YamlContentType
): FieldRow[] {
  return rows
    .filter((row) => shouldValidateRowForContentType(row, contentType))
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      defaultValue: getRowDefaultValue(row, contentType),
      enabled: { ...createToggleMap(false), [contentType]: row.enabled[contentType] },
      supported: { ...createToggleMap(false), [contentType]: row.supported[contentType] },
      builtIn: row.builtIn,
      isCustom: !row.builtIn || row.isGlobal,
      required: row.required,
      valuePath: getRowValuePath(row, contentType),
      originTypes: row.originTypes.has(contentType)
        ? new Set<YamlContentType>([contentType])
        : new Set<YamlContentType>()
    })) as FieldRow[];
}

function createValidationDomainEntriesForContentType(
  domainEntries: YamlDomainEntry[],
  contentType: YamlContentType
): DomainOverrideEntry[] {
  return domainEntries
    .filter((entry) => entry.contentType === contentType)
    .map((entry) => ({
      id: entry.id,
      domain: entry.domain,
      contentType: entry.contentType,
      fields: entry.fields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        enabled: field.enabled,
        defaultValue: field.defaultValue,
        valuePath: field.valuePath
      }))
    })) as DomainOverrideEntry[];
}

export function validateYamlWidgetState(
  rows: YamlFieldRow[],
  domainEntries: YamlDomainEntry[]
): YamlValidationResult {
  const aggregate: YamlValidationResult = {
    rowErrors: new Map(),
    domainErrors: new Map(),
    globalErrors: []
  };

  CONTENT_TYPES.forEach((contentType) => {
    const validation = validateYamlConfig({
      rows: createValidationRowsForContentType(rows, contentType),
      domainEntries: createValidationDomainEntriesForContentType(domainEntries, contentType),
      tableLabels: TABLE_LABELS,
      domainLabels: DOMAIN_LABELS,
      isFieldAvailableForContentType: (fieldName, candidateType) =>
        getFieldsForContentType(rows, candidateType).some(
          (row) => row.name.trim() === fieldName.trim()
        )
    });
    mergeValidationResult(aggregate, validation);
  });

  return aggregate;
}

export function hasValidationErrors(validation: YamlValidationResult): boolean {
  return Boolean(
    validation.globalErrors.length || validation.rowErrors.size || validation.domainErrors.size
  );
}

function renderErrorList(errors: string[], className: string): HTMLElement {
  const list = document.createElement('ul');
  list.className = className;
  Array.from(new Set(errors)).forEach((message) => {
    const item = document.createElement('li');
    item.textContent = message;
    list.append(item);
  });
  return list;
}

export function renderValidationState(
  container: HTMLElement | null,
  validation: YamlValidationResult | null
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
    const errors = validation?.globalErrors ?? [];
    if (errors.length) {
      global.append(renderErrorList(errors, 'yaml-global-error-list'));
    }
  }

  validation?.rowErrors.forEach((errors, rowId) => {
    const row = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]')).find(
      (candidate) => candidate.dataset.rowId === rowId
    );
    if (!row) {
      return;
    }
    row.classList.add('is-invalid');
    row
      .querySelector<HTMLTableCellElement>('td:last-child')
      ?.append(renderErrorList(errors, 'yaml-row-errors'));
  });

  validation?.domainErrors.forEach((errors, entryId) => {
    const card = Array.from(container.querySelectorAll<HTMLElement>('[data-domain-rule-id]')).find(
      (candidate) => candidate.dataset.domainRuleId === entryId
    );
    const host = card?.querySelector<HTMLElement>('[data-yaml-domain-errors]');
    card?.classList.add('is-invalid');
    host?.append(renderErrorList(errors, 'yaml-domain-error-list'));
  });
}
