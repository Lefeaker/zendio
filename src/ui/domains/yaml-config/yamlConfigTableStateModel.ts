import type {
  PartialContentTypeYamlConfig,
  YamlConfigOverrides,
  YamlContentType,
  YamlFieldConfig
} from '@shared/types/yamlConfig';
import {
  CONTENT_TYPES,
  type DomainFieldRow,
  type DomainOverrideEntry,
  type FieldRow
} from './yamlConfigTableTypes';
import {
  buildDomainFieldConfig,
  buildFieldConfig,
  getDefaultFieldMap,
  shouldIncludeField,
  stringifyDefaultValue
} from './yamlConfigTableValueCodecs';
import {
  buildInitialDomainOverrides,
  buildInitialRows,
  createRowId,
  findFieldDefinition,
  getAvailableFieldsForContentType
} from './yamlConfigTableInitialState';
import {
  compareByBaseOrder,
  getCustomRowsByOrder,
  getFilteredRows,
  getRowsInBaseOrder,
  nextBaseOrderValue,
  sortRowsByMode
} from './yamlConfigTableOrdering';

export * from './yamlConfigTableTypes';
export * from './yamlConfigTableValueCodecs';

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

export {
  buildInitialDomainOverrides,
  buildInitialRows,
  compareByBaseOrder,
  createRowId,
  findFieldDefinition,
  getAvailableFieldsForContentType,
  getCustomRowsByOrder,
  getFilteredRows,
  getRowsInBaseOrder,
  nextBaseOrderValue,
  sortRowsByMode
};

export function ensureDomainEntryFields(
  entry: DomainOverrideEntry,
  rows: FieldRow[],
  isFieldAvailableForContentType: (fieldName: string, contentType: YamlContentType) => boolean
): void {
  entry.fields = entry.fields.filter((field) =>
    isFieldAvailableForContentType(field.name, entry.contentType)
  );
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
    entry.fields.filter((field) => field !== currentField).map((field) => field.name)
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
