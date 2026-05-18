import { DEFAULT_YAML_CONFIG } from '@shared/config';
import type { YamlConfigOverrides, YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
import {
  CONTENT_TYPES,
  type DomainFieldRow,
  type DomainOverrideEntry,
  type FieldRow
} from './yamlConfigTableTypes';
import { createToggleMap, stringifyDefaultValue } from './yamlConfigTableValueCodecs';

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
      row.originTypes ??= new Set<YamlContentType>();
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
      const row = ensureRow(
        field.name,
        field.type,
        false,
        Boolean(field.required),
        field.valuePath
      );
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
      const row = ensureRow(
        field.name,
        field.type,
        false,
        Boolean(field.required),
        field.valuePath
      );
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
        const row = ensureRow(
          field.name,
          field.type,
          false,
          Boolean(field.required),
          field.valuePath
        );
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

export function getAvailableFieldsForContentType(
  rows: FieldRow[],
  contentType: YamlContentType
): FieldRow[] {
  return rows.filter(
    (row) => row.isCustom || row.supported[contentType] || row.originTypes.has(contentType)
  );
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
