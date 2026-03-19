import { DEFAULT_YAML_CONFIG } from '@shared/config';
import type {
  PartialContentTypeYamlConfig,
  YamlConfigOverrides,
  YamlContentType,
  YamlFieldConfig,
  YamlFieldType
} from '@shared/types/yamlConfig';

export type TypeToggleMap = Record<YamlContentType, boolean>;

export interface FieldRow {
  id: string;
  name: string;
  type: YamlFieldType;
  defaultValue: string;
  enabled: TypeToggleMap;
  supported: TypeToggleMap;
  builtIn: boolean;
  isCustom: boolean;
  required: boolean;
  valuePath?: string;
  originTypes: Set<YamlContentType>;
}

export interface DomainFieldRow {
  id: string;
  name: string;
  type: YamlFieldType;
  enabled: boolean;
  defaultValue: string;
  valuePath?: string;
}

export interface DomainOverrideEntry {
  id: string;
  domain: string;
  contentType: YamlContentType;
  fields: DomainFieldRow[];
}

export const CONTENT_TYPES: YamlContentType[] = ['article', 'clipper', 'video', 'ai_chat'];
export const TYPE_OPTIONS: YamlFieldType[] = ['text', 'number', 'boolean', 'date', 'array'];

const ARRAY_SPLIT_PATTERN = /[;\n,]+/;

export function createToggleMap(initial: boolean): TypeToggleMap {
  return {
    article: initial,
    clipper: initial,
    video: initial,
    ai_chat: initial
  };
}

export function stringifyDefaultValue(type: YamlFieldType, value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (type === 'array') {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join('; ');
    }
    return formatArrayValue(String(value));
  }
  if (type === 'boolean') {
    return String(Boolean(value));
  }
  if (type === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : '';
  }
  return String(value);
}

export function extractArrayItems(raw: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(ARRAY_SPLIT_PATTERN)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function formatArrayValue(raw: string): string {
  const items = extractArrayItems(raw);
  return items.join('; ');
}

export function parseDefaultValueWithValidation(
  type: YamlFieldType,
  value: string
): { value?: unknown; error?: string } {
  if (!value.trim()) {
    return {};
  }
  switch (type) {
    case 'number': {
      const numeric = Number(value.trim());
      if (!Number.isFinite(numeric)) {
        return { error: 'INVALID_NUMBER' };
      }
      return { value: numeric };
    }
    case 'boolean': {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return { value: true };
      }
      if (normalized === 'false') {
        return { value: false };
      }
      return { error: 'INVALID_BOOLEAN' };
    }
    case 'array': {
      const items = extractArrayItems(value);
      if (!items.length) {
        return { error: 'INVALID_ARRAY' };
      }
      return { value: items };
    }
    default:
      return { value };
  }
}

export function parseDefaultValue(type: YamlFieldType, value: string): unknown {
  const { value: parsed, error } = parseDefaultValueWithValidation(type, value);
  return error ? undefined : parsed;
}

export function buildFieldConfig(
  row: FieldRow,
  enabled: boolean,
  defaultTemplate?: YamlFieldConfig
): YamlFieldConfig {
  const config: YamlFieldConfig = {
    name: row.name.trim(),
    type: row.type,
    enabled
  };

  if (row.required && defaultTemplate?.required) {
    config.required = true;
  }
  const trimmedPath = row.valuePath?.trim();
  if (trimmedPath) {
    config.valuePath = trimmedPath;
  }

  const parsed = parseDefaultValue(row.type, row.defaultValue ?? '');
  if (parsed !== undefined) {
    config.defaultValue = parsed;
  }

  return config;
}

export function buildDomainFieldConfig(field: DomainFieldRow): YamlFieldConfig {
  const config: YamlFieldConfig = {
    name: field.name,
    type: field.type,
    enabled: field.enabled
  };
  const parsed = parseDefaultValue(field.type, field.defaultValue ?? '');
  if (parsed !== undefined) {
    config.defaultValue = parsed;
  }
  const trimmedPath = field.valuePath?.trim();
  if (trimmedPath) {
    config.valuePath = trimmedPath;
  }
  return config;
}

export function shouldIncludeField(current: YamlFieldConfig, baseline: YamlFieldConfig | undefined): boolean {
  if (!baseline) {
    return true;
  }

  const baselineEnabled = baseline.enabled ?? true;
  const currentEnabled = current.enabled ?? true;
  if (baselineEnabled !== currentEnabled) {
    return true;
  }

  const baselineDefault = baseline.defaultValue ?? undefined;
  const currentDefault = current.defaultValue ?? undefined;
  if (!isValueEqual(baselineDefault, currentDefault)) {
    return true;
  }

  if (baseline.valuePath !== current.valuePath) {
    return true;
  }

  return false;
}

export function getDefaultFieldMap(contentType: YamlContentType): Map<string, YamlFieldConfig> {
  const defaults = DEFAULT_YAML_CONFIG.contentTypes?.[contentType];
  const map = new Map<string, YamlFieldConfig>();
  defaults?.fields.forEach((field) => map.set(field.name, field));
  return map;
}

export function createRowId(seed: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${seed}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function buildInitialRows(initial?: YamlConfigOverrides): FieldRow[] {
  const rowsMap = new Map<string, FieldRow>();
  const result: FieldRow[] = [];

  const ensureRow = (
    name: string,
    type: YamlFieldType,
    builtIn: boolean,
    required: boolean,
    valuePath?: string
  ): FieldRow => {
    const key = name;
    let row = rowsMap.get(key);
    if (!row) {
      row = {
        id: createRowId(name),
        name,
        type,
        defaultValue: '',
        enabled: createToggleMap(false),
        supported: createToggleMap(false),
        builtIn,
        isCustom: !builtIn,
        required,
        originTypes: new Set<YamlContentType>()
      };
      if (valuePath) {
        row.valuePath = valuePath;
      }
      rowsMap.set(key, row);
      result.push(row);
    } else {
      row.builtIn = row.builtIn || builtIn;
      row.isCustom = !row.builtIn;
      row.required = row.required || required;
      if (valuePath && !row.valuePath) {
        row.valuePath = valuePath;
      }
      if (!row.originTypes) {
        row.originTypes = new Set<YamlContentType>();
      }
    }
    return row;
  };

  for (const contentType of CONTENT_TYPES) {
    const defaults = DEFAULT_YAML_CONFIG.contentTypes?.[contentType];
    if (!defaults) {
      continue;
    }
    defaults.fields.forEach((field) => {
      const row = ensureRow(field.name, field.type, true, Boolean(field.required), field.valuePath);
      row.originTypes.add(contentType);
      row.supported[contentType] = true;
      row.enabled[contentType] = field.enabled ?? true;
      if (!row.defaultValue && field.defaultValue !== undefined && field.defaultValue !== null) {
        row.defaultValue = stringifyDefaultValue(field.type, field.defaultValue);
      }
    });
    defaults.customFields?.forEach((field) => {
      const row = ensureRow(field.name, field.type, false, Boolean(field.required), field.valuePath);
      row.originTypes.add(contentType);
      row.supported[contentType] = true;
      row.enabled[contentType] = field.enabled ?? true;
      if (!row.defaultValue && field.defaultValue !== undefined && field.defaultValue !== null) {
        row.defaultValue = stringifyDefaultValue(field.type, field.defaultValue);
      }
    });
  }

  if (initial?.globalFields?.length) {
    initial.globalFields.forEach((field) => {
      const row = ensureRow(field.name, field.type, false, Boolean(field.required), field.valuePath);
      row.isCustom = true;
      row.defaultValue = stringifyDefaultValue(field.type, field.defaultValue);
      for (const contentType of CONTENT_TYPES) {
        row.supported[contentType] = true;
        row.enabled[contentType] = field.enabled ?? true;
      }
    });
  }

  if (initial?.contentTypes) {
    for (const contentType of CONTENT_TYPES) {
      const overrides = initial.contentTypes[contentType];
      if (!overrides) {
        continue;
      }
      overrides.fields?.forEach((field) => {
        const defaultField = DEFAULT_YAML_CONFIG.contentTypes?.[contentType]?.fields.find(
          (item) => item.name === field.name
        );
        const row = ensureRow(
          field.name,
          field.type ?? defaultField?.type ?? 'text',
          Boolean(defaultField),
          Boolean(field.required ?? defaultField?.required),
          field.valuePath ?? defaultField?.valuePath
        );
        row.supported[contentType] = true;
        row.enabled[contentType] = field.enabled ?? defaultField?.enabled ?? true;
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
          row.defaultValue = stringifyDefaultValue(row.type, field.defaultValue);
        } else if (!row.defaultValue && defaultField?.defaultValue !== undefined) {
          row.defaultValue = stringifyDefaultValue(row.type, defaultField.defaultValue);
        }
        if (!row.isCustom && row.originTypes.size && !row.originTypes.has(contentType)) {
          row.supported[contentType] = false;
          row.enabled[contentType] = false;
        }
      });
      overrides.customFields?.forEach((field) => {
        const row = ensureRow(field.name, field.type, false, Boolean(field.required), field.valuePath);
        row.isCustom = true;
        row.supported[contentType] = true;
        row.enabled[contentType] = field.enabled ?? true;
        row.defaultValue = stringifyDefaultValue(field.type, field.defaultValue);
      });
    }
  }

  result.forEach((row) => {
    for (const contentType of CONTENT_TYPES) {
      if (row.isCustom) {
        row.supported[contentType] = true;
      }
    }
  });

  return result
    .sort((a, b) => {
      if (a.builtIn !== b.builtIn) {
        return a.builtIn ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .map((row) => ({
      ...row,
      defaultValue: row.defaultValue ?? ''
    }));
}

export function getAvailableFieldsForContentType(rows: FieldRow[], contentType: YamlContentType): FieldRow[] {
  return rows.filter((row) => row.isCustom || row.supported[contentType] || row.originTypes.has(contentType));
}

export function findFieldDefinition(
  rows: FieldRow[],
  contentType: YamlContentType,
  fieldName: string
): FieldRow | undefined {
  return getAvailableFieldsForContentType(rows, contentType).find((row) => row.name === fieldName);
}

export function buildInitialDomainOverrides(
  initial: YamlConfigOverrides | undefined,
  rows: FieldRow[]
): DomainOverrideEntry[] {
  if (!initial?.contentTypes) {
    return [];
  }
  const entries: DomainOverrideEntry[] = [];
  for (const contentType of CONTENT_TYPES) {
    const overrides = initial.contentTypes[contentType]?.domainOverrides;
    if (!overrides) {
      continue;
    }
    Object.entries(overrides).forEach(([domain, fields]) => {
      const normalizedFields = (fields ?? []).map((field) => {
        const definition = findFieldDefinition(rows, contentType, field.name);
        const type = field.type ?? definition?.type ?? 'text';
        const defaultValue =
          field.defaultValue !== undefined && field.defaultValue !== null
            ? stringifyDefaultValue(type, field.defaultValue)
            : '';
        return {
          id: createRowId(`${domain}-${field.name}`),
          name: field.name,
          type,
          enabled: field.enabled ?? true,
          defaultValue,
          valuePath: field.valuePath ?? definition?.valuePath ?? ''
        } satisfies DomainFieldRow;
      });

      entries.push({
        id: createRowId(`${contentType}-${domain}`),
        domain,
        contentType,
        fields: normalizedFields
      });
    });
  }
  return entries;
}

export function collectDomainOverridesForContentType(
  contentType: YamlContentType,
  domainEntries: DomainOverrideEntry[]
): Record<string, YamlFieldConfig[]> | undefined {
  const relevant = domainEntries.filter((entry) => entry.contentType === contentType);
  if (!relevant.length) {
    return undefined;
  }
  const result: Record<string, YamlFieldConfig[]> = {};
  relevant.forEach((entry) => {
    const domain = entry.domain.trim();
    if (!domain || !entry.fields.length) {
      return;
    }
    result[domain] = entry.fields.map((field) => buildDomainFieldConfig(field));
  });
  return Object.keys(result).length ? result : undefined;
}

export function compareByBaseOrder(a: FieldRow, b: FieldRow, baseOrder: Map<string, number>): number {
  const aOrder = baseOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const bOrder = baseOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  return a.name.localeCompare(b.name);
}

export function getRowsInBaseOrder(rows: FieldRow[], baseOrder: Map<string, number>): FieldRow[] {
  return [...rows].sort((a, b) => compareByBaseOrder(a, b, baseOrder));
}

export function sortRowsByMode(
  rows: FieldRow[],
  mode: YamlContentType | null,
  baseOrder: Map<string, number>
): FieldRow[] {
  if (!mode) {
    return getRowsInBaseOrder(rows, baseOrder);
  }
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const priority = (row: FieldRow) => (row.enabled[mode] ? 0 : 1) + (row.isCustom ? -0.5 : 0);
    const diff = priority(a) - priority(b);
    if (diff !== 0) {
      return diff;
    }
    return compareByBaseOrder(a, b, baseOrder);
  });
  return sorted;
}

export function getFilteredRows(rows: FieldRow[], mode: YamlContentType | null): FieldRow[] {
  if (!mode) {
    return [...rows];
  }
  return rows.filter((row) => {
    if (row.isCustom) {
      return row.enabled[mode];
    }
    return row.supported[mode] || row.enabled[mode];
  });
}

export function getCustomRowsByOrder(rows: FieldRow[], baseOrder: Map<string, number>): FieldRow[] {
  return getRowsInBaseOrder(rows, baseOrder).filter((row) => !row.builtIn);
}

export function nextBaseOrderValue(baseOrder: Map<string, number>): number {
  let max = -1;
  baseOrder.forEach((value) => {
    if (value > max) {
      max = value;
    }
  });
  return max + 1;
}

export function ensureDomainEntryFields(
  entry: DomainOverrideEntry,
  rows: FieldRow[],
  isFieldAvailableForContentType: (fieldName: string, contentType: YamlContentType) => boolean
): void {
  entry.fields = entry.fields.filter((field) => isFieldAvailableForContentType(field.name, entry.contentType));
  entry.fields.forEach((field) => {
    const definition = findFieldDefinition(rows, entry.contentType, field.name);
    if (definition) {
      field.type = definition.type;
    }
  });
}

export function getFieldOptionsForEntry(
  rows: FieldRow[],
  entry: DomainOverrideEntry,
  currentField?: DomainFieldRow
): FieldRow[] {
  const available = getAvailableFieldsForContentType(rows, entry.contentType);
  const used = new Set(
    entry.fields
      .filter((field) => field !== currentField)
      .map((field) => field.name)
  );
  return available.filter((row) => !used.has(row.name) || currentField?.name === row.name);
}

export function collectYamlConfigOverrides(params: {
  rows: FieldRow[];
  domainEntries: DomainOverrideEntry[];
  baseOrder: Map<string, number>;
}): YamlConfigOverrides | null {
  const { rows, domainEntries, baseOrder } = params;
  if (!rows.length) {
    return null;
  }

  const overrides: YamlConfigOverrides = { contentTypes: {} };
  let hasContent = false;
  const orderedRows = getRowsInBaseOrder(rows, baseOrder);

  for (const contentType of CONTENT_TYPES) {
    const defaultsMap = getDefaultFieldMap(contentType);
    const fieldOverrides: YamlFieldConfig[] = [];
    const customFields: YamlFieldConfig[] = [];

    for (const row of orderedRows) {
      const trimmedName = row.name.trim();
      if (!trimmedName) {
        continue;
      }

      const isEnabled = row.enabled[contentType] ?? false;
      const defaultField = defaultsMap.get(trimmedName);
      const treatAsCustom = row.isCustom || (!row.builtIn && !defaultField);
      const isSupported = row.isCustom || row.originTypes.has(contentType);

      if (!isSupported) {
        continue;
      }
      if (!isEnabled && !defaultField && !treatAsCustom) {
        continue;
      }
      if (!isEnabled && treatAsCustom) {
        continue;
      }

      const config = buildFieldConfig(row, isEnabled, defaultField);
      if (treatAsCustom) {
        if (isEnabled) {
          config.isCustom = true;
          customFields.push(config);
          hasContent = true;
        }
        continue;
      }

      if (!defaultField) {
        if (isEnabled) {
          fieldOverrides.push(config);
          hasContent = true;
        }
        continue;
      }

      if (shouldIncludeField(config, defaultField)) {
        fieldOverrides.push(config);
        hasContent = true;
      }
    }

    const domainOverrideMap = collectDomainOverridesForContentType(contentType, domainEntries);
    if (fieldOverrides.length || customFields.length || domainOverrideMap) {
      const payload: Partial<PartialContentTypeYamlConfig> = {};
      if (fieldOverrides.length) {
        payload.fields = fieldOverrides;
      }
      if (customFields.length) {
        payload.customFields = customFields;
      }
      if (domainOverrideMap) {
        payload.domainOverrides = domainOverrideMap;
        hasContent = true;
      }
      (overrides.contentTypes ??= {})[contentType] = payload;
    }
  }

  return hasContent ? overrides : null;
}

function isValueEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  }
  return a === b;
}
