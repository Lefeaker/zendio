import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { auditLocalVaultReleaseReadiness } from '../../../scripts/audit-local-vault-release-readiness.mjs';

const tempDirs: string[] = [];

async function createDistFixture(
  manifest: Record<string, unknown>,
  options: {
    runtimeSource?: string;
  } = {}
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aiiinob-local-vault-release-'));
  tempDirs.push(root);
  const dist = join(root, 'dist');

  await mkdir(join(dist, 'offscreen'), { recursive: true });
  await mkdir(join(dist, 'content'), { recursive: true });
  await mkdir(join(dist, 'chunks'), { recursive: true });

  await writeFile(join(dist, 'local-vault-permission.html'), '<!doctype html>');
  await writeFile(join(dist, 'local-vault-permission.js'), 'export {};');
  await writeFile(join(dist, 'offscreen/local-vault.html'), '<!doctype html>');
  await writeFile(join(dist, 'offscreen/local-vault.js'), 'export {};');
  await writeFile(
    join(dist, 'content/runtime.js'),
    options.runtimeSource ?? 'import("../chunks/localVaultPermissionPrompt-test.js");'
  );
  await writeFile(
    join(dist, 'chunks/localVaultPermissionPrompt-test.js'),
    'const path = "local-vault-permission.html"; export { path };'
  );
  await writeFile(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return dist;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Local Vault release readiness audit', () => {
  it('keeps the shipped permission page first paint English-tagged, neutral, and free of Chinese copy', async () => {
    const source = await readFile(
      new URL('../../../public/local-vault-permission.html', import.meta.url),
      'utf8'
    );

    expect(source).toContain('<html lang="en">');
    expect(source).toContain('<title>Zendio</title>');
    expect(source).not.toContain('Local vault permission');
    expect(source).not.toMatch(/\p{Script=Han}/u);
  });

  it('accepts a Chrome build with offscreen permission and scoped WAR matches', async () => {
    const distDir = await createDistFixture({
      permissions: ['storage', 'offscreen'],
      web_accessible_resources: [
        {
          resources: ['chunks/*', 'local-vault-permission.html'],
          matches: ['http://*/*', 'https://*/*']
        }
      ]
    });

    await expect(
      auditLocalVaultReleaseReadiness({ distDir, browser: 'chrome' })
    ).resolves.toMatchObject({
      builtBrowser: 'chrome',
      chromeOffscreenPermission: true,
      firefoxOffscreenPermission: false,
      lazyPromptChunk: 'chunks/localVaultPermissionPrompt-test.js'
    });
  });

  it('rejects Firefox builds that retain the offscreen permission', async () => {
    const distDir = await createDistFixture({
      permissions: ['storage', 'offscreen'],
      web_accessible_resources: [
        {
          resources: ['chunks/*'],
          matches: ['http://*/*']
        }
      ]
    });

    await expect(auditLocalVaultReleaseReadiness({ distDir, browser: 'firefox' })).rejects.toThrow(
      'Expected Firefox build manifest to omit offscreen permission'
    );
  });

  it('rejects builds that expose web accessible resources to all URLs', async () => {
    const distDir = await createDistFixture({
      permissions: ['storage'],
      web_accessible_resources: [
        {
          resources: ['chunks/*'],
          matches: ['<all_urls>']
        }
      ]
    });

    await expect(auditLocalVaultReleaseReadiness({ distDir })).rejects.toThrow(
      'Built manifest web_accessible_resources must not include <all_urls>'
    );
  });

  it('rejects prompt chunks that contain the local vault marker but are not reachable from runtime', async () => {
    const distDir = await createDistFixture(
      {
        permissions: ['storage', 'offscreen'],
        web_accessible_resources: [
          {
            resources: ['chunks/*', 'local-vault-permission.html'],
            matches: ['http://*/*', 'https://*/*']
          }
        ]
      },
      {
        runtimeSource: 'export const runtimeLoaded = true;'
      }
    );

    await expect(auditLocalVaultReleaseReadiness({ distDir, browser: 'chrome' })).rejects.toThrow(
      'Unable to find reachable content/runtime local-vault permission prompt chunk'
    );
  });
});
