import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';
import {
  canonicalArtifactJson,
  consumeVerifiedFirefoxArtifactBinding,
  createFirefoxReleaseArtifactManifest,
  verifyFirefoxReleaseArtifactManifest
} from '../../../scripts/utils/firefoxReleaseArtifactManifest.mjs';
import {
  STANDALONE_SYNTHETIC_CONFIG,
  validateReleasePublicBuildConfig
} from '../../../scripts/utils/releasePublicBuildConfig.mjs';

const roots: string[] = [];
const prepareScriptPath = fileURLToPath(
  new URL('../../../scripts/prepare-firefox-release.mjs', import.meta.url)
);

type FixtureOptions = {
  extraDistMember?: { path: string; content: string };
  authorization?: Record<string, unknown>;
  configMode?: 'standalone-synthetic' | 'owner-public-vars';
};

function createAttachedAuthorization(releaseSha = 'a'.repeat(40)) {
  const provenance = {
    schema: 'zendio-ci-provenance-v1',
    releaseSha,
    workflowRunId: 123
  };
  return {
    authorizationMode: 'attached-ci-provenance-v1',
    provenance,
    provenanceRelativePath: 'ci-provenance.json',
    provenanceSha256: createHash('sha256').update(canonicalArtifactJson(provenance)).digest('hex'),
    releaseEligible: false
  };
}

function fixtureIdentity(configMode: 'standalone-synthetic' | 'owner-public-vars') {
  const raw = {
    ZENDIO_GA_MEASUREMENT_ID:
      configMode === 'standalone-synthetic'
        ? STANDALONE_SYNTHETIC_CONFIG.measurementId
        : 'G-OWNERPUBLIC1',
    ZENDIO_GA_PROXY_ENDPOINT:
      configMode === 'standalone-synthetic'
        ? STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint
        : 'https://analytics.example.com/collect',
    ZENDIO_GA_TRANSPORT_MODE: 'proxy'
  };
  const publicConfig = validateReleasePublicBuildConfig({ configMode, environment: raw });
  const version = publicConfig.policy.sentry.release;
  return {
    git: { head: 'a'.repeat(40), tree: 'b'.repeat(40) },
    packageMetadata: {
      version,
      manifestVersion: version,
      geckoId: 'fixture@example.test'
    },
    toolchain: {
      node: 'v20.20.2',
      npm: '10.8.2',
      webExt: '10.4.0',
      lockSha256: publicConfig.esbuild.lockSha256,
      esbuild: publicConfig.esbuild
    },
    gaConfig: {
      raw,
      fingerprints: publicConfig.rawFingerprints,
      aggregateSha256: publicConfig.fingerprint
    },
    buildEnvironment: {
      policy: 'release-build-env-v1',
      policyDigest: publicConfig.policyDigest,
      defaults: publicConfig.policy,
      configMode
    }
  };
}

function expectPrepareFailure(args: string[], message: string): void {
  const result = spawnSync(process.execPath, [prepareScriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(message);
}

async function createFixture(options: FixtureOptions = {}) {
  const { extraDistMember, authorization, configMode = 'standalone-synthetic' } = options;
  const root = await mkdtemp(join(tmpdir(), 'zendio-firefox-release-manifest-'));
  roots.push(root);
  const releaseDir = join(root, 'release');
  const distDir = join(root, 'dist');
  const sourceDir = join(root, 'source');
  const identity = fixtureIdentity(configMode);
  await mkdir(releaseDir, { mode: 0o700 });
  await mkdir(distDir, { mode: 0o700 });
  await mkdir(sourceDir, { mode: 0o700 });
  const extensionManifest = `${JSON.stringify({
    name: 'fixture',
    version: identity.packageMetadata.version,
    browser_specific_settings: { gecko: { id: 'fixture@example.test' } }
  })}\n`;
  await writeFile(join(distDir, 'manifest.json'), extensionManifest);
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
      { path: 'manifest.json', content: extensionManifest },
      { path: 'runtime.js', content: 'console.log("fixture");\n' }
    ])
  );
  await writeFile(
    sourceArchivePath,
    buildZipFixture([{ path: 'README.md', content: '# Source\n' }])
  );
  await chmod(xpiPath, 0o600);
  await chmod(sourceArchivePath, 0o600);
  if (authorization?.authorizationMode === 'attached-ci-provenance-v1') {
    await writeFile(
      join(releaseDir, 'ci-provenance.json'),
      canonicalArtifactJson(authorization.provenance),
      { mode: 0o600 }
    );
  }
  const manifest = await createFirefoxReleaseArtifactManifest({
    releaseDir,
    distDir,
    xpiPath,
    sourceArchivePath,
    ...identity,
    authorization
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  await writeFile(manifestPath, canonicalArtifactJson(manifest), { mode: 0o600 });
  return { root, releaseDir, manifestPath, manifest };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Firefox release artifact manifest', () => {
  it('compares the XPI with the packaged dist inventory rather than omitted build metadata', async () => {
    const fixture = await createFixture();
    expect(fixture.releaseDir).toContain('release');
  });

  it('still rejects a non-ignored dist member that is absent from the XPI', async () => {
    await expect(
      createFixture({ extraDistMember: { path: 'unexpected.txt', content: 'not packaged\n' } })
    ).rejects.toThrow('FIREFOX_RELEASE_XPI_DIST_MISMATCH');
  });

  it('keeps standalone artifacts explicitly unproven', async () => {
    const fixture = await createFixture();
    expect(fixture.manifest.authorization).toEqual({
      authorizationMode: 'standalone-unproven',
      provenance: null,
      releaseEligible: false
    });
  });

  it('binds one attached canonical CI provenance record without claiming eligibility', async () => {
    const authorization = createAttachedAuthorization();
    const fixture = await createFixture({ authorization, configMode: 'owner-public-vars' });
    expect(fixture.manifest.authorization).toEqual(authorization);

    await expect(
      verifyFirefoxReleaseArtifactManifest({
        manifestPath: fixture.manifestPath,
        transportMode: 'local-private-v1',
        expectedAttemptRoot: fixture.root
      })
    ).resolves.toMatchObject({ geckoId: 'fixture@example.test' });
  });

  it('rejects attached provenance that is not bound to the release SHA or claims eligibility', async () => {
    await expect(
      createFixture({
        authorization: createAttachedAuthorization('c'.repeat(40)),
        configMode: 'owner-public-vars'
      })
    ).rejects.toThrow('FIREFOX_RELEASE_AUTHORIZATION_INVALID');
    await expect(
      createFixture({
        authorization: { ...createAttachedAuthorization(), releaseEligible: true },
        configMode: 'owner-public-vars'
      })
    ).rejects.toThrow('FIREFOX_RELEASE_AUTHORIZATION_INVALID');
  });

  it('enforces the config and authorization cross-product in create and verify helpers', async () => {
    await expect(
      createFixture({
        authorization: createAttachedAuthorization(),
        configMode: 'standalone-synthetic'
      })
    ).rejects.toThrow('FIREFOX_RELEASE_AUTHORIZATION_MODE');
    await expect(createFixture({ configMode: 'owner-public-vars' })).rejects.toThrow(
      'FIREFOX_RELEASE_AUTHORIZATION_MODE'
    );

    const standalone = await createFixture();
    const standaloneManifest = await readFile(standalone.manifestPath, 'utf8');
    await writeFile(
      standalone.manifestPath,
      standaloneManifest.replace(
        '"configMode": "standalone-synthetic"',
        '"configMode": "owner-public-vars"'
      )
    );
    await expect(
      verifyFirefoxReleaseArtifactManifest({
        manifestPath: standalone.manifestPath,
        transportMode: 'local-private-v1',
        expectedAttemptRoot: standalone.root
      })
    ).rejects.toThrow('FIREFOX_RELEASE_AUTHORIZATION_MODE');

    const attached = await createFixture({
      authorization: createAttachedAuthorization(),
      configMode: 'owner-public-vars'
    });
    const attachedManifest = await readFile(attached.manifestPath, 'utf8');
    await writeFile(
      attached.manifestPath,
      attachedManifest.replace(
        '"configMode": "owner-public-vars"',
        '"configMode": "standalone-synthetic"'
      )
    );
    await expect(
      verifyFirefoxReleaseArtifactManifest({
        manifestPath: attached.manifestPath,
        transportMode: 'local-private-v1',
        expectedAttemptRoot: attached.root
      })
    ).rejects.toThrow('FIREFOX_RELEASE_AUTHORIZATION_MODE');
  });

  it('rejects invalid config and authorization cross-products before publication', () => {
    const baseArgs = [
      '--transport-mode',
      'local-private-v1',
      '--attempt-root',
      '/tmp/firefox-prepare-contract',
      '--dist-dir',
      '/tmp/firefox-prepare-contract/dist',
      '--release-dir',
      '/tmp/firefox-prepare-contract/release',
      '--result-json',
      '/tmp/firefox-prepare-contract/result.json'
    ];

    expectPrepareFailure(
      ['--config-mode', 'owner-public-vars', ...baseArgs],
      'FIREFOX_RELEASE_AUTHORIZATION_MODE'
    );
    expectPrepareFailure(
      [
        '--config-mode',
        'standalone-synthetic',
        ...baseArgs,
        '--authorization-record',
        '/tmp/firefox-prepare-contract/authorization.json'
      ],
      'FIREFOX_RELEASE_AUTHORIZATION_MODE'
    );
    expectPrepareFailure(
      [
        '--config-mode',
        'owner-public-vars',
        ...baseArgs,
        '--authorization-record',
        '/tmp/firefox-prepare-contract/authorization.json',
        '--authorization-record',
        '/tmp/firefox-prepare-contract/second.json'
      ],
      'FIREFOX_RELEASE_ARGUMENT_CONTRACT'
    );
  });

  it('rejects a malformed owner authorization record before creating release output', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'zendio-firefox-prepare-auth-')));
    roots.push(root);
    const authorizationPath = join(root, 'authorization.json');
    await writeFile(authorizationPath, '{}\n', { mode: 0o600 });
    const releaseDir = join(root, 'release');

    expectPrepareFailure(
      [
        '--config-mode',
        'owner-public-vars',
        '--transport-mode',
        'local-private-v1',
        '--attempt-root',
        root,
        '--dist-dir',
        join(root, 'dist'),
        '--release-dir',
        releaseDir,
        '--authorization-record',
        authorizationPath,
        '--result-json',
        join(root, 'result.json')
      ],
      'FIREFOX_RELEASE_AUTHORIZATION_INVALID'
    );
    await expect(lstat(releaseDir)).rejects.toMatchObject({ code: 'ENOENT' });
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
