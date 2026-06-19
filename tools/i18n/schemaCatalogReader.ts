import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { RuntimeMessageKey } from '../../src/i18n/catalog/keys';
import type { ReleaseLangCode } from '../../src/i18n/catalog/languages';
import { RELEASE_LANGUAGE_ORDER } from '../../src/i18n/catalog/languages';
import type { CatalogLocaleCatalog } from '../../src/i18n/catalog/schema';

function readSchemaCatalogFile(
  rootDir: string,
  language: ReleaseLangCode
): CatalogLocaleCatalog['runtime'] {
  const filePath = path.join(rootDir, 'src/i18n/catalog/messages', language, 'schema.json');
  return JSON.parse(readFileSync(filePath, 'utf8')) as CatalogLocaleCatalog['runtime'];
}

export function readSchemaCatalogSource(rootDir = process.cwd()): CatalogLocaleCatalog[] {
  return RELEASE_LANGUAGE_ORDER.map((language) => ({
    language,
    runtime: readSchemaCatalogFile(rootDir, language)
  }));
}

export function collectSchemaMessageKeysFromEnglishSource(
  catalogs: readonly CatalogLocaleCatalog[]
): RuntimeMessageKey[] {
  const english = catalogs.find((catalog) => catalog.language === 'en');
  if (!english) {
    throw new Error('English schema catalog is required to derive schema message keys');
  }

  return Object.keys(english.runtime) as RuntimeMessageKey[];
}
