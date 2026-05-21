import { YamlConfigService } from '../services/yamlConfigService';
import { getYamlConfigOverrides } from '../state/yamlConfigOverridesStore';
import type { YamlContentType, YamlFieldConfig } from '../types/yamlConfig';

export type YamlGenerationContext = Record<string, unknown>;

export interface YamlGenerationOptions {
  domain?: string;
}

const escapeYamlString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');

const toArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
};

const stringifyArrayValue = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return `"${escapeYamlString(String(value))}"`;
};

const stringifyFieldValue = (field: YamlFieldConfig, value: unknown): string | null => {
  switch (field.type) {
    case 'text':
    case 'date':
      return `"${escapeYamlString(String(value))}"`;
    case 'number': {
      const asNumber = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(asNumber)) {
        throw new Error(
          `[yamlGenerator] 字段 ${field.name} 需要数字类型，当前值: ${String(value)}`
        );
      }
      return String(asNumber);
    }
    case 'boolean': {
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      if (typeof value === 'string') {
        return value.trim().toLowerCase() === 'true' ? 'true' : 'false';
      }
      return value ? 'true' : 'false';
    }
    case 'array': {
      const elements = toArray(value);
      if (!elements.length) {
        return '[]';
      }
      return `[${elements.map((item) => stringifyArrayValue(item)).join(', ')}]`;
    }
    default:
      return `"${escapeYamlString(String(value))}"`;
  }
};

const splitPath = (path: string): string[] => {
  const segments: string[] = [];
  let current = '';
  for (let i = 0; i < path.length; i += 1) {
    const char = path[i];
    if (char === '.') {
      if (current) {
        segments.push(current);
        current = '';
      }
      continue;
    }
    if (char === '[') {
      if (current) {
        segments.push(current);
        current = '';
      }
      let buffer = '';
      i += 1;
      while (i < path.length && path[i] !== ']') {
        buffer += path[i];
        i += 1;
      }
      if (buffer) {
        segments.push(buffer);
      }
      continue;
    }
    current += char;
  }
  if (current) {
    segments.push(current);
  }
  return segments;
};

const normalizeKeyToken = (token: string): string =>
  token.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

const findAliasKey = (source: Record<string, unknown>, token: string): string | null => {
  const normalized = normalizeKeyToken(token);
  if (!normalized) {
    return null;
  }
  for (const key of Object.keys(source)) {
    if (normalizeKeyToken(key) === normalized) {
      return key;
    }
  }
  return null;
};

const getByPath = (source: YamlGenerationContext, path: string | undefined): unknown => {
  if (!path) {
    return undefined;
  }
  const tokens = splitPath(path);
  let current: unknown = source;
  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isFinite(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(record, token)) {
        current = record[token];
        continue;
      }
      // Allow snake_case / kebab-case field names to resolve camelCase context keys.
      const aliasKey = findAliasKey(record, token);
      if (aliasKey) {
        current = record[aliasKey];
        continue;
      }
      return undefined;
    }
    return undefined;
  }
  return current;
};

const deriveDomainFromContext = (context: YamlGenerationContext): string | undefined => {
  if (typeof context.domain === 'string' && context.domain.trim()) {
    return context.domain;
  }
  const urlCandidate = context.url ?? context.sourceUrl ?? context.pageUrl;
  if (typeof urlCandidate !== 'string') {
    return undefined;
  }
  try {
    return new URL(urlCandidate).hostname;
  } catch {
    return undefined;
  }
};

const resolveFieldValue = (field: YamlFieldConfig, context: YamlGenerationContext): unknown => {
  const candidates = [field.valuePath, field.name].filter((path): path is string => Boolean(path));
  for (const candidate of candidates) {
    const value = getByPath(context, candidate);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return field.defaultValue;
};

export const generateYamlFrontMatter = (
  contentType: YamlContentType,
  context: YamlGenerationContext,
  options: YamlGenerationOptions = {}
): string => {
  const domain = options.domain ?? deriveDomainFromContext(context);
  const overrides = getYamlConfigOverrides();
  const config = yamlConfigService.resolveConfig(contentType, overrides, {
    ...(domain !== undefined && { domain })
  });

  const lines: string[] = ['---'];
  for (const field of config.fields) {
    if (!field.enabled) {
      continue;
    }
    try {
      const value = resolveFieldValue(field, context);
      if (value === undefined || value === null) {
        if (
          !field.required &&
          field.valuePath &&
          field.valuePath.trim() &&
          field.defaultValue === undefined
        ) {
          console.warn('[yamlGenerator] 未能从 valuePath 获取字段值', {
            field: field.name,
            valuePath: field.valuePath,
            contentType,
            domain
          });
        }
        if (field.required) {
          throw new Error(`[yamlGenerator] 字段 ${field.name} 缺少值`);
        }
        continue;
      }
      const serialized = stringifyFieldValue(field, value);
      if (!serialized) {
        continue;
      }
      lines.push(`${field.name}: ${serialized}`);
    } catch (error) {
      if (field.required) {
        throw error;
      }
      console.warn(`[yamlGenerator] 生成字段 ${field.name} 失败:`, error);
    }
  }
  lines.push('---');
  return lines.join('\n');
};
const yamlConfigService = new YamlConfigService();
