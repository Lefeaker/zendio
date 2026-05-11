import { normalizeDomainKey } from './yamlConfigDomain';
import { cloneValue } from '../utils/cloneValue';
import type {
  ContentTypeYamlConfig,
  PartialContentTypeYamlConfig,
  YamlConfigBundle,
  YamlConfigOverrides,
  YamlContentType,
  YamlFieldConfig
} from '../types/yamlConfig';

export const cloneField = (field: YamlFieldConfig): YamlFieldConfig => ({
  ...field,
  defaultValue: cloneValue(field.defaultValue)
});

export const mergeFields = (
  base: YamlFieldConfig[],
  overrides?: YamlFieldConfig[]
): YamlFieldConfig[] => {
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

export const mergeDomainOverrides = (
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

export const mergeContentTypeConfig = (
  contentType: YamlContentType,
  base: ContentTypeYamlConfig | undefined,
  override: PartialContentTypeYamlConfig | undefined
): ContentTypeYamlConfig | undefined => {
  /* c8 ignore next 3 -- defensive guard for unexpected content type keys */
  if (!base && !override) {
    return undefined;
  }

  let mergedFields = mergeFields(base?.fields ?? [], override?.fields);
  const mergedDomainOverrides = mergeDomainOverrides(
    base?.domainOverrides,
    override?.domainOverrides
  );
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
    ...(mergedDomainOverrides.size
      ? { domainOverrides: Object.fromEntries(mergedDomainOverrides) }
      : {}),
    ...(mergedCustomFields.length ? { customFields: mergedCustomFields } : {})
  };
};

export const cloneConfig = (
  config: ContentTypeYamlConfig | undefined
): ContentTypeYamlConfig | undefined => {
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
            Object.entries(config.domainOverrides).map(([key, fields]) => [
              key,
              fields.map(cloneField)
            ])
          )
        }
      : {}),
    ...(config.customFields ? { customFields: config.customFields.map(cloneField) } : {})
  };
};

export const resolveBundle = (
  defaults: YamlConfigBundle,
  override: YamlConfigOverrides | null,
  isYamlContentType: (value: string) => value is YamlContentType
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
