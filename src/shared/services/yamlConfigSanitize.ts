import { DEFAULT_YAML_CONFIG } from '../config/yamlDefaults';
import { normalizeDomainKey } from './yamlConfigDomain';
import type {
  PartialContentTypeYamlConfig,
  YamlConfigOverrides,
  YamlContentType,
  YamlFieldConfig,
  YamlFieldType
} from '../types/yamlConfig';

const FIELD_TYPES: ReadonlySet<YamlFieldType> = new Set([
  'text',
  'number',
  'boolean',
  'date',
  'array'
]);
const CONTENT_TYPE_KEYS: ReadonlySet<YamlContentType> = new Set([
  'ai_chat',
  'article',
  'clipper',
  'video'
]);
const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export const isYamlContentType = (value: string): value is YamlContentType =>
  CONTENT_TYPE_KEYS.has(value as YamlContentType);

export const toFieldType = (value: unknown): YamlFieldType =>
  typeof value === 'string' && FIELD_TYPES.has(value as YamlFieldType)
    ? (value as YamlFieldType)
    : 'text';

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
  if (!field || typeof field !== 'object') {
    return null;
  }
  const draft = field as Partial<YamlFieldConfig> & Record<string, unknown>;
  const name = sanitizeFieldName(draft.name);
  if (!name) {
    return null;
  }

  const type = toFieldType(draft.type ?? fallbackType);
  const normalized: YamlFieldConfig = {
    name,
    type,
    enabled: toBoolean(draft.enabled, true) ?? true
  };

  if (draft.required !== undefined) {
    normalized.required = toBoolean(draft.required, false) ?? false;
  }

  if (draft.description !== undefined) {
    normalized.description = String(draft.description);
  }

  if (draft.isCustom) {
    normalized.isCustom = true;
  }

  if (draft.valuePath && typeof draft.valuePath === 'string') {
    const trimmedPath = draft.valuePath.trim();
    if (trimmedPath) {
      normalized.valuePath = trimmedPath;
    }
  }

  const defaultValue = sanitizeDefaultValue(type, draft.defaultValue);
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
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => {
      const normalizedKey = normalizeDomainKey(key);
      if (!normalizedKey) {
        return null;
      }
      const sanitizedFields = sanitizeFieldList(value);
      if (!sanitizedFields.length) {
        return null;
      }
      return [normalizedKey, sanitizedFields] as const;
    })
    .filter((entry): entry is readonly [string, YamlFieldConfig[]] => Boolean(entry));

  return entries.length ? Object.fromEntries(entries) : undefined;
};

export const sanitizeContentTypeOverrides = (
  contentType: YamlContentType,
  raw: unknown
): PartialContentTypeYamlConfig | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const fields = sanitizeFieldList((raw as PartialContentTypeYamlConfig).fields);
  const customFields = sanitizeFieldList((raw as PartialContentTypeYamlConfig).customFields, {
    markCustom: true
  });
  const domainOverrides = sanitizeDomainOverrideMap(
    (raw as PartialContentTypeYamlConfig).domainOverrides
  );

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
  if (!input || typeof input !== 'object') {
    return null;
  }

  let rawContentTypes: unknown = (input as Record<string, unknown>).contentTypes;
  let rawGlobalFields: unknown = (input as Record<string, unknown>).globalFields;

  if (Array.isArray(input)) {
    rawContentTypes = input;
    rawGlobalFields = undefined;
  }

  if (!rawContentTypes && Array.isArray((input as Record<string, unknown>).contentTypes)) {
    rawContentTypes = (input as Record<string, unknown>).contentTypes;
  }

  const contentTypeMap: Partial<Record<YamlContentType, PartialContentTypeYamlConfig>> = {};

  if (Array.isArray(rawContentTypes)) {
    (rawContentTypes as unknown[]).forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const contentType = (entry as Record<string, unknown>).contentType;
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
  } else if (rawContentTypes && typeof rawContentTypes === 'object') {
    Object.entries(rawContentTypes as Record<string, unknown>).forEach(([key, value]) => {
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
