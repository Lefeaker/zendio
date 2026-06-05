import type { CatalogLocaleCatalog } from '../../src/i18n/catalog/schema';
import type { RuntimeMessageKey } from '../../src/i18n/catalog/keys';
import type { ChromeStaticCatalog } from '../../src/i18n/catalog/static';
import { validateCatalogSource } from './catalogValidator';

export interface CompileCatalogOptions {
  expectedKeys?: readonly RuntimeMessageKey[];
  allowExtraKeys?: readonly string[];
  releaseLanguageOrder?: readonly string[];
  includePseudoLocale?: boolean;
}

export interface CompiledCatalog {
  localeCodes: string[];
  messageKeys: RuntimeMessageKey[];
  locales: Record<string, Record<RuntimeMessageKey, string>>;
  sourceLocaleCodes: string[];
  staticCatalogs: Partial<Record<string, Partial<ChromeStaticCatalog>>>;
}

export function compileCatalog(
  catalogs: readonly CatalogLocaleCatalog[],
  options: CompileCatalogOptions = {}
): CompiledCatalog {
  return validateCatalogSource(catalogs, options);
}
