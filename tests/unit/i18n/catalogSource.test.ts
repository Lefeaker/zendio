import { describe, expect, it } from 'vitest';
import { RUNTIME_MESSAGE_KEYS } from '../../../src/i18n/catalog/keys';
import { RELEASE_LANGUAGE_ORDER } from '../../../src/i18n/catalog/languages';
import { SCHEMA_MESSAGE_KEYS } from '../../../src/i18n/catalog/schemaKeys';
import { readCatalogSource } from '../../../tools/i18n/catalogReader';
import { readSchemaCatalogSource } from '../../../tools/i18n/schemaCatalogReader';

describe('i18n catalog source', () => {
  it('reads release runtime catalogs in configured language order', () => {
    const catalogs = readCatalogSource();

    expect(catalogs.map((catalog) => catalog.language)).toEqual(RELEASE_LANGUAGE_ORDER);
    expect(catalogs.some((catalog) => catalog.language === 'qps-ploc')).toBe(false);

    const expectedKeys = [...RUNTIME_MESSAGE_KEYS].sort();
    for (const catalog of catalogs) {
      expect(Object.keys(catalog.runtime).sort()).toEqual(expectedKeys);
    }
  });

  it('reads release schema catalogs in configured language order', () => {
    const catalogs = readSchemaCatalogSource();

    expect(catalogs.map((catalog) => catalog.language)).toEqual(RELEASE_LANGUAGE_ORDER);

    const expectedKeys = [...SCHEMA_MESSAGE_KEYS].sort();
    for (const catalog of catalogs) {
      expect(Object.keys(catalog.runtime).sort()).toEqual(expectedKeys);
    }
  });
});
