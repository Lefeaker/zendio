import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_LANGUAGES,
  CHROME_STATIC_KEYS,
  DEFAULT_LANGUAGE,
  LANGUAGE_CONFIG,
  getConfiguredLanguageCodes,
  getWebExtensionLocaleFolder
} from '../../../src/i18n/config';
import {
  DYNAMIC_MESSAGE_KEYS,
  DYNAMIC_MESSAGE_TEMPLATES
} from '../../../src/i18n/catalog/dynamicTemplates';
import { CATALOG_DOMAIN_NAMES, isCatalogDomain } from '../../../src/i18n/catalog/domains';
import { RUNTIME_MESSAGE_KEYS, isRuntimeMessageKey } from '../../../src/i18n/catalog/keys';
import { SCHEMA_MESSAGE_KEYS, isSchemaMessageKey } from '../../../src/i18n/catalog/schemaKeys';
import {
  getPseudoLocaleCatalogSource,
  getReleaseRuntimeCatalogSource
} from '../../../src/i18n/catalog/source';
import { GENERATED_MESSAGE_KEYS } from '../../../src/i18n/generated/messages.generated';
import { GENERATED_RELEASE_STATIC_REGISTRY } from '../../../src/i18n/generated/staticRegistry.generated';
import {
  DEFAULT_RUNTIME_MESSAGES,
  DEFAULT_STATIC_MESSAGES,
  getLocaleCodes,
  hasLocaleLoader
} from '../../../src/i18n/locales';
import type { Messages } from '../../../src/i18n/messages';
import {
  AVAILABLE_LANGUAGE_ORDER,
  DEFAULT_LANGUAGE as CATALOG_DEFAULT_LANGUAGE,
  LANGUAGE_ALIASES,
  LANGUAGE_FALLBACKS,
  LANGUAGE_METADATA,
  PSEUDO_LOCALE_CODE,
  RELEASE_LANGUAGE_ORDER,
  WEB_EXTENSION_LOCALE_FOLDERS as CATALOG_WEB_EXTENSION_LOCALE_FOLDERS,
  getAvailableLanguageOrder,
  getRuntimeLanguageOrder,
  getWebExtensionLocaleFolder as getCatalogWebExtensionLocaleFolder,
  isReleaseLanguage
} from '../../../src/i18n/catalog/languages';
import {
  isCatalogDomainGroups,
  isCatalogLocaleCatalog,
  isCatalogSchema
} from '../../../src/i18n/catalog/schema';
import {
  CHROME_STATIC_KEYS as CATALOG_CHROME_STATIC_KEYS,
  isChromeStaticKey
} from '../../../src/i18n/catalog/static';

describe('i18n catalog contract', () => {
  it('mirrors the current language registry contract', () => {
    const configuredCodes = getConfiguredLanguageCodes();
    const releaseCodes = configuredCodes.filter((code) => code !== PSEUDO_LOCALE_CODE);

    expect(CATALOG_DEFAULT_LANGUAGE).toBe(DEFAULT_LANGUAGE);
    expect(PSEUDO_LOCALE_CODE).toBe('qps-ploc');
    expect(RELEASE_LANGUAGE_ORDER).toEqual(releaseCodes);
    expect(getRuntimeLanguageOrder()).toEqual(configuredCodes);
    expect(AVAILABLE_LANGUAGE_ORDER).toEqual(AVAILABLE_LANGUAGES.map(({ code }) => code));
    expect(getAvailableLanguageOrder()).toEqual(AVAILABLE_LANGUAGES.map(({ code }) => code));
    expect(isReleaseLanguage('en')).toBe(true);
    expect(isReleaseLanguage(PSEUDO_LOCALE_CODE)).toBe(false);

    for (const code of configuredCodes) {
      expect(LANGUAGE_METADATA[code]).toEqual(LANGUAGE_CONFIG[code]);
      expect(LANGUAGE_ALIASES[code]).toEqual(LANGUAGE_CONFIG[code]?.aliases ?? []);
      expect(LANGUAGE_FALLBACKS[code]).toEqual(LANGUAGE_CONFIG[code]?.fallbacks ?? []);
      expect(getCatalogWebExtensionLocaleFolder(code)).toBe(getWebExtensionLocaleFolder(code));
    }

    expect(CATALOG_WEB_EXTENSION_LOCALE_FOLDERS['es-ES']).toBe('es');
    expect(CATALOG_WEB_EXTENSION_LOCALE_FOLDERS['es-419']).toBe('es_419');
  });

  it('preserves Chrome static key ownership in the catalog contract', () => {
    expect(CATALOG_CHROME_STATIC_KEYS).toEqual(CHROME_STATIC_KEYS);

    for (const key of CATALOG_CHROME_STATIC_KEYS) {
      expect(isChromeStaticKey(key)).toBe(true);
    }

    expect(isChromeStaticKey('settingsTitle')).toBe(false);
  });

  it('declares the canonical catalog domains', () => {
    expect(CATALOG_DOMAIN_NAMES).toEqual([
      'common',
      'clipper',
      'reader',
      'video',
      'options',
      'onboarding',
      'diagnostics',
      'privacy',
      'usage',
      'schema',
      'support',
      'dynamic',
      'extension'
    ]);

    expect(isCatalogDomain('reader')).toBe(true);
    expect(isCatalogDomain('not-a-domain')).toBe(false);
  });

  it('exposes runtime message keys without mixing in static manifest keys', () => {
    const knownRuntimeKey: keyof Messages = 'settingsTitle';

    expect(RUNTIME_MESSAGE_KEYS).toContain(knownRuntimeKey);
    expect(new Set(RUNTIME_MESSAGE_KEYS).size).toBe(RUNTIME_MESSAGE_KEYS.length);
    expect(isRuntimeMessageKey(knownRuntimeKey)).toBe(true);
    expect(isRuntimeMessageKey('extName')).toBe(false);
  });

  it('keeps generated runtime and static catalog sources aligned with release languages', () => {
    expect(GENERATED_MESSAGE_KEYS).toEqual(RUNTIME_MESSAGE_KEYS);
    expect(DEFAULT_RUNTIME_MESSAGES.settingsTitle).toBe('Settings');
    expect(DEFAULT_STATIC_MESSAGES.extName).toBe('Zendio');
    expect(getLocaleCodes()).toEqual(getConfiguredLanguageCodes());
    expect(hasLocaleLoader('en')).toBe(true);
    expect(hasLocaleLoader(PSEUDO_LOCALE_CODE)).toBe(true);
    expect(hasLocaleLoader('es')).toBe(false);

    const releaseCatalogs = getReleaseRuntimeCatalogSource();
    expect(releaseCatalogs.map((catalog) => catalog.language)).toEqual(RELEASE_LANGUAGE_ORDER);

    for (const catalog of releaseCatalogs) {
      if (!isReleaseLanguage(catalog.language) || catalog.static === undefined) {
        throw new Error(`Unexpected release catalog shape for ${catalog.language}`);
      }
      const staticMessages = catalog.static;
      const staticDescription = staticMessages.extDescription;
      if (staticDescription === undefined) {
        throw new Error(`Missing static description for ${catalog.language}`);
      }

      expect(Object.keys(catalog.runtime).sort()).toEqual([...GENERATED_MESSAGE_KEYS].sort());
      expect(staticMessages).toEqual(GENERATED_RELEASE_STATIC_REGISTRY[catalog.language]);
      expect(staticMessages.extName).toBe('Zendio');
      expect(staticDescription.length).toBeGreaterThan(20);
    }

    const pseudoCatalog = getPseudoLocaleCatalogSource();
    if (pseudoCatalog.static === undefined) {
      throw new Error('Unexpected pseudo catalog shape');
    }
    const pseudoDescription = pseudoCatalog.static.extDescription;
    if (pseudoDescription === undefined) {
      throw new Error('Missing pseudo static description');
    }
    expect(pseudoCatalog.language).toBe(PSEUDO_LOCALE_CODE);
    expect(Object.keys(pseudoCatalog.runtime).sort()).toEqual(
      Object.keys(DEFAULT_RUNTIME_MESSAGES).sort()
    );
    expect(Object.keys(pseudoCatalog.runtime).every((key) => !key.startsWith('schema'))).toBe(true);
    expect(pseudoCatalog.static.extName).toContain('Ž');
    expect(pseudoDescription).not.toBe(DEFAULT_STATIC_MESSAGES.extDescription);
    expect(pseudoDescription).toMatch(/^\[.+·\d+\]$/);
    expect(Array.from(pseudoDescription).some((char) => char.charCodeAt(0) > 127)).toBe(true);
  });

  it('tracks schema-only runtime keys as a dedicated catalog subset', () => {
    expect(SCHEMA_MESSAGE_KEYS.length).toBeGreaterThan(0);
    expect(SCHEMA_MESSAGE_KEYS.every((key) => key.startsWith('schema'))).toBe(true);
    expect(SCHEMA_MESSAGE_KEYS.every((key) => RUNTIME_MESSAGE_KEYS.includes(key))).toBe(true);
    expect(isSchemaMessageKey('schemaOverviewTitle')).toBe(true);
    expect(isSchemaMessageKey('schemaRuntimeUiGroupTitle')).toBe(true);
    expect(isSchemaMessageKey('schemaStorageConnectionNotRun')).toBe(true);
    expect(isSchemaMessageKey('schemaStorageVaultEnabledColumnLabel')).toBe(true);
    expect(isSchemaMessageKey('schemaStorageCertificateDownloadTrustLink')).toBe(true);
    expect(isSchemaMessageKey('schemaRuntimeSurfaceSaveToLabel')).toBe(true);
    expect(isSchemaMessageKey('settingsTitle')).toBe(false);
  });

  it('validates minimal catalog schema shapes', () => {
    const validCatalog = {
      language: 'en',
      runtime: {
        extensionName: 'Zendio',
        settingsTitle: 'Settings'
      },
      static: {
        extName: 'Zendio',
        extDescription: 'Export to Obsidian'
      },
      domains: {
        common: ['settingsTitle'],
        extension: ['extensionName']
      }
    };

    expect(isCatalogDomainGroups(validCatalog.domains)).toBe(true);
    expect(isCatalogLocaleCatalog(validCatalog)).toBe(true);
    expect(isCatalogSchema(validCatalog)).toBe(true);
    expect(
      isCatalogLocaleCatalog({
        ...validCatalog,
        static: {
          extName: 'Zendio',
          extDescription: 1
        }
      })
    ).toBe(false);
    expect(isCatalogSchema({ runtime: {} })).toBe(false);
  });

  it('keeps a dedicated small dynamic-template catalog for release languages', () => {
    expect(Object.keys(DYNAMIC_MESSAGE_TEMPLATES)).toEqual(RELEASE_LANGUAGE_ORDER);

    for (const language of RELEASE_LANGUAGE_ORDER) {
      const templates = DYNAMIC_MESSAGE_TEMPLATES[language];
      expect(Object.keys(templates).sort()).toEqual([...DYNAMIC_MESSAGE_KEYS].sort());
      expect(templates.httpsUrlHint).toContain('{httpsPort}');
      expect(templates.httpUrlHint).toContain('{httpPort}');
      expect(templates.vaultNamePlaceholder).toBe('{vault}');
    }
  });
});
