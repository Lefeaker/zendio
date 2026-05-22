import type { YamlContentType } from '@shared/types/yamlConfig';
import {
  ensureDomainEntryFields,
  findFieldDefinition,
  formatArrayValue,
  getFieldOptionsForEntry
} from './yamlConfigTableModel';
import {
  CONTENT_TYPES,
  type DomainFieldRow,
  type DomainOverrideEntry
} from './yamlConfigTableTypes';
import { createYamlConfigControllerRowId } from './yamlConfigTableControllerRows';
import type { YamlConfigControllerInternalState } from './yamlConfigTableControllerStateTypes';

export function addYamlConfigDomainEntry(
  state: YamlConfigControllerInternalState
): DomainOverrideEntry {
  const entry: DomainOverrideEntry = {
    id: createYamlConfigControllerRowId('domain'),
    domain: '',
    contentType: CONTENT_TYPES[0],
    fields: []
  };
  state.domainEntries.push(entry);
  return entry;
}

export function removeYamlConfigDomainEntry(
  state: YamlConfigControllerInternalState,
  entryId: string
): void {
  state.domainEntries = state.domainEntries.filter((entry) => entry.id !== entryId);
}

export function updateYamlConfigDomainInput(entry: DomainOverrideEntry, value: string): void {
  entry.domain = value;
}

export function setYamlConfigDomainContentType(
  state: YamlConfigControllerInternalState,
  entry: DomainOverrideEntry,
  contentType: YamlContentType,
  isFieldAvailableForContentType: (fieldName: string, contentType: YamlContentType) => boolean
): void {
  entry.contentType = contentType;
  ensureDomainEntryFields(entry, state.rows, isFieldAvailableForContentType);
}

export function addYamlConfigDomainField(
  state: YamlConfigControllerInternalState,
  entry: DomainOverrideEntry
): DomainFieldRow | null {
  const candidates = getFieldOptionsForEntry(state.rows, entry);
  if (!candidates.length) {
    return null;
  }
  const definition = candidates[0];
  const field: DomainFieldRow = {
    id: createYamlConfigControllerRowId(`${entry.domain || 'domain'}-${definition.name}`),
    name: definition.name,
    type: definition.type,
    enabled: definition.enabled[entry.contentType] ?? true,
    defaultValue: '',
    valuePath: definition.valuePath ?? ''
  };
  entry.fields.push(field);
  return field;
}

export function removeYamlConfigDomainField(
  state: YamlConfigControllerInternalState,
  entryId: string,
  fieldId: string
): boolean {
  const entry = state.domainEntries.find((item) => item.id === entryId);
  if (!entry) {
    return false;
  }
  entry.fields = entry.fields.filter((field) => field.id !== fieldId);
  return true;
}

export function updateYamlConfigDomainFieldName(
  state: YamlConfigControllerInternalState,
  entry: DomainOverrideEntry,
  field: DomainFieldRow,
  name: string
): void {
  const definition = findFieldDefinition(state.rows, entry.contentType, name);
  field.name = name;
  field.type = definition?.type ?? 'text';
  field.enabled = definition?.enabled[entry.contentType] ?? true;
  field.defaultValue = '';
  field.valuePath = definition?.valuePath ?? '';
}

export function setYamlConfigDomainFieldEnabled(field: DomainFieldRow, checked: boolean): void {
  field.enabled = checked;
}

export function updateYamlConfigDomainFieldDefaultValue(
  field: DomainFieldRow,
  value: string
): void {
  field.defaultValue = value;
}

export function normalizeYamlConfigDomainFieldDefaultValue(
  field: DomainFieldRow,
  value: string
): string {
  const normalized = field.type === 'array' ? formatArrayValue(value) : value;
  field.defaultValue = normalized;
  return normalized;
}

export function updateYamlConfigDomainFieldValuePath(field: DomainFieldRow, value: string): void {
  field.valuePath = value;
}

export function normalizeYamlConfigDomainFieldValuePath(
  field: DomainFieldRow,
  value: string
): string {
  const trimmed = value.trim();
  field.valuePath = trimmed ? trimmed : '';
  return field.valuePath ?? '';
}
