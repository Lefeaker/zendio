import { RELEASE_LANGUAGE_ORDER } from '../../src/i18n/catalog/languages';
import type { CatalogLocaleCatalog } from '../../src/i18n/catalog/schema';
import type { RuntimeMessageKey } from '../../src/i18n/catalog/keys';
import { isRuntimeMessageKey } from '../../src/i18n/catalog/keys';
import type { ChromeStaticCatalog } from '../../src/i18n/catalog/static';
import type { CompiledCatalog, CompileCatalogOptions } from './compileCatalog';

function findMatchingBrace(template: string, startIndex: number): number {
  let depth = 0;

  for (let index = startIndex; index < template.length; index += 1) {
    const char = template[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error(`Unbalanced placeholder braces in template: ${template}`);
}

function collectFormatterBranchPlaceholders(source: string, tokens: Set<string>): void {
  let cursor = 0;

  while (cursor < source.length) {
    const openIndex = source.indexOf('{', cursor);
    if (openIndex === -1) {
      return;
    }

    const closeIndex = findMatchingBrace(source, openIndex);
    const blockContent = source.slice(openIndex + 1, closeIndex);

    if (blockContent.includes('{') || blockContent.includes(',')) {
      collectPlaceholderTokens(blockContent, tokens);
    }

    cursor = closeIndex + 1;
  }
}

function collectPlaceholderTokens(template: string, tokens: Set<string>): void {
  let cursor = 0;

  while (cursor < template.length) {
    const openIndex = template.indexOf('{', cursor);
    if (openIndex === -1) {
      return;
    }

    const closeIndex = findMatchingBrace(template, openIndex);
    const token = template.slice(openIndex + 1, closeIndex);
    const firstComma = token.indexOf(',');

    if (firstComma === -1) {
      const key = token.trim();
      if (key) {
        tokens.add(key);
      }
    } else {
      const key = token.slice(0, firstComma).trim();
      if (key) {
        tokens.add(key);
      }
      collectFormatterBranchPlaceholders(token.slice(firstComma + 1), tokens);
    }

    cursor = closeIndex + 1;
  }
}

function extractPlaceholderTokens(template: string): string[] {
  const tokens = new Set<string>();
  collectPlaceholderTokens(template, tokens);
  return [...tokens].sort((left, right) => left.localeCompare(right));
}

function formatKeyList(keys: string[]): string {
  return keys.join(', ');
}

function sortKeys<Key extends string>(keys: Iterable<Key>): Key[] {
  return [...keys].sort((left, right) => left.localeCompare(right));
}

function normalizeRuntimeMessages(
  catalog: CatalogLocaleCatalog,
  messageKeys: readonly RuntimeMessageKey[]
): Record<RuntimeMessageKey, string> {
  const normalized = {} as Record<RuntimeMessageKey, string>;

  for (const key of messageKeys) {
    const value = catalog.runtime[key];
    if (typeof value !== 'string') {
      throw new Error(`Catalog for ${catalog.language} is missing compiled value for ${key}`);
    }
    normalized[key] = value;
  }

  return normalized;
}

function normalizeStaticMessages(catalog: CatalogLocaleCatalog): Partial<ChromeStaticCatalog> {
  return catalog.static ? { ...catalog.static } : {};
}

export function validateCatalogSource(
  catalogs: readonly CatalogLocaleCatalog[],
  options: CompileCatalogOptions = {}
): CompiledCatalog {
  const languageOrder = [...(options.releaseLanguageOrder ?? RELEASE_LANGUAGE_ORDER)];
  const allowExtraKeys = new Set(options.allowExtraKeys ?? []);
  const targetLanguages = options.includePseudoLocale
    ? [...languageOrder, 'qps-ploc']
    : [...languageOrder];

  const errors: string[] = [];
  const catalogByLanguage = new Map<string, CatalogLocaleCatalog>();

  for (const catalog of catalogs) {
    if (catalogByLanguage.has(catalog.language)) {
      errors.push(`Duplicate catalog language: ${catalog.language}`);
      continue;
    }
    catalogByLanguage.set(catalog.language, catalog);
  }

  const baseline = catalogByLanguage.get('en');
  if (!baseline) {
    errors.push('Missing English baseline catalog: en');
  }

  const expectedKeys: RuntimeMessageKey[] =
    options.expectedKeys && options.expectedKeys.length > 0
      ? sortKeys(options.expectedKeys)
      : baseline
        ? sortKeys(Object.keys(baseline.runtime).filter(isRuntimeMessageKey))
        : [];
  const expectedKeySet = new Set<string>(expectedKeys);

  if (baseline) {
    const missingBaselineKeys = expectedKeys.filter(
      (key) => typeof baseline.runtime[key] !== 'string'
    );
    if (missingBaselineKeys.length > 0) {
      errors.push(`en missing runtime keys: ${formatKeyList(missingBaselineKeys)}`);
    }
  }

  for (const language of targetLanguages) {
    const catalog = catalogByLanguage.get(language);
    if (!catalog) {
      errors.push(`Missing catalog language: ${language}`);
      continue;
    }

    const runtimeKeys = Object.keys(catalog.runtime);
    const missingKeys = expectedKeys.filter((key) => typeof catalog.runtime[key] !== 'string');
    if (missingKeys.length > 0) {
      errors.push(`${language} missing runtime keys: ${formatKeyList(missingKeys)}`);
    }

    const extraKeys = sortKeys(
      runtimeKeys.filter((key) => !expectedKeySet.has(key) && !allowExtraKeys.has(key))
    );
    if (extraKeys.length > 0) {
      errors.push(`${language} extra runtime keys: ${formatKeyList(extraKeys)}`);
    }

    if (!baseline || language === 'en') {
      continue;
    }

    for (const key of expectedKeys) {
      const baselineValue = baseline.runtime[key];
      const targetValue = catalog.runtime[key];

      if (typeof baselineValue !== 'string' || typeof targetValue !== 'string') {
        continue;
      }

      const baselineTokens = extractPlaceholderTokens(baselineValue);
      const targetTokens = extractPlaceholderTokens(targetValue);

      const missingTokens = baselineTokens.filter((token) => !targetTokens.includes(token));
      const unexpectedTokens = targetTokens.filter((token) => !baselineTokens.includes(token));

      if (missingTokens.length === 0 && unexpectedTokens.length === 0) {
        continue;
      }

      const issues: string[] = [];
      if (missingTokens.length > 0) {
        issues.push(`missing {${missingTokens.join(', ')}}`);
      }
      if (unexpectedTokens.length > 0) {
        issues.push(`unexpected {${unexpectedTokens.join(', ')}}`);
      }
      errors.push(`${language} placeholder mismatch at "${key}": ${issues.join('; ')}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Catalog validation failed:\n- ${errors.join('\n- ')}`);
  }

  const localeCodes = [...targetLanguages];
  const messageKeys = [...expectedKeys];
  const sourceLocaleCodes = [...catalogByLanguage.keys()];

  return {
    localeCodes,
    messageKeys,
    sourceLocaleCodes,
    locales: Object.fromEntries(
      localeCodes.map((language) => {
        const catalog = catalogByLanguage.get(language);
        if (!catalog) {
          throw new Error(`Validated catalog missing language: ${language}`);
        }
        return [language, normalizeRuntimeMessages(catalog, messageKeys)];
      })
    ),
    staticCatalogs: Object.fromEntries(
      sourceLocaleCodes.map((language) => {
        const catalog = catalogByLanguage.get(language);
        if (!catalog) {
          throw new Error(`Validated catalog missing language: ${language}`);
        }
        return [language, normalizeStaticMessages(catalog)];
      })
    )
  };
}
