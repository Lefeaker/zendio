import type { YamlContentType } from '@shared/types/yamlConfig';
import type { DomainOverrideEntry, FieldRow } from './yamlConfigTableTypes';
import { CONTENT_TYPES } from './yamlConfigTableTypes';
import { formatArrayValue, parseDefaultValueWithValidation } from './yamlConfigTableModel';

export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export const VALUE_PATH_PATTERN = /^\S+$/;

interface TableLabels {
  errors: {
    nameRequired: string;
    namePattern: string;
    nameDuplicate: string;
    typeRequired: string;
    modeRequired: string;
    valueInvalid: string;
    valuePathInvalid: string;
  };
  warnings: {
    unresolvedErrors: string;
  };
}

interface DomainLabels {
  errors: {
    domainRequired: string;
    domainDuplicate: string;
    fieldRequired: string;
    fieldDuplicate: string;
    fieldUnsupported: string;
    valueInvalid: string;
    valuePathInvalid: string;
  };
  warnings: {
    unresolvedErrors: string;
  };
}

export interface YamlValidationResult {
  rowErrors: Map<string, string[]>;
  domainErrors: Map<string, string[]>;
  globalErrors: string[];
}

export { formatArrayValue };

export function validateYamlConfig(params: {
  rows: FieldRow[];
  domainEntries: DomainOverrideEntry[];
  tableLabels: TableLabels;
  domainLabels: DomainLabels;
  isFieldAvailableForContentType: (fieldName: string, contentType: YamlContentType) => boolean;
}): YamlValidationResult {
  const { rows, domainEntries, tableLabels, domainLabels, isFieldAvailableForContentType } = params;
  const rowErrors = new Map<string, string[]>();
  const domainErrors = new Map<string, string[]>();
  const globalErrors: string[] = [];
  const nameMap = new Map<string, FieldRow[]>();

  rows.forEach((row) => {
    const trimmed = row.name.trim();
    if (!trimmed) {
      registerRowError(rowErrors, row.id, tableLabels.errors.nameRequired);
    } else if (!NAME_PATTERN.test(trimmed)) {
      registerRowError(rowErrors, row.id, tableLabels.errors.namePattern);
    } else {
      if (!nameMap.has(trimmed)) {
        nameMap.set(trimmed, []);
      }
      nameMap.get(trimmed)?.push(row);
    }

    if (!row.builtIn && !row.type) {
      registerRowError(rowErrors, row.id, tableLabels.errors.typeRequired);
    }

    if (!row.builtIn) {
      const hasEnabled = CONTENT_TYPES.some((type) => row.enabled[type]);
      if (!hasEnabled) {
        registerRowError(rowErrors, row.id, tableLabels.errors.modeRequired);
      }
    }

    if (!row.builtIn && row.defaultValue?.trim()) {
      const result = parseDefaultValueWithValidation(row.type, row.defaultValue);
      if (result.error) {
        registerRowError(rowErrors, row.id, tableLabels.errors.valueInvalid);
      }
    }

    const trimmedPath = row.valuePath?.trim() ?? '';
    if (trimmedPath && !VALUE_PATH_PATTERN.test(trimmedPath)) {
      registerRowError(rowErrors, row.id, tableLabels.errors.valuePathInvalid);
    }
  });

  nameMap.forEach((entries, name) => {
    if (!name || entries.length <= 1) {
      return;
    }
    entries.forEach((entry) => registerRowError(rowErrors, entry.id, tableLabels.errors.nameDuplicate));
  });

  if (rowErrors.size) {
    globalErrors.push(tableLabels.warnings.unresolvedErrors);
  }

  validateDomainOverrides({
    domainEntries,
    domainLabels,
    domainErrors,
    globalErrors,
    isFieldAvailableForContentType
  });

  return { rowErrors, domainErrors, globalErrors };
}

export const validateYamlConfigState = validateYamlConfig;

function validateDomainOverrides(params: {
  domainEntries: DomainOverrideEntry[];
  domainLabels: DomainLabels;
  domainErrors: Map<string, string[]>;
  globalErrors: string[];
  isFieldAvailableForContentType: (fieldName: string, contentType: YamlContentType) => boolean;
}): void {
  const { domainEntries, domainLabels, domainErrors, globalErrors, isFieldAvailableForContentType } = params;
  if (!domainEntries.length) {
    return;
  }
  const seen = new Map<YamlContentType, Set<string>>();
  domainEntries.forEach((entry) => {
    if (!seen.has(entry.contentType)) {
      seen.set(entry.contentType, new Set());
    }
  });

  domainEntries.forEach((entry) => {
    const errors: string[] = [];
    const trimmedDomain = entry.domain.trim();
    if (!trimmedDomain) {
      errors.push(domainLabels.errors.domainRequired);
    } else {
      const key = trimmedDomain.toLowerCase();
      let bucket = seen.get(entry.contentType);
      if (!bucket) {
        bucket = new Set<string>();
        seen.set(entry.contentType, bucket);
      }
      if (bucket.has(key)) {
        errors.push(domainLabels.errors.domainDuplicate);
      } else {
        bucket.add(key);
      }
    }

    if (!entry.fields.length) {
      errors.push(domainLabels.errors.fieldRequired);
    }

    const fieldNames = new Set<string>();
    entry.fields.forEach((field) => {
      const name = field.name.trim();
      if (!name) {
        errors.push(domainLabels.errors.fieldRequired);
        return;
      }
      if (fieldNames.has(name)) {
        errors.push(domainLabels.errors.fieldDuplicate);
      } else {
        fieldNames.add(name);
      }

      if (!isFieldAvailableForContentType(name, entry.contentType)) {
        errors.push(`${domainLabels.errors.fieldUnsupported} ${name}`);
      }

      if (field.defaultValue && parseDefaultValueWithValidation(field.type, field.defaultValue).error) {
        errors.push(`${domainLabels.errors.valueInvalid} ${name}`);
      }

      if (field.valuePath && field.valuePath.includes(' ')) {
        errors.push(domainLabels.errors.valuePathInvalid);
      }
    });

    if (errors.length) {
      domainErrors.set(entry.id, Array.from(new Set(errors)));
    }
  });

  if (domainErrors.size && !globalErrors.includes(domainLabels.warnings.unresolvedErrors)) {
    globalErrors.push(domainLabels.warnings.unresolvedErrors);
  }
}

function registerRowError(rowErrors: Map<string, string[]>, rowId: string, message: string): void {
  if (!message) {
    return;
  }
  const existing = rowErrors.get(rowId) ?? [];
  if (!existing.includes(message)) {
    existing.push(message);
    rowErrors.set(rowId, existing);
  }
}
