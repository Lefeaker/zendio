import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

  it('reports no drift when generated files already match', () => {
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

    const artifacts = buildGeneratedArtifacts(compiled);
    writeArtifacts(rootDir, artifacts);

    expect(diffGeneratedArtifacts(rootDir, artifacts)).toEqual([]);
  });

  it('reports drift when a generated file differs from the compiled output', () => {
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

    const artifacts = buildGeneratedArtifacts(compiled);
    writeArtifacts(rootDir, artifacts);

    const [messagesFile] = [...artifacts.keys()];
    const driftedFile = join(rootDir, messagesFile);
    writeFileSync(driftedFile, `${readFileSync(driftedFile, 'utf8')}\n// drift\n`, 'utf8');

    expect(diffGeneratedArtifacts(rootDir, artifacts)).toEqual([
      { path: messagesFile, reason: 'content-mismatch' }
    ]);
  });
});
