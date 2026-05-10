import type { YamlFieldConfig } from '../types/yamlConfig';

export type DomainFieldMerger = (
  base: YamlFieldConfig[],
  overrides?: YamlFieldConfig[]
) => YamlFieldConfig[];

export const normalizeDomain = (input?: string): string => {
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

export const normalizeDomainKey = (key: string): string => {
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

export const buildDomainKeyOrder = (domain: string): string[] => {
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

export const extractDomainFields = (
  domain: string | undefined,
  domainOverrides: Map<string, YamlFieldConfig[]>,
  mergeFields: DomainFieldMerger
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
