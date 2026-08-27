import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';
import {
  assertVerifiedChromeArtifactBinding,
  canonicalReleaseArtifactJson,
  consumeVerifiedChromeArtifactBinding,
  createChromeReleaseArtifactManifest,
  normalizeUploadArtifactDigestOutput,
  parseCanonicalActionArtifactId,
  parseCanonicalRestArtifactId,
  parseRestArtifactDigest,
  verifyChromeReleaseArtifactManifest
} from '../../../scripts/utils/releaseArtifactManifest.mjs';
import { canonicalReleaseProvenanceJson } from '../../../scripts/utils/releaseCiProvenance.mjs';

const roots: string[] = [];
const sha = 'a'.repeat(40);

function provenance() {
  return {
    schema: 'zendio-release-ci-provenance-v1',
    releaseSha: sha,
    workflowPath: '.github/workflows/ci.yml',
    workflowId: 1,
    repositoryId: 2,
    repositoryFullName: 'owner/repo',
    runId: 3,
    runNumber: 4,
    runAttempt: 1,
    headSha: sha,
    event: 'push',
    branch: 'main',
    requiredJobs: ['Package extension'],
    jobs: [{ id: 5, name: 'Package extension', status: 'completed', conclusion: 'success' }]
  };
}

async function fixture(attached = false) {
  const root = await mkdtemp(join(tmpdir(), 'zendio-chrome-artifact-'));
  roots.push(root);
  await chmod(root, 0o700);
  const releaseDir = join(root, 'release');
  const distDir = join(root, 'dist');
  await mkdir(releaseDir, { mode: 0o700 });
  await mkdir(distDir, { mode: 0o700 });
  const zipPath = join(releaseDir, 'fixture.zip');
  await writeFile(zipPath, buildZipFixture([{ path: 'manifest.json', content: '{}\n' }]), {
    mode: 0o600
  });
  const record = provenance();
  const provenancePath = attached ? join(releaseDir, 'ci-provenance.json') : undefined;
  if (provenancePath) {
    await writeFile(provenancePath, canonicalReleaseProvenanceJson(record), { mode: 0o600 });
  }
  const authorization = attached
    ? {
        authorizationMode: 'attached-ci-provenance-v1',
        provenance: record,
        provenanceSha256: await crypto.subtle
          .digest('SHA-256', new TextEncoder().encode(canonicalReleaseProvenanceJson(record)))
          .then((bytes) => Buffer.from(bytes).toString('hex')),
        releaseEligible: false
      }
    : undefined;
  const manifest = await createChromeReleaseArtifactManifest({
    releaseDir,
    distDir,
    zipPath,
    provenancePath,
    repository: { name: 'zendio' },
    git: { head: sha, tree: 'b'.repeat(40) },
    packageMetadata: { version: '0.2.1', manifestVersion: '0.2.1' },
    buildConfig: { configMode: attached ? 'owner-public-vars' : 'standalone-synthetic' },
    authorization
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  await writeFile(manifestPath, canonicalReleaseArtifactJson(manifest), { mode: 0o600 });
  return { root, releaseDir, manifestPath, zipPath, manifest };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Chrome release artifact manifest', () => {
  it.each([false, true])(
    'verifies %s attached provenance and mints an opaque binding',
    async (attached) => {
      const value = await fixture(attached);
      const binding = await verifyChromeReleaseArtifactManifest({
        manifestPath: value.manifestPath,
        transportMode: 'local-private-v1',
        expectedAttemptRoot: value.root
      });
      expect(binding.zipPath).toBe(value.zipPath);
      expect(() => assertVerifiedChromeArtifactBinding({ ...binding })).toThrow(
        'RELEASE_ARTIFACT_BINDING_INVALID'
      );
      expect(
        consumeVerifiedChromeArtifactBinding(binding, 'local-private-v1').zipBytes.length
      ).toBeGreaterThan(0);
      expect(() => consumeVerifiedChromeArtifactBinding(binding, 'local-private-v1')).toThrow(
        'RELEASE_ARTIFACT_BINDING_INVALID'
      );
    }
  );

  it('enforces config and authorization cross-products without the CLI', async () => {
    const value = await fixture();
    await expect(
      createChromeReleaseArtifactManifest({
        releaseDir: value.releaseDir,
        distDir: join(value.root, 'dist'),
        zipPath: value.zipPath,
        repository: { name: 'zendio' },
        git: { head: sha, tree: 'b'.repeat(40) },
        packageMetadata: { version: '0.2.1' },
        buildConfig: { configMode: 'owner-public-vars' }
      })
    ).rejects.toThrow('RELEASE_AUTHORIZATION_MODE_INVALID');
    const bytes = await readFile(value.manifestPath, 'utf8');
    await writeFile(
      value.manifestPath,
      bytes.replace('"configMode": "standalone-synthetic"', '"configMode": "owner-public-vars"')
    );
    await expect(
      verifyChromeReleaseArtifactManifest({
        manifestPath: value.manifestPath,
        transportMode: 'local-private-v1',
        expectedAttemptRoot: value.root
      })
    ).rejects.toThrow('RELEASE_AUTHORIZATION_MODE_INVALID');
  });

  it('accepts only canonical Action and REST artifact identities', () => {
    const digest = 'c'.repeat(64);
    expect(normalizeUploadArtifactDigestOutput(digest)).toBe(`sha256:${digest}`);
    expect(parseRestArtifactDigest(`sha256:${digest}`)).toBe(`sha256:${digest}`);
    expect(parseCanonicalActionArtifactId('9007199254740991')).toBe('9007199254740991');
    expect(parseCanonicalRestArtifactId(9_007_199_254_740_991)).toBe('9007199254740991');
    for (const value of ['0', '01', '-1', '1.0', '1e2', '1,2', ' 1', '9007199254740992']) {
      expect(() => parseCanonicalActionArtifactId(value)).toThrow('ARTIFACT_ID_INVALID');
    }
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1']) {
      expect(() => parseCanonicalRestArtifactId(value)).toThrow('ARTIFACT_ID_INVALID');
    }
  });

  it('rejects transport mode, roster and member drift', async () => {
    const value = await fixture();
    await expect(
      verifyChromeReleaseArtifactManifest({
        manifestPath: value.manifestPath,
        transportMode: 'github-artifact-v1'
      })
    ).rejects.toThrow('RELEASE_ARTIFACT_DIRECTORY_INVALID');
    await writeFile(join(value.releaseDir, 'extra.txt'), 'extra', { mode: 0o600 });
    await expect(
      verifyChromeReleaseArtifactManifest({
        manifestPath: value.manifestPath,
        transportMode: 'local-private-v1'
      })
    ).rejects.toThrow('RELEASE_ARTIFACT_DIRECTORY_ROSTER');
  });
});
