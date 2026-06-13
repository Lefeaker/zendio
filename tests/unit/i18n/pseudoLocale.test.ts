import { describe, expect, it } from 'vitest';
import { schemaShellMessagesEnglish } from '../../../src/i18n/generated/schemaMessages.generated';
import en from '../../../src/i18n/generated/locales/en.generated';
import qpsPloc from '../../../src/i18n/generated/locales/qps-ploc.generated';
import { pseudoLocalizeString } from '../../../src/i18n/pseudoLocalization';
import { readCatalogSource } from '../../../tools/i18n/catalogReader';

describe('pseudo locale', () => {
  it('pseudo-localizes runtime, schema, and static sources deterministically', () => {
    expect(Object.keys(qpsPloc.runtime).sort()).toEqual(Object.keys(en.runtime).sort());
    expect(qpsPloc.runtime.fragmentTemplateHint).toBe(
      pseudoLocalizeString(en.runtime.fragmentTemplateHint)
    );
    expect(qpsPloc.runtime.yamlFieldArrayPlaceholder).toBe(
      pseudoLocalizeString(en.runtime.yamlFieldArrayPlaceholder)
    );
    expect(qpsPloc.static.extName).toBe(pseudoLocalizeString(en.static.extName));
    expect(qpsPloc.static.extDescription).toBe(pseudoLocalizeString(en.static.extDescription));
  });

  it('exposes pseudo runtime and static catalogs through the catalog reader', () => {
    const catalogs = readCatalogSource({ includePseudoLocale: true });
    const pseudoCatalog = catalogs.find((catalog) => catalog.language === 'qps-ploc');

    expect(pseudoCatalog).toBeDefined();
    expect(pseudoCatalog?.runtime.schemaMaintenanceTitle).toBe(
      pseudoLocalizeString(schemaShellMessagesEnglish.schemaMaintenanceTitle)
    );
    expect(pseudoCatalog?.static).toEqual(qpsPloc.static);
  });
});
