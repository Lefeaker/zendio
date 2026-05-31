import { DEFAULT_YAML_CONFIG } from '@shared/config';
import type {
  PartialContentTypeYamlConfig,
  YamlConfigOverrides,
  YamlContentType,
  YamlFieldConfig
} from '@shared/types/yamlConfig';
import {
  buildDomainFieldConfig,
  buildFieldConfig,
  isYamlValueEqual,
  parseDefaultValue
} from './codecs';
import { getNormalizedDomain } from './state';
import { validateYamlEditorState } from './validation';
import { YAML_EDITOR_CONTENT_TYPES, type YamlEditorField, type YamlEditorState } from './types';

function getDefaultField(contentType: YamlContentType, name: string): YamlFieldConfig | undefined {
  return DEFAULT_YAML_CONFIG.contentTypes[contentType]?.fields.find((field) => field.name === name);
}

function shouldIncludeBuiltInField(field: YamlEditorField, contentType: YamlContentType): boolean {
  const baseline = getDefaultField(contentType, field.name.trim());
  if (!baseline) {
    return field.enabled;
  }
  if (baseline.type !== field.type) {
    return true;
  }
  if ((baseline.enabled ?? true) !== field.enabled) {
    return true;
  }
  if (Boolean(baseline.required) !== field.required) {
    return true;
  }
  if (baseline.valuePath !== (field.valuePath.trim() || undefined)) {
    return true;
  }
  const parsed = parseDefaultValue(field.type, field.defaultValue);
  return !isYamlValueEqual(baseline.defaultValue ?? undefined, parsed);
}

function collectDomainOverrides(
  state: YamlEditorState,
  contentType: YamlContentType
): Record<string, YamlFieldConfig[]> | undefined {
  const result: Record<string, YamlFieldConfig[]> = {};
  state.contentTypes[contentType].domainOverrides.forEach((entry) => {
    const domain = getNormalizedDomain(entry.domain);
    if (!domain || !entry.fields.length) {
      return;
    }
    result[domain] = entry.fields.map(buildDomainFieldConfig);
  });
  return Object.keys(result).length ? result : undefined;
}

export function serializeYamlEditorState(state: YamlEditorState): YamlConfigOverrides | null {
  const validation = validateYamlEditorState(state);
  if (!validation.valid) {
    return null;
  }

  const overrides: YamlConfigOverrides = { contentTypes: {} };
  let hasContent = false;

  YAML_EDITOR_CONTENT_TYPES.forEach((contentType) => {
    const fieldOverrides = state.contentTypes[contentType].fields
      .filter((field) => field.name.trim() && shouldIncludeBuiltInField(field, contentType))
      .map(buildFieldConfig);
    const customFields = state.contentTypes[contentType].customFields
      .filter((field) => field.enabled && field.name.trim())
      .map((field) => buildFieldConfig({ ...field, isCustom: true }));
    const domainOverrides = collectDomainOverrides(state, contentType);
    if (!fieldOverrides.length && !customFields.length && !domainOverrides) {
      return;
    }
    const payload: PartialContentTypeYamlConfig = {};
    if (fieldOverrides.length) {
      payload.fields = fieldOverrides;
    }
    if (customFields.length) {
      payload.customFields = customFields;
    }
    if (domainOverrides) {
      payload.domainOverrides = domainOverrides;
    }
    (overrides.contentTypes ??= {})[contentType] = payload;
    hasContent = true;
  });

  const globalFields = state.globalFields
    .filter((field) => field.name.trim())
    .map((field) => buildFieldConfig({ ...field, isCustom: true }));
  if (globalFields.length) {
    overrides.globalFields = globalFields;
  }

  return hasContent || globalFields.length ? overrides : null;
}
