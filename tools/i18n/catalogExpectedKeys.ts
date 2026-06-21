import type { RuntimeMessageKey } from '../../src/i18n/catalog/keys';
import type { CatalogLocaleCatalog } from '../../src/i18n/catalog/schema';

export function collectRuntimeMessageKeysFromEnglishSource(
  catalogs: readonly CatalogLocaleCatalog[]
): RuntimeMessageKey[] {
  const english = catalogs.find((catalog) => catalog.language === 'en');
  if (!english) {
    throw new Error('English catalog is required to derive runtime message keys');
  }

  return Object.keys(english.runtime) as RuntimeMessageKey[];
}
