import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import prettier from 'prettier';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeMessageKey } from '../../../src/i18n/catalog/keys';
import type { CatalogLocaleCatalog } from '../../../src/i18n/catalog/schema';
import {
  buildGeneratedArtifacts,
  diffGeneratedArtifacts
} from '../../../tools/i18n/generatedArtifacts';
import { compileCatalog } from '../../../tools/i18n/compileCatalog';

function createLocaleCatalog(
  language: string,
  runtime: Record<string, string>,
  staticMessages?: Record<string, string>
): CatalogLocaleCatalog {
  return {
    language: language as CatalogLocaleCatalog['language'],
    runtime: runtime as CatalogLocaleCatalog['runtime'],
    static: (staticMessages ?? {
      extName: `${language} extension`,
      extDescription: `${language} description`
    }) as CatalogLocaleCatalog['static']
  };
}

function runtimeKeys<const Keys extends RuntimeMessageKey[]>(...keys: Keys): Keys {
  return keys;
}

function writeArtifacts(rootDir: string, artifacts: Map<string, string>): void {
  for (const [relativePath, content] of artifacts) {
    const filePath = join(rootDir, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }
}

describe('i18n generated artifact drift checks', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('reports no drift when generated files already match', async () => {
    const compiled = compileCatalog(
      [
        createLocaleCatalog('en', {
          extensionName: 'Alpha'
        }),
        createLocaleCatalog('de', {
          extensionName: 'Alpha'
        })
      ],
      {
        expectedKeys: runtimeKeys('extensionName'),
        releaseLanguageOrder: ['en', 'de']
      }
    );

    const rootDir = mkdtempSync(join(tmpdir(), 'aiiinob-i18n-catalog-'));
    tempRoots.push(rootDir);

    const artifacts = await buildGeneratedArtifacts(compiled);
    writeArtifacts(rootDir, artifacts);

    expect(diffGeneratedArtifacts(rootDir, artifacts)).toEqual([]);
  });

  it('reports drift when a generated file differs from the compiled output', async () => {
    const compiled = compileCatalog(
      [
        createLocaleCatalog('en', {
          extensionName: 'Alpha'
        }),
        createLocaleCatalog('de', {
          extensionName: 'Alpha'
        })
      ],
      {
        expectedKeys: runtimeKeys('extensionName'),
        releaseLanguageOrder: ['en', 'de']
      }
    );

    const rootDir = mkdtempSync(join(tmpdir(), 'aiiinob-i18n-catalog-'));
    tempRoots.push(rootDir);

    const artifacts = await buildGeneratedArtifacts(compiled);
    writeArtifacts(rootDir, artifacts);

    const [messagesFile] = [...artifacts.keys()];
    const driftedFile = join(rootDir, messagesFile);
    writeFileSync(driftedFile, `${readFileSync(driftedFile, 'utf8')}\n// drift\n`, 'utf8');

    expect(diffGeneratedArtifacts(rootDir, artifacts)).toEqual([
      { path: messagesFile, reason: 'content-mismatch' }
    ]);
  });

  it('emits generated artifacts that are already prettier-stable', async () => {
    const compiled = compileCatalog(
      [
        createLocaleCatalog('en', {
          extensionName: 'Alpha',
          settingsTitle: 'Settings'
        }),
        createLocaleCatalog('de', {
          extensionName: 'Alpha',
          settingsTitle: 'Einstellungen'
        })
      ],
      {
        expectedKeys: runtimeKeys('extensionName', 'settingsTitle'),
        releaseLanguageOrder: ['en', 'de']
      }
    );

    const artifacts = await buildGeneratedArtifacts(compiled);

    for (const [relativePath, content] of artifacts) {
      const filePath = resolve(process.cwd(), relativePath);
      const prettierOptions = await prettier.resolveConfig(filePath);
      const formattedContent = await prettier.format(content, {
        ...prettierOptions,
        filepath: filePath
      });

      expect(content).toBe(formattedContent);
    }
  });

  it('emits WebExtension locale artifacts when static catalog messages are present', async () => {
    const compiled = compileCatalog(
      [
        createLocaleCatalog(
          'en',
          {
            extensionName: 'Alpha'
          },
          {
            extName: 'Alpha',
            extDescription: 'English description'
          }
        ),
        createLocaleCatalog(
          'de',
          {
            extensionName: 'Alpha'
          },
          {
            extName: 'Alpha',
            extDescription: 'Deutsche Beschreibung'
          }
        )
      ],
      {
        expectedKeys: runtimeKeys('extensionName'),
        releaseLanguageOrder: ['en', 'de']
      }
    );

    const artifacts = await buildGeneratedArtifacts(compiled);

    expect(artifacts.get('public/_locales/en/messages.json')).toBe(
      `${JSON.stringify(
        {
          extName: { message: 'Alpha' },
          extDescription: { message: 'English description' }
        },
        null,
        2
      )}\n`
    );
    expect(artifacts.get('public/_locales/de/messages.json')).toBe(
      `${JSON.stringify(
        {
          extName: { message: 'Alpha' },
          extDescription: { message: 'Deutsche Beschreibung' }
        },
        null,
        2
      )}\n`
    );
  });

  it('emits generated schema message artifacts when schema catalogs are present', async () => {
    const runtimeCompiled = compileCatalog(
      [
        createLocaleCatalog('en', {
          extensionName: 'Alpha'
        }),
        createLocaleCatalog('de', {
          extensionName: 'Alpha'
        })
      ],
      {
        expectedKeys: runtimeKeys('extensionName'),
        releaseLanguageOrder: ['en', 'de']
      }
    );

    const schemaCompiled = compileCatalog(
      [
        createLocaleCatalog('en', {
          schemaOverviewTitle: 'Overview'
        }),
        createLocaleCatalog('de', {
          schemaOverviewTitle: 'Uebersicht'
        })
      ],
      {
        expectedKeys: runtimeKeys('schemaOverviewTitle'),
        releaseLanguageOrder: ['en', 'de']
      }
    );

    const artifacts = await buildGeneratedArtifacts({
      runtime: runtimeCompiled,
      schema: schemaCompiled
    });

    const schemaArtifact = artifacts.get('src/i18n/generated/schemaMessages.generated.ts');
    expect(schemaArtifact).toContain(
      'export const schemaShellMessagesEn = GENERATED_RELEASE_SCHEMA_MESSAGES_EN;'
    );
    expect(schemaArtifact).toContain(
      'export const schemaShellMessagesDe = GENERATED_RELEASE_SCHEMA_MESSAGES_DE;'
    );
    expect(schemaArtifact).toContain("schemaOverviewTitle: 'Overview'");
  });
});
