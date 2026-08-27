import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createUnsignedXpi,
  prepareFirefoxReleasePackage,
  validateFirefoxExtension
} from '../../../scripts/package-firefox.mjs';
import { applyRestHostPermissions } from '../../../scripts/utils/manifestHosts.mjs';
import { createBrowserManifest } from '../../../scripts/utils/manifestSources.mjs';

const tempRoots: string[] = [];
const RELEASE_DISPLAY_NAME = 'Zendio-All in Obsidian';
const RELEASE_ARTIFACT_BASE_NAME = `${RELEASE_DISPLAY_NAME}-v0.2.0`;

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zendio-package-firefox-test-'));
  tempRoots.push(root);
  return root;
}

async function createStaticDist(root: string) {
  const distDir = join(root, 'dist');
  await mkdir(join(distDir, 'background'), { recursive: true });
  const manifest = applyRestHostPermissions(createBrowserManifest('firefox'));
  await writeFile(join(distDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(distDir, 'background/index.js'), 'console.log("background");\n');
  return { distDir, manifest };
}

describe('Firefox package audit', () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
    );
  });

  it('accepts the repository-owned Firefox manifest and required release entrypoint', async () => {
    const root = await createTempRoot();
    const { distDir, manifest } = await createStaticDist(root);
    const logger = { log: vi.fn() };

    await expect(validateFirefoxExtension(distDir, { logger })).resolves.toEqual(manifest);
    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      '🔎 正在运行 Firefox repository manifest/static checks...'
    );
    expect(logger.log).toHaveBeenLastCalledWith(
      '✅ Firefox repository manifest/static checks passed'
    );
  });

  it('rejects a built Firefox manifest that drifts from the repository source', async () => {
    const root = await createTempRoot();
    const { distDir, manifest } = await createStaticDist(root);
    await writeFile(
      join(distDir, 'manifest.json'),
      `${JSON.stringify({ ...manifest, background: { service_worker: 'background/index.js' } })}\n`
    );
    await expect(validateFirefoxExtension(distDir)).rejects.toThrow(
      'FIREFOX_STATIC_MANIFEST_DRIFT'
    );
  });

  it('rejects a Firefox package whose required background entrypoint is absent', async () => {
    const root = await createTempRoot();
    const { distDir } = await createStaticDist(root);
    await rm(join(distDir, 'background/index.js'));
    await expect(validateFirefoxExtension(distDir)).rejects.toThrow(
      'FIREFOX_STATIC_RELEASE_CONTRACT'
    );
  });

  it('runs static validation before creating and auditing the unsigned XPI', async () => {
    const root = await createTempRoot();
    const distDir = join(root, 'dist');
    await mkdir(distDir);
    await writeFile(
      join(distDir, 'manifest.json'),
      JSON.stringify({ name: '__MSG_extensionName__', version: '0.2.0' })
    );
    const steps: string[] = [];
    const validateFirefoxExtensionImpl = vi.fn(() => {
      steps.push('validate');
      return Promise.resolve();
    });
    const createUnsignedXpiImpl = vi.fn(() => {
      steps.push('xpi');
      return Promise.resolve({
        xpiName: `${RELEASE_ARTIFACT_BASE_NAME}.xpi`,
        outputPath: join(root, `${RELEASE_ARTIFACT_BASE_NAME}.xpi`),
        artifactBaseName: RELEASE_ARTIFACT_BASE_NAME
      });
    });
    const auditReleaseArchiveImpl = vi.fn(() => {
      steps.push('audit');
      return Promise.resolve();
    });

    const result = await prepareFirefoxReleasePackage(
      { distDir },
      {
        auditReleaseArchiveImpl,
        createUnsignedXpiImpl,
        validateFirefoxExtensionImpl,
        logger: { log: vi.fn() },
        prepareLicenseArtifactsImpl: vi.fn(() => {
          steps.push('prepare');
          return Promise.resolve();
        }),
        resolveMessageImpl: vi.fn(() => Promise.resolve(RELEASE_DISPLAY_NAME))
      }
    );

    expect(steps).toEqual(['prepare', 'validate', 'xpi', 'audit']);
    expect(validateFirefoxExtensionImpl).toHaveBeenCalledWith(distDir);
    expect(createUnsignedXpiImpl).toHaveBeenCalledWith(distDir, RELEASE_DISPLAY_NAME, '0.2.0');
    expect(auditReleaseArchiveImpl).toHaveBeenCalledWith(
      join(root, `${RELEASE_ARTIFACT_BASE_NAME}.xpi`)
    );
    expect(result).toMatchObject({
      artifactBaseName: RELEASE_ARTIFACT_BASE_NAME,
      resolvedName: RELEASE_DISPLAY_NAME,
      version: '0.2.0',
      xpiName: `${RELEASE_ARTIFACT_BASE_NAME}.xpi`
    });
  });

  it('publishes a release XPI without replacing an existing final target', async () => {
    const root = await createTempRoot();
    const distDir = join(root, 'dist');
    const outputDir = join(root, 'release');
    const workDir = join(root, '.release.work');
    await mkdir(distDir);
    await mkdir(outputDir);
    await mkdir(workDir);
    await writeFile(join(distDir, 'manifest.json'), '{}\n');

    const first = await createUnsignedXpi(distDir, RELEASE_DISPLAY_NAME, '0.2.0', {
      publication: { mode: 'release-no-replace-v1', outputDir, workDir }
    });

    await expect(readFile(first.outputPath)).resolves.toBeInstanceOf(Buffer);
    await expect(
      createUnsignedXpi(distDir, RELEASE_DISPLAY_NAME, '0.2.0', {
        publication: { mode: 'release-no-replace-v1', outputDir, workDir }
      })
    ).rejects.toThrow('FIREFOX_RELEASE_TARGET_EXISTS');
  });
});
