import { describe, expect, it } from 'vitest';
import type { RuntimeMessageKey } from '../../../src/i18n/catalog/keys';
import type { CatalogLocaleCatalog } from '../../../src/i18n/catalog/schema';
import { compileCatalog } from '../../../tools/i18n/compileCatalog';
import { emitGeneratedLocales } from '../../../tools/i18n/emitGeneratedLocales';
import { emitGeneratedTypes } from '../../../tools/i18n/emitGeneratedTypes';

function createLocaleCatalog(
  language: string,
  runtime: Record<string, string>
): CatalogLocaleCatalog {
  return {
    language: language as CatalogLocaleCatalog['language'],
    runtime: runtime as CatalogLocaleCatalog['runtime']
  };
}

function runtimeKeys<const Keys extends RuntimeMessageKey[]>(...keys: Keys): Keys {
  return keys;
}

describe('i18n catalog compiler', () => {
  it('rejects missing runtime keys', () => {
    const input = [
      createLocaleCatalog('en', {
        extensionName: 'Alpha',
        settingsTitle: 'Beta'
      }),
      createLocaleCatalog('de', {
        extensionName: 'Alpha'
      })
    ];

    expect(() =>
      compileCatalog(input, {
        expectedKeys: runtimeKeys('extensionName', 'settingsTitle'),
        releaseLanguageOrder: ['en', 'de']
      })
    ).toThrowError(/de.*missing runtime keys.*settingsTitle/i);
  });

  it('rejects extra runtime keys unless explicitly allowed', () => {
    const input = [
      createLocaleCatalog('en', {
        extensionName: 'Alpha'
      }),
      createLocaleCatalog('de', {
        extensionName: 'Alpha',
        languageLabel: 'Legacy only'
      })
    ];

    expect(() =>
      compileCatalog(input, {
        expectedKeys: runtimeKeys('extensionName'),
        releaseLanguageOrder: ['en', 'de']
      })
    ).toThrowError(/de.*extra runtime keys.*languageLabel/i);

    expect(() =>
      compileCatalog(input, {
        expectedKeys: runtimeKeys('extensionName'),
        allowExtraKeys: ['languageLabel'],
        releaseLanguageOrder: ['en', 'de']
      })
    ).not.toThrow();
  });

  it('detects placeholder mismatch across locales', () => {
    const input = [
      createLocaleCatalog('en', {
        classificationFallbackMessage: 'Hello {name}'
      }),
      createLocaleCatalog('de', {
        classificationFallbackMessage: 'Hallo {person}'
      })
    ];

    expect(() =>
      compileCatalog(input, {
        expectedKeys: runtimeKeys('classificationFallbackMessage'),
        releaseLanguageOrder: ['en', 'de']
      })
    ).toThrowError(/classificationFallbackMessage.*name.*person/i);
  });

  it('preserves ICU plural tokens in generated locale output', () => {
    const pluralMessage = '{count, plural, =0 {No items} one {# item} other {# items}}';
    const compiled = compileCatalog(
      [
        createLocaleCatalog('en', {
          settingsTitle: pluralMessage
        }),
        createLocaleCatalog('de', {
          settingsTitle: '{count, plural, =0 {Keine Eintraege} one {# Eintrag} other {# Eintraege}}'
        })
      ],
      {
        expectedKeys: runtimeKeys('settingsTitle'),
        releaseLanguageOrder: ['en', 'de']
      }
    );

    const emitted = emitGeneratedLocales(compiled);

    expect(emitted).toContain(pluralMessage);
    expect(emitted).toContain("'de'");
  });

  it('emits stable sorted output', () => {
    const first = compileCatalog(
      [
        createLocaleCatalog('de', {
          settingsTitle: 'B',
          extensionName: 'A'
        }),
        createLocaleCatalog('en', {
          settingsTitle: 'B',
          extensionName: 'A'
        })
      ],
      {
        releaseLanguageOrder: ['en', 'de']
      }
    );

    const second = compileCatalog(
      [
        createLocaleCatalog('en', {
          extensionName: 'A',
          settingsTitle: 'B'
        }),
        createLocaleCatalog('de', {
          extensionName: 'A',
          settingsTitle: 'B'
        })
      ],
      {
        releaseLanguageOrder: ['en', 'de']
      }
    );

    expect(first.messageKeys).toEqual(['extensionName', 'settingsTitle']);
    expect(first.localeCodes).toEqual(['en', 'de']);
    expect(emitGeneratedTypes(first)).toBe(emitGeneratedTypes(second));
    expect(emitGeneratedLocales(first)).toBe(emitGeneratedLocales(second));
  });

  it('supports release languages and excludes qps-ploc from release output by default', () => {
    const compiled = compileCatalog(
      [
        createLocaleCatalog('en', {
          extensionName: 'Alpha'
        }),
        createLocaleCatalog('de', {
          extensionName: 'Alpha'
        }),
        createLocaleCatalog('qps-ploc', {
          extensionName: '[Aĺƥĥàː]'
        })
      ],
      {
        expectedKeys: runtimeKeys('extensionName'),
        releaseLanguageOrder: ['en', 'de']
      }
    );

    expect(compiled.localeCodes).toEqual(['en', 'de']);
    expect(compiled.locales['qps-ploc']).toBeUndefined();
  });
});
