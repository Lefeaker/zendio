import { DEFAULT_YAML_CONFIG } from '@shared/config';
import type { YamlContentType, YamlFieldConfig, YamlFieldType } from '@shared/types/yamlConfig';
import {
  ARRAY_SPLIT_PATTERN,
  type DomainFieldRow,
  type FieldRow,
  type TypeToggleMap
} from './yamlConfigTableTypes';

export function createToggleMap(initial: boolean): TypeToggleMap {
  return {
    article: initial,
    clipper: initial,
    video: initial,
    ai_chat: initial
  };
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
    .split(ARRAY_SPLIT_PATTERN)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function formatArrayValue(raw: string): string {
  const items = extractArrayItems(raw);
  return items.join('; ');
}

export function parseDefaultValueWithValidation(
  type: YamlFieldType,
  value: string
): { value?: unknown; error?: string } {
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
  const { value: parsed, error } = parseDefaultValueWithValidation(type, value);
  return error ? undefined : parsed;
}

export function buildFieldConfig(
  row: FieldRow,
  enabled: boolean,
  defaultTemplate?: YamlFieldConfig
): YamlFieldConfig {
  const config: YamlFieldConfig = {
    name: row.name.trim(),
    type: row.type,
    enabled
  };

  if (row.required && defaultTemplate?.required) {
    config.required = true;
  }
  const trimmedPath = row.valuePath?.trim();
  if (trimmedPath) {
    config.valuePath = trimmedPath;
  }

  const parsed = parseDefaultValue(row.type, row.defaultValue ?? '');
  if (parsed !== undefined) {
    config.defaultValue = parsed;
  }

  return config;
}

export function buildDomainFieldConfig(field: DomainFieldRow): YamlFieldConfig {
  const config: YamlFieldConfig = {
    name: field.name,
    type: field.type,
    enabled: field.enabled
  };
  const parsed = parseDefaultValue(field.type, field.defaultValue ?? '');
  if (parsed !== undefined) {
    config.defaultValue = parsed;
  }
  const trimmedPath = field.valuePath?.trim();
  if (trimmedPath) {
    config.valuePath = trimmedPath;
  }
  return config;
}

export function shouldIncludeField(
  current: YamlFieldConfig,
  baseline: YamlFieldConfig | undefined
): boolean {
  if (!baseline) {
    return true;
  }

  const baselineEnabled = baseline.enabled ?? true;
  const currentEnabled = current.enabled ?? true;
  if (baselineEnabled !== currentEnabled) {
    return true;
  }

  const baselineDefault = baseline.defaultValue ?? undefined;
  const currentDefault = current.defaultValue ?? undefined;
  if (!isValueEqual(baselineDefault, currentDefault)) {
    return true;
  }

  if (baseline.valuePath !== current.valuePath) {
    return true;
  }

  return false;
}

export function getDefaultFieldMap(contentType: YamlContentType): Map<string, YamlFieldConfig> {
  const defaults = DEFAULT_YAML_CONFIG.contentTypes?.[contentType];
  const map = new Map<string, YamlFieldConfig>();
  defaults?.fields.forEach((field) => map.set(field.name, field));
  return map;
}

function isValueEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  }
  return a === b;
}
