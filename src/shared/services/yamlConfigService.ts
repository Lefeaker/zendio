import { DEFAULT_YAML_CONFIG } from '../config/yamlDefaults';
import { extractDomainFields } from './yamlConfigDomain';
import { cloneField, mergeDomainOverrides, mergeFields, resolveBundle } from './yamlConfigMerge';
import { isYamlContentType, normalizeYamlConfigOverrides } from './yamlConfigSanitize';
import type { ResolvedYamlConfig, YamlConfigOverrides, YamlContentType } from '../types/yamlConfig';

export type { DomainFieldMerger } from './yamlConfigDomain';
export {
  buildDomainKeyOrder,
  extractDomainFields,
  normalizeDomain,
  normalizeDomainKey
} from './yamlConfigDomain';
export {
  cloneConfig,
  cloneField,
  mergeContentTypeConfig,
  mergeDomainOverrides,
  mergeFields,
  resolveBundle
} from './yamlConfigMerge';
export {
  isYamlContentType,
  normalizeYamlConfigOverrides,
  sanitizeContentTypeOverrides,
  sanitizeDefaultValue,
  sanitizeDomainOverrideMap,
  sanitizeField,
  sanitizeFieldList,
  sanitizeFieldName,
  toBoolean,
  toFieldType
} from './yamlConfigSanitize';

export interface ResolveYamlConfigOptions {
  domain?: string;
}

export class YamlConfigService {
  resolveConfig(
    contentType: YamlContentType,
    overrides: YamlConfigOverrides | null,
    options: ResolveYamlConfigOptions = {}
  ): ResolvedYamlConfig {
    const normalizedOverrides = overrides ? normalizeYamlConfigOverrides(overrides) : null;
    const bundle = resolveBundle(DEFAULT_YAML_CONFIG, normalizedOverrides, isYamlContentType);
    const baseConfig = bundle.contentTypes[contentType];
    if (!baseConfig) {
      throw new Error(`[yamlConfigService] 未找到内容类型 ${contentType} 的配置`);
    }

    let fields = baseConfig.fields.map(cloneField);

    const domainOverrides = mergeDomainOverrides(baseConfig.domainOverrides, undefined);
    const domainFields = extractDomainFields(options.domain, domainOverrides, mergeFields);
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

export const yamlConfigService = new YamlConfigService();
