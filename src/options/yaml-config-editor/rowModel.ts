import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
import { YAML_EDITOR_CONTENT_TYPES, type YamlEditorField, type YamlEditorState } from './types';

export type YamlEditorFilter = YamlContentType | 'all';

type YamlTableRowKind =
  | 'builtInDefaultField'
  | 'defaultCustomField'
  | 'userCreatedCustomField'
  | 'globalField';

export interface YamlTableCell {
  field?: YamlEditorField;
  operable: boolean;
}

export interface YamlTableRow {
  id: string;
  kind: YamlTableRowKind;
  fields: Partial<Record<YamlContentType, YamlEditorField>>;
  cells: Record<YamlContentType, YamlTableCell>;
  globalField?: YamlEditorField;
  builtIn: boolean;
  isCustom: boolean;
  defaultCustom: boolean;
}

export function allocateId(state: YamlEditorState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}-${state.nextId}`;
}

function createRowCells(
  fields: Partial<Record<YamlContentType, YamlEditorField>>,
  kind: YamlTableRowKind
): Record<YamlContentType, YamlTableCell> {
  return Object.fromEntries(
    YAML_EDITOR_CONTENT_TYPES.map((contentType) => {
      const field = fields[contentType];
      const operable =
        kind === 'defaultCustomField'
          ? Boolean(field)
          : kind !== 'builtInDefaultField' || Boolean(field);
      const cell: YamlTableCell = { operable };
      if (field) {
        cell.field = field;
      }
      return [contentType, cell];
    })
  ) as Record<YamlContentType, YamlTableCell>;
}

function getRowKind(field: YamlEditorField): YamlTableRowKind {
  if (field.builtIn) {
    return 'builtInDefaultField';
  }
  if (field.baselineKind === 'defaultCustomField') {
    return 'defaultCustomField';
  }
  return 'userCreatedCustomField';
}

function refreshRowCells(row: YamlTableRow): void {
  row.cells = createRowCells(row.fields, row.kind);
}

function addRowField(
  rows: Map<string, YamlTableRow>,
  contentType: YamlContentType,
  field: YamlEditorField
): void {
  const isDefaultCustom = field.baselineKind === 'defaultCustomField';
  const group = field.builtIn ? 'builtin' : isDefaultCustom ? 'default-custom' : 'custom';
  const identityName =
    isDefaultCustom && field.baselineName ? field.baselineName : field.name.trim() || field.id;
  const baseKey = `${group}:${isDefaultCustom ? `${contentType}:` : ''}${identityName}`;
  let key = baseKey;
  while (rows.get(key)?.fields[contentType]) {
    key = `${baseKey}:${field.id}`;
  }
  const row =
    rows.get(key) ??
    ({
      id: field.id,
      kind: getRowKind(field),
      fields: {},
      cells: createRowCells({}, getRowKind(field)),
      builtIn: field.builtIn,
      isCustom: field.isCustom || !field.builtIn,
      defaultCustom: isDefaultCustom
    } satisfies YamlTableRow);
  row.fields[contentType] = field;
  row.builtIn = row.builtIn || field.builtIn;
  row.isCustom = row.isCustom || field.isCustom || !field.builtIn;
  row.defaultCustom = row.defaultCustom || isDefaultCustom;
  refreshRowCells(row);
  rows.set(key, row);
}

export function buildRows(state: YamlEditorState, filter: YamlEditorFilter): YamlTableRow[] {
  const rows = new Map<string, YamlTableRow>();
  YAML_EDITOR_CONTENT_TYPES.forEach((contentType) => {
    if (filter !== 'all' && filter !== contentType) {
      return;
    }
    state.contentTypes[contentType].fields.forEach((field) =>
      addRowField(rows, contentType, field)
    );
    state.contentTypes[contentType].customFields.forEach((field) =>
      addRowField(rows, contentType, field)
    );
  });
  if (filter === 'all') {
    state.globalFields.forEach((field) => {
      rows.set(`global:${field.name.trim() || field.id}`, {
        id: field.id,
        kind: 'globalField',
        fields: {},
        cells: createRowCells({}, 'globalField'),
        globalField: field,
        builtIn: false,
        isCustom: true,
        defaultCustom: false
      });
    });
  }
  return Array.from(rows.values()).sort((a, b) => {
    if (a.builtIn !== b.builtIn) {
      return a.builtIn ? -1 : 1;
    }
    return getRowName(a).localeCompare(getRowName(b));
  });
}

export function getRowFields(row: YamlTableRow): YamlEditorField[] {
  return [
    ...YAML_EDITOR_CONTENT_TYPES.flatMap((contentType) => row.fields[contentType] ?? []),
    ...(row.globalField ? [row.globalField] : [])
  ];
}

function getPrimaryField(row: YamlTableRow): YamlEditorField {
  const field = getRowFields(row)[0];
  if (!field) {
    throw new Error('YAML editor row has no fields');
  }
  return field;
}

export function getRowName(row: YamlTableRow): string {
  return getPrimaryField(row).name;
}

export function getRowType(row: YamlTableRow): YamlFieldType {
  return getPrimaryField(row).type;
}

function getMergedRowValue(
  row: YamlTableRow,
  filter: YamlEditorFilter,
  readValue: (field: YamlEditorField) => string
): string {
  const filteredField = filter !== 'all' ? row.fields[filter] : undefined;
  if (filteredField) {
    return readValue(filteredField);
  }
  if (filter === 'all') {
    const contentValues = YAML_EDITOR_CONTENT_TYPES.flatMap((contentType) => {
      const field = row.fields[contentType];
      return field ? [readValue(field)] : [];
    });
    if (new Set(contentValues).size > 1) {
      return '';
    }
  }
  return readValue(getPrimaryField(row));
}

export function getRowDefaultValue(row: YamlTableRow, filter: YamlEditorFilter): string {
  return getMergedRowValue(row, filter, (field) => field.defaultValue);
}

export function getRowValuePath(row: YamlTableRow, filter: YamlEditorFilter): string {
  return getMergedRowValue(row, filter, (field) => field.valuePath);
}

export function updateRow(row: YamlTableRow, patch: Partial<YamlEditorField>): void {
  const nextPatch = { ...patch };
  if (row.defaultCustom) {
    delete nextPatch.name;
  }
  getRowFields(row).forEach((field) => {
    Object.assign(field, nextPatch);
  });
}

export function updateFilteredField(
  row: YamlTableRow,
  filter: YamlEditorFilter,
  patch: Partial<YamlEditorField>
): void {
  if (filter !== 'all' && row.fields[filter]) {
    Object.assign(row.fields[filter], patch);
    return;
  }
  updateRow(row, patch);
}

function cloneCustomField(
  state: YamlEditorState,
  row: YamlTableRow,
  contentType: YamlContentType,
  enabled: boolean
): YamlEditorField {
  const source = getPrimaryField(row);
  const field: YamlEditorField = {
    id: allocateId(state, `yaml-${source.name || 'custom'}`),
    name: source.name,
    type: source.type,
    enabled,
    required: source.required,
    defaultValue: source.defaultValue,
    valuePath: source.valuePath,
    builtIn: false,
    isCustom: true
  };
  state.contentTypes[contentType].customFields.push(field);
  row.fields[contentType] = field;
  refreshRowCells(row);
  return field;
}

export function setRowEnabled(
  state: YamlEditorState,
  row: YamlTableRow,
  contentType: YamlContentType,
  enabled: boolean
): void {
  if (!row.cells[contentType].operable) {
    return;
  }
  const field = row.fields[contentType];
  if (field) {
    field.enabled = enabled;
    return;
  }
  if (row.defaultCustom) {
    return;
  }
  if (!row.builtIn) {
    cloneCustomField(state, row, contentType, enabled);
  }
}

export function removeRow(state: YamlEditorState, row: YamlTableRow): void {
  if (row.builtIn || row.defaultCustom) {
    return;
  }
  YAML_EDITOR_CONTENT_TYPES.forEach((contentType) => {
    const ids = new Set(getRowFields(row).map((field) => field.id));
    state.contentTypes[contentType].customFields = state.contentTypes[
      contentType
    ].customFields.filter((field) => !ids.has(field.id));
  });
  if (row.globalField) {
    state.globalFields = state.globalFields.filter((field) => field.id !== row.globalField?.id);
  }
}
