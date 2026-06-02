import type { YamlFieldConfig, YamlFieldType } from '@shared/types/yamlConfig';
import type { YamlEditorDomainField, YamlEditorField } from './types';

export const YAML_EDITOR_ARRAY_SPLIT_PATTERN = /[;\n,]+/;
export const YAML_EDITOR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export const YAML_EDITOR_VALUE_PATH_PATTERN = /^\S+$/;

export type YamlEditorDefaultValueError = 'INVALID_ARRAY' | 'INVALID_BOOLEAN' | 'INVALID_NUMBER';

export interface YamlEditorParsedDefaultValue {
  value?: unknown;
  error?: YamlEditorDefaultValueError;
}

export function stringifyDefaultValue(type: YamlFieldType, value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (type === 'array') {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join('; ');
    }
    return formatArrayValue(String(value));
  }
  if (type === 'boolean') {
    return String(Boolean(value));
  }
  if (type === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : '';
  }
  return String(value);
}

export function extractArrayItems(raw: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(YAML_EDITOR_ARRAY_SPLIT_PATTERN)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function formatArrayValue(raw: string): string {
  return extractArrayItems(raw).join('; ');
}

export function parseDefaultValueWithValidation(
  type: YamlFieldType,
  value: string
): YamlEditorParsedDefaultValue {
  if (!value.trim()) {
    return {};
  }
  switch (type) {
    case 'number': {
      const numeric = Number(value.trim());
      if (!Number.isFinite(numeric)) {
        return { error: 'INVALID_NUMBER' };
      }
      return { value: numeric };
    }
    case 'boolean': {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return { value: true };
      }
      if (normalized === 'false') {
        return { value: false };
      }
      return { error: 'INVALID_BOOLEAN' };
    }
    case 'array': {
      const items = extractArrayItems(value);
      if (!items.length) {
        return { error: 'INVALID_ARRAY' };
      }
      return { value: items };
    }
    default:
      return { value };
  }
}

export function parseDefaultValue(type: YamlFieldType, value: string): unknown {
  const parsed = parseDefaultValueWithValidation(type, value);
  return parsed.error ? undefined : parsed.value;
}

export function buildFieldConfig(field: YamlEditorField): YamlFieldConfig {
  const config: YamlFieldConfig = {
    name: field.name.trim(),
    type: field.type,
    enabled: field.enabled
  };
  if (field.required) {
    config.required = true;
  }
  const parsed = parseDefaultValue(field.type, field.defaultValue);
  if (parsed !== undefined) {
    config.defaultValue = parsed;
  }
  const valuePath = field.valuePath.trim();
  if (valuePath) {
    config.valuePath = valuePath;
  }
  if (field.isCustom) {
    config.isCustom = true;
  }
  return config;
}

export function buildDomainFieldConfig(field: YamlEditorDomainField): YamlFieldConfig {
  const config: YamlFieldConfig = {
    name: field.name.trim(),
    type: field.type,
    enabled: field.enabled
  };
  const parsed = parseDefaultValue(field.type, field.defaultValue);
  if (parsed !== undefined) {
    config.defaultValue = parsed;
  }
  const valuePath = field.valuePath.trim();
  if (valuePath) {
    config.valuePath = valuePath;
  }
  return config;
}

export function isYamlValueEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  }
  return a === b;
}
