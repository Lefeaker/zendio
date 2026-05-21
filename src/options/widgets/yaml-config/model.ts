import type { CompleteOptions } from '@shared/types/options';
import { DEFAULT_YAML_CONFIG } from '@shared/config';
import type { YamlContentType, YamlFieldConfig, YamlFieldType } from '@shared/types/yamlConfig';
import {
  parseDefaultValue,
  stringifyDefaultValue
} from '@ui/domains/yaml-config/yamlConfigTableValueCodecs';

export type ToggleMap = Record<YamlContentType, boolean>;
export type YamlFilter = YamlContentType | 'all';

export interface YamlFieldRow {
  id: string;
  name: string;
  type: YamlFieldType;
  enabled: ToggleMap;
  supported: ToggleMap;
  defaultValues: Partial<Record<YamlContentType, string>>;
  valuePaths: Partial<Record<YamlContentType, string>>;
  defaultValue: string;
  valuePath: string;
  required: boolean;
  builtIn: boolean;
  isGlobal: boolean;
  originTypes: Set<YamlContentType>;
}

export interface YamlDomainEntry {
  id: string;
  domain: string;
  contentType: YamlContentType;
  fields: YamlDomainField[];
}

export interface YamlDomainField {
  id: string;
  name: string;
  type: YamlFieldType;
  enabled: boolean;
  defaultValue: string;
  valuePath: string;
}

export const CONTENT_TYPES: YamlContentType[] = ['article', 'clipper', 'video', 'ai_chat'];
export const TYPE_OPTIONS: YamlFieldType[] = ['text', 'number', 'boolean', 'date', 'array'];

let nextId = 0;

export function createId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

export function createToggleMap(value: boolean): ToggleMap {
  return {
    article: value,
    clipper: value,
    video: value,
    ai_chat: value
  };
}

function getDefaultField(contentType: YamlContentType, name: string): YamlFieldConfig | undefined {
  return DEFAULT_YAML_CONFIG.contentTypes?.[contentType]?.fields.find(
    (field) => field.name === name
  );
}

export function getRowDefaultValue(row: YamlFieldRow, contentType: YamlContentType): string {
  return row.defaultValues[contentType] ?? row.defaultValue;
}

export function getRowValuePath(row: YamlFieldRow, contentType: YamlContentType): string {
  return row.valuePaths[contentType] ?? row.valuePath;
}

export function getVisibleDefaultValue(row: YamlFieldRow, filter: YamlFilter): string {
  return filter === 'all' ? row.defaultValue : getRowDefaultValue(row, filter);
}

export function getVisibleValuePath(row: YamlFieldRow, filter: YamlFilter): string {
  return filter === 'all' ? row.valuePath : getRowValuePath(row, filter);
}

export function updateDefaultValue(row: YamlFieldRow, filter: YamlFilter, value: string): void {
  if (filter === 'all') {
    row.defaultValue = value;
    CONTENT_TYPES.forEach((contentType) => {
      if (row.supported[contentType] || row.enabled[contentType] || !row.builtIn) {
        row.defaultValues[contentType] = value;
      }
    });
    return;
  }
  row.defaultValues[filter] = value;
  row.defaultValue = value;
}

export function updateValuePath(row: YamlFieldRow, filter: YamlFilter, value: string): void {
  if (filter === 'all') {
    row.valuePath = value;
    CONTENT_TYPES.forEach((contentType) => {
      if (row.supported[contentType] || row.enabled[contentType] || !row.builtIn) {
        row.valuePaths[contentType] = value;
      }
    });
    return;
  }
  row.valuePaths[filter] = value;
  row.valuePath = value;
}

export function buildRows(initial: CompleteOptions): YamlFieldRow[] {
  const rows = new Map<string, YamlFieldRow>();
  const ensureRow = (
    field: YamlFieldConfig,
    contentType: YamlContentType | null,
    options: { builtIn: boolean; global?: boolean } = { builtIn: false }
  ): YamlFieldRow => {
    const key = field.name;
    let row = rows.get(key);
    if (!row) {
      row = {
        id: createId(`yaml-${key}`),
        name: field.name,
        type: field.type,
        enabled: createToggleMap(false),
        supported: createToggleMap(false),
        defaultValues: {},
        valuePaths: {},
        defaultValue: stringifyDefaultValue(field.type, field.defaultValue),
        valuePath: field.valuePath ?? '',
        required: Boolean(field.required),
        builtIn: options.builtIn,
        isGlobal: Boolean(options.global),
        originTypes: new Set<YamlContentType>()
      };
      rows.set(key, row);
    }
    row.builtIn = row.builtIn || options.builtIn;
    row.isGlobal = row.isGlobal || Boolean(options.global);
    row.required = row.required || Boolean(field.required);
    row.type = field.type ?? row.type;
    if (contentType) {
      row.originTypes.add(contentType);
      row.supported[contentType] = true;
      row.enabled[contentType] = field.enabled ?? true;
      row.defaultValues[contentType] = stringifyDefaultValue(row.type, field.defaultValue);
      row.valuePaths[contentType] = field.valuePath ?? '';
      row.defaultValue ||= row.defaultValues[contentType] ?? '';
      row.valuePath ||= field.valuePath ?? '';
    } else if (field.defaultValue !== undefined || field.valuePath) {
      row.defaultValue = stringifyDefaultValue(row.type, field.defaultValue);
      row.valuePath = field.valuePath ?? row.valuePath;
    }
    if (options.global) {
      CONTENT_TYPES.forEach((type) => {
        row.supported[type] = true;
        row.enabled[type] = field.enabled ?? true;
        row.defaultValues[type] = row.defaultValue;
        row.valuePaths[type] = row.valuePath;
      });
    }
    return row;
  };

  CONTENT_TYPES.forEach((contentType) => {
    const defaults = DEFAULT_YAML_CONFIG.contentTypes?.[contentType];
    defaults?.fields.forEach((field) => ensureRow(field, contentType, { builtIn: true }));
    defaults?.customFields?.forEach((field) => ensureRow(field, contentType));
  });
  initial.yamlConfig?.globalFields?.forEach((field) =>
    ensureRow(field, null, { builtIn: false, global: true })
  );
  CONTENT_TYPES.forEach((contentType) => {
    const overrides = initial.yamlConfig?.contentTypes?.[contentType];
    overrides?.fields?.forEach((field) => {
      const baseline = getDefaultField(contentType, field.name);
      ensureRow(
        {
          ...baseline,
          ...field,
          type: field.type ?? baseline?.type ?? 'text',
          enabled: field.enabled ?? baseline?.enabled ?? true
        },
        contentType,
        { builtIn: Boolean(baseline) }
      );
    });
    overrides?.customFields?.forEach((field) => ensureRow(field, contentType));
  });
  return Array.from(rows.values()).sort((a, b) =>
    a.builtIn !== b.builtIn ? (a.builtIn ? -1 : 1) : a.name.localeCompare(b.name)
  );
}

export function buildDomainEntries(
  initial: CompleteOptions,
  rows: YamlFieldRow[]
): YamlDomainEntry[] {
  const entries: YamlDomainEntry[] = [];
  CONTENT_TYPES.forEach((contentType) => {
    const overrides = initial.yamlConfig?.contentTypes?.[contentType]?.domainOverrides;
    Object.entries(overrides ?? {}).forEach(([domain, fields]) => {
      entries.push({
        id: createId(`domain-${contentType}`),
        domain,
        contentType,
        fields: (fields ?? []).map((field) => {
          const definition = rows.find((row) => row.name === field.name);
          const type = field.type ?? definition?.type ?? 'text';
          return {
            id: createId(`domain-field-${field.name}`),
            name: field.name,
            type,
            enabled: field.enabled ?? true,
            defaultValue: stringifyDefaultValue(type, field.defaultValue),
            valuePath: field.valuePath ?? definition?.valuePath ?? ''
          };
        })
      });
    });
  });
  return entries;
}

function createFieldConfig(
  row: YamlFieldRow,
  enabled: boolean,
  contentType?: YamlContentType
): YamlFieldConfig {
  const defaultValueSource = contentType ? getRowDefaultValue(row, contentType) : row.defaultValue;
  const valuePathSource = contentType ? getRowValuePath(row, contentType) : row.valuePath;
  const config: YamlFieldConfig = { name: row.name.trim(), type: row.type, enabled };
  if (row.required) {
    config.required = true;
  }
  const defaultValue = parseDefaultValue(row.type, defaultValueSource);
  if (defaultValue !== undefined) {
    config.defaultValue = defaultValue;
  }
  if (valuePathSource.trim()) {
    config.valuePath = valuePathSource.trim();
  }
  if (!row.builtIn || row.isGlobal) {
    config.isCustom = true;
  }
  return config;
}

function createDomainFieldConfig(field: YamlDomainField): YamlFieldConfig {
  const config: YamlFieldConfig = { name: field.name, type: field.type, enabled: field.enabled };
  const defaultValue = parseDefaultValue(field.type, field.defaultValue);
  if (defaultValue !== undefined) {
    config.defaultValue = defaultValue;
  }
  if (field.valuePath.trim()) {
    config.valuePath = field.valuePath.trim();
  }
  return config;
}

function shouldIncludeField(row: YamlFieldRow, contentType: YamlContentType): boolean {
  const baseline = getDefaultField(contentType, row.name.trim());
  const defaultValueSource = getRowDefaultValue(row, contentType);
  const valuePathSource = getRowValuePath(row, contentType);
  if (!baseline) {
    return row.enabled[contentType];
  }
  if ((baseline.enabled ?? true) !== row.enabled[contentType]) {
    return true;
  }
  if (baseline.valuePath !== (valuePathSource.trim() || undefined)) {
    return true;
  }
  const parsed = parseDefaultValue(row.type, defaultValueSource);
  return JSON.stringify(baseline.defaultValue ?? undefined) !== JSON.stringify(parsed);
}

export function collectYamlConfig(
  rows: YamlFieldRow[],
  domainEntries: YamlDomainEntry[]
): CompleteOptions['yamlConfig'] {
  const yamlConfig: NonNullable<CompleteOptions['yamlConfig']> = { contentTypes: {} };
  const globalFields = rows
    .filter((row) => row.isGlobal && row.name.trim())
    .map((row) =>
      createFieldConfig(
        row,
        CONTENT_TYPES.some((type) => row.enabled[type])
      )
    );
  if (globalFields.length) {
    yamlConfig.globalFields = globalFields;
  }

  CONTENT_TYPES.forEach((contentType) => {
    const fields = rows
      .filter(
        (row) =>
          row.builtIn &&
          !row.isGlobal &&
          row.supported[contentType] &&
          shouldIncludeField(row, contentType)
      )
      .map((row) => createFieldConfig(row, row.enabled[contentType], contentType));
    const customFields = rows
      .filter((row) => !row.builtIn && !row.isGlobal && row.enabled[contentType] && row.name.trim())
      .map((row) => createFieldConfig(row, true, contentType));
    const domainOverrides: Record<string, YamlFieldConfig[]> = {};
    domainEntries
      .filter(
        (entry) => entry.contentType === contentType && entry.domain.trim() && entry.fields.length
      )
      .forEach((entry) => {
        domainOverrides[entry.domain.trim()] = entry.fields.map(createDomainFieldConfig);
      });
    if (fields.length || customFields.length || Object.keys(domainOverrides).length) {
      yamlConfig.contentTypes ??= {};
      yamlConfig.contentTypes[contentType] = {
        ...(fields.length ? { fields } : {}),
        ...(customFields.length ? { customFields } : {}),
        ...(Object.keys(domainOverrides).length ? { domainOverrides } : {})
      };
    }
  });

  return yamlConfig.globalFields?.length || Object.keys(yamlConfig.contentTypes ?? {}).length
    ? yamlConfig
    : null;
}

export function createCustomRow(): YamlFieldRow {
  return {
    id: createId('yaml-custom'),
    name: 'custom_field',
    type: 'text',
    enabled: createToggleMap(false),
    supported: createToggleMap(true),
    defaultValues: {},
    valuePaths: {},
    defaultValue: '',
    valuePath: '',
    required: false,
    builtIn: false,
    isGlobal: false,
    originTypes: new Set()
  };
}

export function getFieldsForContentType(
  rows: YamlFieldRow[],
  contentType: YamlContentType
): YamlFieldRow[] {
  return rows.filter(
    (row) => row.supported[contentType] || row.enabled[contentType] || !row.builtIn
  );
}

export function createDomainField(
  rows: YamlFieldRow[],
  contentType: YamlContentType
): YamlDomainField {
  const row = getFieldsForContentType(rows, contentType)[0];
  return {
    id: createId('domain-field'),
    name: row?.name ?? 'title',
    type: row?.type ?? 'text',
    enabled: true,
    defaultValue: '',
    valuePath: row?.valuePath ?? ''
  };
}

export function getDomainFieldOptions(
  rows: YamlFieldRow[],
  entry: YamlDomainEntry,
  field: YamlDomainField
): YamlFieldRow[] {
  const options = getFieldsForContentType(rows, entry.contentType);
  if (options.some((row) => row.name === field.name)) {
    return options;
  }
  const definition = rows.find((row) => row.name === field.name);
  if (definition) {
    return [definition, ...options];
  }
  return [
    {
      id: createId(`domain-unsupported-${field.name}`),
      name: field.name,
      type: field.type,
      enabled: createToggleMap(false),
      supported: createToggleMap(false),
      defaultValues: {},
      valuePaths: {},
      defaultValue: field.defaultValue,
      valuePath: field.valuePath,
      required: false,
      builtIn: false,
      isGlobal: false,
      originTypes: new Set()
    },
    ...options
  ];
}
