import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const PackageLockSchema = z.object({
  version: z.string(),
  packages: z.object({
    '': z.object({
      version: z.string()
    })
  })
});

const VersionedArtifactSchema = z.object({
  version: z.string()
});

const RuntimeCatalogSchema = z.object({
  versionNumber: z.string()
});

function readJsonFile<T>(root: string, relativePath: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(readFileSync(join(root, relativePath), 'utf8')));
}

function writeJson(root: string, relativePath: string, value: JsonValue): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runSync(root: string, args: string[] = []): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    ['scripts/sync-release-metadata.mjs', '--root', root, ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8'
    }
  );
}

describe('sync-release-metadata', () => {
  it('syncs release artifacts from package.json as the version source of truth', () => {
    const root = mkdtempSync(join(tmpdir(), 'zendio-release-metadata-'));

    try {
      writeJson(root, 'package.json', { name: 'zendio', version: '9.8.7' });
      writeJson(root, 'package-lock.json', {
        name: 'zendio',
        version: '0.0.0',
        lockfileVersion: 3,
        packages: {
          '': {
            name: 'zendio',
            version: '0.0.0'
          }
        }
      });
      writeJson(root, 'public/manifest.json', { manifest_version: 3, version: '0.0.0' });
      writeJson(root, 'public/manifest.firefox.json', { manifest_version: 3, version: '0.0.0' });
      writeJson(root, 'src/i18n/catalog/messages/en/runtime.json', {
        extName: 'Zendio',
        versionNumber: 'v0.0.0'
      });

      const failedCheck = runSync(root, ['--check']);
      expect(failedCheck.status).toBe(1);
      expect(failedCheck.stderr).toContain('Release metadata is out of sync');

      const sync = runSync(root);
      expect(sync.status).toBe(0);
      expect(sync.stdout).toContain('Updated release metadata');

      const packageLock = readJsonFile(root, 'package-lock.json', PackageLockSchema);
      const chromeManifest = readJsonFile(root, 'public/manifest.json', VersionedArtifactSchema);
      const firefoxManifest = readJsonFile(
        root,
        'public/manifest.firefox.json',
        VersionedArtifactSchema
      );
      const runtimeCatalog = readJsonFile(
        root,
        'src/i18n/catalog/messages/en/runtime.json',
        RuntimeCatalogSchema
      );

      expect(packageLock.version).toBe('9.8.7');
      expect(packageLock.packages[''].version).toBe('9.8.7');
      expect(chromeManifest.version).toBe('9.8.7');
      expect(firefoxManifest.version).toBe('9.8.7');
      expect(runtimeCatalog.versionNumber).toBe('v9.8.7');
      expect(runSync(root, ['--check']).status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
