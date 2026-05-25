import { DEFAULT_YAML_CONFIG } from '../config/yamlDefaults';
import { isObjectRecord } from '../guards';
import { normalizeDomainKey } from './yamlConfigDomain';
import type {
  PartialContentTypeYamlConfig,
  YamlConfigOverrides,
  YamlContentType,
  YamlFieldConfig,
  YamlFieldType
} from '../types/yamlConfig';

const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export const isYamlContentType = (value: string): value is YamlContentType =>
  value === 'ai_chat' || value === 'article' || value === 'clipper' || value === 'video';

export const toFieldType = (value: unknown): YamlFieldType => {
  if (value === 'number' || value === 'boolean' || value === 'date' || value === 'array') {
    return value;
  }
  return 'text';
};

export const toBoolean = (value: unknown, fallback?: boolean): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return fallback;
};

export const sanitizeDefaultValue = (type: YamlFieldType, value: unknown): unknown => {
  if (value === undefined || value === null) {
    return undefined;
  }
  switch (type) {
    case 'number': {
      const numeric = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numeric) ? numeric : undefined;
    }
    case 'boolean': {
      return toBoolean(value);
    }
    case 'array': {
      if (Array.isArray(value)) {
        return value;
      }
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
      return value !== undefined && value !== null ? [value] : undefined;
    }
    default:
      return value;
  }
};

export const sanitizeFieldName = (name: unknown): string | null => {
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  if (!trimmed || !FIELD_NAME_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
};

export const sanitizeField = (
  field: unknown,
  fallbackType: YamlFieldType = 'text'
): YamlFieldConfig | null => {
  if (!isObjectRecord(field)) {
    return null;
  }
  const name = sanitizeFieldName(field.name);
  if (!name) {
    return null;
  }

  const type = toFieldType(field.type ?? fallbackType);
  const normalized: YamlFieldConfig = {
    name,
    type,
    enabled: toBoolean(field.enabled, true) ?? true
  };

  if (field.required !== undefined) {
    normalized.required = toBoolean(field.required, false) ?? false;
  }

  if (field.description !== undefined) {
    normalized.description = String(field.description);
  }

  if (field.isCustom) {
    normalized.isCustom = true;
  }

  if (field.valuePath && typeof field.valuePath === 'string') {
    const trimmedPath = field.valuePath.trim();
    if (trimmedPath) {
      normalized.valuePath = trimmedPath;
    }
  }

  const defaultValue = sanitizeDefaultValue(type, field.defaultValue);
  if (defaultValue !== undefined) {
    normalized.defaultValue = defaultValue;
  }

  return normalized;
};

export const sanitizeFieldList = (
  fields: unknown,
  options: { markCustom?: boolean; fallbackType?: YamlFieldType } = {}
): YamlFieldConfig[] => {
  if (!Array.isArray(fields)) {
    return [];
  }
  const { markCustom = false, fallbackType = 'text' } = options;
  const unique = new Map<string, YamlFieldConfig>();
  fields.forEach((entry) => {
    const sanitized = sanitizeField(entry, fallbackType);
    if (!sanitized) {
      return;
    }
    if (markCustom) {
      sanitized.isCustom = true;
    }
    if (!unique.has(sanitized.name)) {
      unique.set(sanitized.name, sanitized);
    }
  });
  return Array.from(unique.values());
};

export const sanitizeDomainOverrideMap = (
  raw: unknown
): Record<string, YamlFieldConfig[]> | undefined => {
  if (!isObjectRecord(raw)) {
    return undefined;
  }
  const entries: Array<[string, YamlFieldConfig[]]> = [];
  Object.entries(raw).forEach(([key, value]) => {
    const normalizedKey = normalizeDomainKey(key);
    if (!normalizedKey) {
      return;
    }
    const sanitizedFields = sanitizeFieldList(value);
    if (!sanitizedFields.length) {
      return;
    }
    entries.push([normalizedKey, sanitizedFields]);
  });

  return entries.length ? Object.fromEntries(entries) : undefined;
};

export const sanitizeContentTypeOverrides = (
  contentType: YamlContentType,
  raw: unknown
): PartialContentTypeYamlConfig | undefined => {
  if (!isObjectRecord(raw)) {
    return undefined;
  }

  const fields = sanitizeFieldList(raw.fields);
  const customFields = sanitizeFieldList(raw.customFields, {
    markCustom: true
  });
  const domainOverrides = sanitizeDomainOverrideMap(raw.domainOverrides);

  const result: PartialContentTypeYamlConfig = {};
  if (fields.length) {
    const allowedDefaults = new Set(
      DEFAULT_YAML_CONFIG.contentTypes?.[contentType]?.fields?.map((field) => field.name) ?? []
    );
    const filteredFields = fields.filter((field) => allowedDefaults.has(field.name));
    if (filteredFields.length) {
      result.fields = filteredFields;
    }
  }
  if (customFields.length) {
    result.customFields = customFields;
  }
  if (domainOverrides) {
    result.domainOverrides = domainOverrides;
  }

  return Object.keys(result).length ? result : undefined;
};

export const normalizeYamlConfigOverrides = (input: unknown): YamlConfigOverrides | null => {
  if (!Array.isArray(input) && !isObjectRecord(input)) {
    return null;
  }

  let rawContentTypes: unknown;
  let rawGlobalFields: unknown;

  if (Array.isArray(input)) {
    rawContentTypes = input;
    rawGlobalFields = undefined;
  } else {
    rawContentTypes = input.contentTypes;
    rawGlobalFields = input.globalFields;
  }

  const contentTypeMap: Partial<Record<YamlContentType, PartialContentTypeYamlConfig>> = {};

  if (Array.isArray(rawContentTypes)) {
    rawContentTypes.forEach((entry) => {
      if (!isObjectRecord(entry)) {
        return;
      }
      const contentType = entry.contentType;
      if (typeof contentType !== 'string' || !isYamlContentType(contentType)) {
        return;
      }
      const sanitized = sanitizeContentTypeOverrides(contentType, entry);
      if (
        sanitized &&
        (sanitized.fields?.length || sanitized.customFields?.length || sanitized.domainOverrides)
      ) {
        contentTypeMap[contentType] = sanitized;
      }
    });
  } else if (isObjectRecord(rawContentTypes)) {
    Object.entries(rawContentTypes).forEach(([key, value]) => {
      if (!isYamlContentType(key)) {
        return;
      }
      const sanitized = sanitizeContentTypeOverrides(key, value);
      if (
        sanitized &&
        (sanitized.fields?.length || sanitized.customFields?.length || sanitized.domainOverrides)
      ) {
        contentTypeMap[key] = sanitized;
      }
    });
  }

  const globalFields = sanitizeFieldList(rawGlobalFields, { markCustom: true });

  const hasContentTypes = Object.keys(contentTypeMap).length > 0;
  const hasGlobalFields = globalFields.length > 0;

  if (!hasContentTypes && !hasGlobalFields) {
    return null;
  }

  const normalized: YamlConfigOverrides = {};
  if (hasContentTypes) {
    normalized.contentTypes = contentTypeMap;
  }
  if (hasGlobalFields) {
    normalized.globalFields = globalFields;
  }
  return normalized;
};
