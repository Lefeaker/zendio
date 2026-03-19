import { DEFAULT_YAML_CONFIG } from '../config/yamlDefaults';
import type {
  ContentTypeYamlConfig,
  PartialContentTypeYamlConfig,
  ResolvedYamlConfig,
  YamlConfigBundle,
  YamlConfigOverrides,
  YamlContentType,
  YamlFieldConfig,
  YamlFieldType
} from '../types/yamlConfig';

export interface ResolveYamlConfigOptions {
  domain?: string;
}

const FIELD_TYPES: ReadonlySet<YamlFieldType> = new Set(['text', 'number', 'boolean', 'date', 'array']);
const CONTENT_TYPE_KEYS: ReadonlySet<YamlContentType> = new Set(['ai_chat', 'article', 'clipper', 'video']);
const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

const isYamlContentType = (value: string): value is YamlContentType => CONTENT_TYPE_KEYS.has(value as YamlContentType);

const toFieldType = (value: unknown): YamlFieldType =>
  (typeof value === 'string' && FIELD_TYPES.has(value as YamlFieldType) ? (value as YamlFieldType) : 'text');

const jsonClone = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const toBoolean = (value: unknown, fallback?: boolean): boolean | undefined => {
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

const sanitizeDefaultValue = (type: YamlFieldType, value: unknown): unknown => {
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

const cloneField = (field: YamlFieldConfig): YamlFieldConfig => ({
  ...field,
  defaultValue: jsonClone(field.defaultValue)
});

const sanitizeFieldName = (name: unknown): string | null => {
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  if (!trimmed || !FIELD_NAME_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
};

const sanitizeField = (field: unknown, fallbackType: YamlFieldType = 'text'): YamlFieldConfig | null => {
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

const sanitizeFieldList = (
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

const sanitizeDomainOverrideMap = (raw: unknown): Record<string, YamlFieldConfig[]> | undefined => {
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

const sanitizeContentTypeOverrides = (
  contentType: YamlContentType,
  raw: unknown
): PartialContentTypeYamlConfig | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const fields = sanitizeFieldList((raw as PartialContentTypeYamlConfig).fields);
  const customFields = sanitizeFieldList((raw as PartialContentTypeYamlConfig).customFields, { markCustom: true });
  const domainOverrides = sanitizeDomainOverrideMap((raw as PartialContentTypeYamlConfig).domainOverrides);

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
      if (sanitized && (sanitized.fields?.length || sanitized.customFields?.length || sanitized.domainOverrides)) {
        contentTypeMap[contentType] = sanitized;
      }
    });
  } else if (rawContentTypes && typeof rawContentTypes === 'object') {
    Object.entries(rawContentTypes as Record<string, unknown>).forEach(([key, value]) => {
      if (!isYamlContentType(key)) {
        return;
      }
      const sanitized = sanitizeContentTypeOverrides(key, value);
      if (sanitized && (sanitized.fields?.length || sanitized.customFields?.length || sanitized.domainOverrides)) {
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

const mergeFields = (base: YamlFieldConfig[], overrides?: YamlFieldConfig[]): YamlFieldConfig[] => {
  const merged = base.map(cloneField);
  if (!overrides?.length) {
    return merged;
  }

  const indexMap = new Map<string, number>();
  merged.forEach((field, index) => indexMap.set(field.name, index));

  for (const override of overrides) {
    const existingIndex = indexMap.get(override.name);
    if (existingIndex !== undefined) {
      const current = merged[existingIndex];
      merged[existingIndex] = {
        ...current,
        ...cloneField(override)
      };
      continue;
    }
    const cloned = cloneField(override);
    merged.push(cloned);
    indexMap.set(cloned.name, merged.length - 1);
  }

  return merged;
};

const normalizeDomain = (input?: string): string => {
  if (!input) {
    return '';
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }
  let raw = trimmed;
  if (raw.includes('://')) {
    try {
      raw = new URL(raw).hostname;
    } catch {
      raw = trimmed;
    }
  }
  return raw.replace(/\.$/, '').toLowerCase();
};

const normalizeDomainKey = (key: string): string => {
  const trimmed = key.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed === '*') {
    return '*';
  }
  if (trimmed.startsWith('*.')) {
    const normalized = normalizeDomain(trimmed.slice(2));
    return normalized ? `*.${normalized}` : '*';
  }
  return normalizeDomain(trimmed);
};

const mergeDomainOverrides = (
  base?: Record<string, YamlFieldConfig[]>,
  override?: Record<string, YamlFieldConfig[]>
): Map<string, YamlFieldConfig[]> => {
  const merged = new Map<string, YamlFieldConfig[]>();

  const apply = (source?: Record<string, YamlFieldConfig[]>) => {
    if (!source) {
      return;
    }
    for (const [rawKey, fields] of Object.entries(source)) {
      const key = normalizeDomainKey(rawKey);
      if (!key) {
        continue;
      }
      const existing = merged.get(key) ?? [];
      merged.set(key, mergeFields(existing, fields));
    }
  };

  apply(base);
  apply(override);

  return merged;
};

const buildDomainKeyOrder = (domain: string): string[] => {
  const normalized = normalizeDomain(domain);
  const keys: string[] = ['*'];
  if (!normalized) {
    return keys;
  }

  const parts = normalized.split('.');
  if (parts.length >= 2) {
    for (let i = 1; i < parts.length - 1; i += 1) {
      const suffix = parts.slice(i).join('.');
      if (suffix) {
        const wildcardKey = `*.${suffix}`;
        if (!keys.includes(wildcardKey)) {
          keys.push(wildcardKey);
        }
      }
    }
    const base = parts.slice(-2).join('.');
    if (base && !keys.includes(`*.${base}`)) {
      keys.push(`*.${base}`);
    }
  }

  if (normalized.startsWith('www.')) {
    const withoutWww = normalized.slice(4);
    if (withoutWww && !keys.includes(withoutWww)) {
      keys.push(withoutWww);
    }
  }

  if (!keys.includes(normalized)) {
    keys.push(normalized);
  }

  if (!normalized.startsWith('www.')) {
    const withWww = `www.${normalized}`;
    if (!keys.includes(withWww)) {
      keys.push(withWww);
    }
  }

  return keys;
};

const extractDomainFields = (
  domain: string | undefined,
  domainOverrides: Map<string, YamlFieldConfig[]>
): YamlFieldConfig[] => {
  if (!domainOverrides.size) {
    return [];
  }
  const keys = buildDomainKeyOrder(domain ?? '');
  let result: YamlFieldConfig[] = [];
  for (const key of keys) {
    const overrides = domainOverrides.get(key);
    if (!overrides?.length) {
      continue;
    }
    result = mergeFields(result, overrides);
  }
  return result;
};

const mergeContentTypeConfig = (
  contentType: YamlContentType,
  base: ContentTypeYamlConfig | undefined,
  override: PartialContentTypeYamlConfig | undefined
): ContentTypeYamlConfig | undefined => {
  /* c8 ignore next 3 -- defensive guard for unexpected content type keys */
  if (!base && !override) {
    return undefined;
  }

  let mergedFields = mergeFields(base?.fields ?? [], override?.fields);
  const mergedDomainOverrides = mergeDomainOverrides(base?.domainOverrides, override?.domainOverrides);
  const mergedCustomFields = mergeFields(base?.customFields ?? [], override?.customFields);

  if (mergedFields.length && base?.fields?.length) {
    const defaultNames = new Set(base.fields.map((field) => field.name));
    /* c8 ignore next 9 -- overrides of non-default names are filtered earlier, keep guard for legacy data */
    mergedFields = mergedFields.map((field) => {
      if (!defaultNames.has(field.name) && !field.isCustom && field.required) {
        const sanitized = cloneField(field);
        delete sanitized.required;
        return sanitized;
      }
      return field;
    });
  }

  return {
    contentType,
    fields: mergedFields,
    ...(mergedDomainOverrides.size ? { domainOverrides: Object.fromEntries(mergedDomainOverrides) } : {}),
    ...(mergedCustomFields.length ? { customFields: mergedCustomFields } : {})
  };
};

const cloneConfig = (config: ContentTypeYamlConfig | undefined): ContentTypeYamlConfig | undefined => {
  /* c8 ignore next 2 -- defensive guard when defaults are tampered at runtime */
  if (!config) {
    return undefined;
  }
  return {
    contentType: config.contentType,
    fields: config.fields.map(cloneField),
    ...(config.domainOverrides
      ? {
          domainOverrides: Object.fromEntries(
            Object.entries(config.domainOverrides).map(([key, fields]) => [key, fields.map(cloneField)])
          )
        }
      : {}),
    ...(config.customFields ? { customFields: config.customFields.map(cloneField) } : {})
  };
};

const resolveBundle = (
  defaults: YamlConfigBundle,
  override: YamlConfigOverrides | null
): YamlConfigBundle => {
  const result: YamlConfigBundle = {
    contentTypes: {},
    globalFields: mergeFields(defaults.globalFields ?? [], override?.globalFields)
  };

  const contentTypeKeys = new Set<string>([
    ...Object.keys(defaults.contentTypes ?? {}),
    ...Object.keys(override?.contentTypes ?? {})
  ]);

  for (const rawKey of contentTypeKeys) {
    /* c8 ignore next 2 -- normalized overrides should never hit this, keep for corrupted data */
    if (!isYamlContentType(rawKey)) {
      continue;
    }
    const key = rawKey;
    const merged = mergeContentTypeConfig(
      key,
      cloneConfig(defaults.contentTypes[key]),
      override?.contentTypes?.[key]
    );
    if (merged) {
      result.contentTypes[key] = merged;
    }
  }

  return result;
};

export class YamlConfigService {
  resolveConfig(
    contentType: YamlContentType,
    overrides: YamlConfigOverrides | null,
    options: ResolveYamlConfigOptions = {}
  ): ResolvedYamlConfig {
    const normalizedOverrides = overrides ? normalizeYamlConfigOverrides(overrides) : null;
    const bundle = resolveBundle(DEFAULT_YAML_CONFIG, normalizedOverrides);
    const baseConfig = bundle.contentTypes[contentType];
    if (!baseConfig) {
      throw new Error(`[yamlConfigService] 未找到内容类型 ${contentType} 的配置`);
    }

    let fields = baseConfig.fields.map(cloneField);

    const domainOverrides = mergeDomainOverrides(baseConfig.domainOverrides, undefined);
    const domainFields = extractDomainFields(options.domain, domainOverrides);
    if (domainFields.length) {
      fields = mergeFields(fields, domainFields);
    }

    if (baseConfig.customFields?.length) {
      fields = mergeFields(fields, baseConfig.customFields);
    }

    if (bundle.globalFields?.length) {
      fields = mergeFields(fields, bundle.globalFields);
    }

    return {
      contentType,
      fields
    };
  }

  validateYamlConfig(input: unknown): YamlConfigOverrides | null {
    return normalizeYamlConfigOverrides(input);
  }
}
