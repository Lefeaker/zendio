import type { CatalogLocaleCatalog } from '../../src/i18n/catalog/schema';
import {
  getPseudoLocaleCatalogSource,
  getReleaseRuntimeCatalogSource
} from '../../src/i18n/catalog/source';

export interface CatalogReaderOptions {
  includePseudoLocale?: boolean;
}

export function readCatalogSource(options: CatalogReaderOptions = {}): CatalogLocaleCatalog[] {
  const catalogs = getReleaseRuntimeCatalogSource();
  if (options.includePseudoLocale) {
    catalogs.push(getPseudoLocaleCatalogSource());
  }
  return catalogs;
}
