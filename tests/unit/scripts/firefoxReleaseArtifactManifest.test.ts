import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';
import {
  canonicalArtifactJson,
  consumeVerifiedFirefoxArtifactBinding,
  createFirefoxReleaseArtifactManifest,
  verifyFirefoxReleaseArtifactManifest
} from '../../../scripts/utils/firefoxReleaseArtifactManifest.mjs';

const roots: string[] = [];

async function createFixture(extraDistMember: { path: string; content: string } | null = null) {
  const root = await mkdtemp(join(tmpdir(), 'zendio-firefox-release-manifest-'));
  roots.push(root);
  const releaseDir = join(root, 'release');
  const distDir = join(root, 'dist');
  const sourceDir = join(root, 'source');
  await mkdir(releaseDir, { mode: 0o700 });
  await mkdir(distDir, { mode: 0o700 });
  await mkdir(sourceDir, { mode: 0o700 });
  await writeFile(join(distDir, 'manifest.json'), '{"name":"fixture"}\n');
  await writeFile(join(distDir, 'runtime.js'), 'console.log("fixture");\n');
  await writeFile(join(distDir, 'runtime.js.map'), '{"version":3}\n');
  await writeFile(join(distDir, '.DS_Store'), 'ignored metadata');
  if (extraDistMember) {
    await writeFile(join(distDir, extraDistMember.path), extraDistMember.content);
  }
  await writeFile(join(sourceDir, 'README.md'), '# Source\n');
  const xpiPath = join(releaseDir, 'fixture.xpi');
  const sourceArchivePath = join(releaseDir, 'fixture-source.zip');
  await writeFile(
    xpiPath,
    buildZipFixture([
      { path: 'manifest.json', content: '{"name":"fixture"}\n' },
      { path: 'runtime.js', content: 'console.log("fixture");\n' }
    ])
  );
  await writeFile(
    sourceArchivePath,
    buildZipFixture([{ path: 'README.md', content: '# Source\n' }])
  );
  await chmod(xpiPath, 0o600);
  await chmod(sourceArchivePath, 0o600);
  const manifest = await createFirefoxReleaseArtifactManifest({
    releaseDir,
    distDir,
    xpiPath,
    sourceArchivePath,
    git: { head: 'a'.repeat(40), tree: 'b'.repeat(40) },
    packageMetadata: {
      version: '1.0.0',
      manifestVersion: '1.0.0',
      geckoId: 'fixture@example.test'
    },
    toolchain: { node: 'v20.20.2', npm: '10.8.2', webExt: '10.4.0', lockSha256: 'c'.repeat(64) },
    gaConfig: { digest: 'd'.repeat(64) },
    buildEnvironment: { policy: 'release-build-env-v1' }
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  await writeFile(manifestPath, canonicalArtifactJson(manifest), { mode: 0o600 });
  return { root, releaseDir, manifestPath };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Firefox release artifact manifest', () => {
  it('compares the XPI with the packaged dist inventory rather than omitted build metadata', async () => {
    await expect(createFixture()).resolves.toMatchObject({
      releaseDir: expect.stringContaining('release')
    });
  });

  it('still rejects a non-ignored dist member that is absent from the XPI', async () => {
    await expect(
      createFixture({ path: 'unexpected.txt', content: 'not packaged\n' })
    ).rejects.toThrow('FIREFOX_RELEASE_XPI_DIST_MISMATCH');
  });

  it('verifies the portable inventory and mints a single-use identity capability', async () => {
    const fixture = await createFixture();
    const binding = await verifyFirefoxReleaseArtifactManifest({
      manifestPath: fixture.manifestPath,
      transportMode: 'local-private-v1',
      expectedAttemptRoot: fixture.root
    });

    expect(binding.geckoId).toBe('fixture@example.test');
    expect(binding.sourceArchivePath).toContain('fixture-source.zip');
    expect(() => consumeVerifiedFirefoxArtifactBinding({ ...binding }, 'local-private-v1')).toThrow(
      'FIREFOX_RELEASE_BINDING_INVALID'
    );
    expect(consumeVerifiedFirefoxArtifactBinding(binding, 'local-private-v1').xpiPath).toContain(
      'fixture.xpi'
    );
    expect(() => consumeVerifiedFirefoxArtifactBinding(binding, 'local-private-v1')).toThrow(
      'FIREFOX_RELEASE_BINDING_CONSUMED'
    );
  });

  it('rejects duplicate artifact roles before minting a capability', async () => {
    const fixture = await createFixture();
    const manifest = await readFile(fixture.manifestPath, 'utf8');
    const duplicateRoles = manifest.replace('"role": "amo-source"', '"role": "unsigned-xpi"');
    expect(duplicateRoles).not.toBe(manifest);
    await writeFile(fixture.manifestPath, duplicateRoles);

    await expect(
      verifyFirefoxReleaseArtifactManifest({
        manifestPath: fixture.manifestPath,
        transportMode: 'local-private-v1',
        expectedAttemptRoot: fixture.root
      })
    ).rejects.toThrow('FIREFOX_RELEASE_MEMBER_ROLE_SET');
  });

  it('rejects an extra release-directory member before minting a capability', async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.releaseDir, 'extra.txt'), 'extra', { mode: 0o600 });

    await expect(
      verifyFirefoxReleaseArtifactManifest({
        manifestPath: fixture.manifestPath,
        transportMode: 'local-private-v1',
        expectedAttemptRoot: fixture.root
      })
    ).rejects.toThrow('FIREFOX_RELEASE_DIRECTORY_ROSTER');
  });
});
