import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';

const scriptPath = resolve('tools/audit-release-archive.mjs');

function writeZipArchive(
  root: string,
  relativePath: string,
  entries: Record<string, string>
): string {
  const archivePath = join(root, relativePath);
  writeFileSync(
    archivePath,
    buildZipFixture(Object.entries(entries).map(([path, content]) => ({ path, content })))
  );
  return archivePath;
}

function baseArchiveEntries(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'manifest.json': JSON.stringify({
      manifest_version: 3,
      name: 'Fixture',
      version: '1.0.0',
      default_locale: 'en',
      action: {
        default_icon: {
          16: 'icons/icon-16.png'
        }
      },
      icons: {
        16: 'icons/icon-16.png'
      },
      background: {
        service_worker: 'background/index.js'
      },
      options_ui: {
        page: 'options/index.html'
      }
    }),
    '_locales/en/messages.json': '{}',
    'background/index.js': '',
    'icons/icon-16.png': '',
    'options/index.html': '',
    ...extra
  };
}

function runAudit(archivePath: string) {
  return spawnSync(process.execPath, [scriptPath, '--archive', archivePath], {
    encoding: 'utf8'
  });
}

describe('release archive audit', () => {
  it('can be imported when process.argv[1] is undefined', async () => {
    const originalArgv = [...process.argv];
    process.argv.splice(1);

    try {
      await expect(
        import(`${pathToFileURL(scriptPath).href}?argv-undefined=${Date.now()}`)
      ).resolves.toHaveProperty('auditReleaseArchive');
    } finally {
      process.argv.splice(0, process.argv.length, ...originalArgv);
    }
  });

  it('passes a clean packaged archive after extracting it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiiinob-release-archive-test-'));
    const archive = writeZipArchive(dir, 'clean.zip', baseArchiveEntries());

    try {
      const result = runAudit(archive);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Audited extracted archive');
      expect(result.stdout).toContain('Forbidden Dev/Test Pseudo-Locale Members');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when the packaged archive contains qps-ploc members or chunks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiiinob-release-archive-test-'));
    const archive = writeZipArchive(
      dir,
      'dirty.xpi',
      baseArchiveEntries({
        '_locales/qps-ploc/messages.json': '{}',
        'chunks/qps-ploc-fixture.js': ''
      })
    );

    try {
      const result = runAudit(archive);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('_locales/qps-ploc/messages.json');
      expect(result.stdout + result.stderr).toContain('chunks/qps-ploc-fixture.js');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
