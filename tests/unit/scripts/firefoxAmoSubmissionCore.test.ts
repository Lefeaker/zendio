import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';
import {
  canonicalArtifactJson,
  createFirefoxReleaseArtifactManifest,
  verifyFirefoxReleaseArtifactManifest
} from '../../../scripts/utils/firefoxReleaseArtifactManifest.mjs';
import { submitFirefoxAmoReleaseCore } from '../../../scripts/utils/firefoxAmoSubmissionCore.mjs';
import { validateReleasePublicBuildConfig } from '../../../scripts/utils/releasePublicBuildConfig.mjs';

const roots: string[] = [];
const sha = 'a'.repeat(40);

async function fixture() {
  const createdRoot = await mkdtemp(join(tmpdir(), 'zendio-firefox-submit-core-'));
  const root = await realpath(createdRoot);
  roots.push(root);
  await chmod(root, 0o700);
  const releaseDir = join(root, 'release');
  const distDir = join(root, 'dist');
  await mkdir(releaseDir, { mode: 0o700 });
  await mkdir(distDir, { mode: 0o700 });
  const raw = {
    ZENDIO_GA_MEASUREMENT_ID: 'G-OWNERPUBLIC1',
    ZENDIO_GA_PROXY_ENDPOINT: 'https://analytics.example.com/collect',
    ZENDIO_GA_TRANSPORT_MODE: 'proxy'
  };
  const publicConfig = validateReleasePublicBuildConfig({
    configMode: 'owner-public-vars',
    environment: raw
  });
  const version = publicConfig.policy.sentry.release;
  const manifestJson = `${JSON.stringify({ browser_specific_settings: { gecko: { id: 'fixture@example.test' } }, version })}\n`;
  await writeFile(join(distDir, 'manifest.json'), manifestJson);
  const xpiPath = join(releaseDir, 'fixture.xpi');
  const sourcePath = join(releaseDir, 'fixture-source.zip');
  await writeFile(xpiPath, buildZipFixture([{ path: 'manifest.json', content: manifestJson }]), {
    mode: 0o600
  });
  await writeFile(sourcePath, buildZipFixture([{ path: 'README.md', content: '# source\n' }]), {
    mode: 0o600
  });
  const provenance = { schema: 'zendio-release-ci-provenance-v1', releaseSha: sha };
  const provenancePath = join(releaseDir, 'ci-provenance.json');
  await writeFile(provenancePath, canonicalArtifactJson(provenance), { mode: 0o600 });
  const authorization = {
    authorizationMode: 'attached-ci-provenance-v1',
    provenance,
    provenanceRelativePath: 'ci-provenance.json',
    provenanceSha256: createHash('sha256').update(canonicalArtifactJson(provenance)).digest('hex'),
    releaseEligible: false
  };
  const manifest = await createFirefoxReleaseArtifactManifest({
    releaseDir,
    distDir,
    xpiPath,
    sourceArchivePath: sourcePath,
    git: { head: sha, tree: 'b'.repeat(40) },
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
      configMode: 'owner-public-vars'
    },
    authorization
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  await writeFile(manifestPath, canonicalArtifactJson(manifest), { mode: 0o600 });
  await chmod(releaseDir, 0o755);
  await Promise.all(
    [xpiPath, sourcePath, provenancePath, manifestPath].map((path) => chmod(path, 0o644))
  );
  const binding = await verifyFirefoxReleaseArtifactManifest({
    manifestPath,
    transportMode: 'github-artifact-v1',
    expectedAttemptRoot: root
  });
  const stateRoot = join(root, 'store-state/firefox');
  const uploadRoot = join(stateRoot, 'web-ext-upload');
  const downloadDir = join(stateRoot, 'downloads');
  await mkdir(uploadRoot, { recursive: true, mode: 0o700 });
  await mkdir(downloadDir, { mode: 0o700 });
  const stateFile = join(stateRoot, 'submission-state.json');
  const state = {
    schema: 'zendio-release-store-state-v1',
    browser: 'firefox',
    releaseSha: sha,
    releaseTree: 'b'.repeat(40),
    artifactReceiptSha256: 'c'.repeat(64),
    manifestPath,
    manifestSha256: createHash('sha256')
      .update(await readFile(manifestPath))
      .digest('hex'),
    store: 'firefox-amo-v1',
    channel: 'pending',
    packageSha256: 'd'.repeat(64),
    lockSha256: 'e'.repeat(64),
    artifactRole: 'unsigned-xpi',
    geckoId: null,
    xpiSha256: null,
    sourceArchiveSha256: null,
    uploadUuidSha256: null,
    signedXpiSha256: null,
    terminalResult: null,
    errorCode: null,
    recovery: 'none',
    stage: 'preflight',
    outcome: 'not-started',
    mutationInvoked: false,
    retrySafe: true
  };
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  return {
    binding,
    manifestPath,
    stateFile,
    savedUploadUuidPath: join(uploadRoot, 'upload-uuid.json'),
    downloadDir
  };
}

function installFetch(failure?: 'upload') {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: URL, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? 'GET';
      calls.push(`${method}:${url.pathname}`);
      if (method === 'POST' && url.pathname.endsWith('/addons/upload/')) {
        if (failure === 'upload') return Promise.reject(new Error('upload-lost'));
        return Promise.resolve(
          new Response(JSON.stringify({ uuid: 'upload-uuid' }), { status: 200 })
        );
      }
      if (method === 'GET' && url.pathname.endsWith('/addons/upload/upload-uuid/')) {
        return Promise.resolve(
          new Response(JSON.stringify({ processed: true, valid: true, uuid: 'upload-uuid' }), {
            status: 200
          })
        );
      }
      if (method === 'PUT') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ version: { id: 42, edit_url: 'https://example.test/edit' } }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    })
  );
  return calls;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Firefox AMO submission core', () => {
  it('durably records upload, version-submit and source-patch success', async () => {
    const value = await fixture();
    const calls = installFetch();
    await expect(
      submitFirefoxAmoReleaseCore({
        ...value,
        channel: 'listed',
        credentials: { apiKey: 'key', apiSecret: 'secret' }
      })
    ).resolves.toMatchObject({ state: { outcome: 'success', terminalResult: 'listed' } });
    expect(calls.filter((call) => /POST|PUT|PATCH/u.test(call))).toHaveLength(3);
    expect(JSON.parse(await readFile(value.stateFile, 'utf8'))).toMatchObject({
      stage: 'source-patch-completed',
      lastStartedOperation: 'source-patch',
      lastCompletedOperation: 'source-patch',
      mutationInvoked: true,
      retrySafe: false
    });
  });

  it('records an upload request loss as unknown and admits no later mutation', async () => {
    const value = await fixture();
    const calls = installFetch('upload');
    await expect(
      submitFirefoxAmoReleaseCore({
        ...value,
        channel: 'listed',
        credentials: { apiKey: 'key', apiSecret: 'secret' }
      })
    ).rejects.toMatchObject({ code: 'unknown-submission-state', retrySafe: false });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(await readFile(value.stateFile, 'utf8'))).toMatchObject({
      stage: 'upload-started',
      outcome: 'unknown-submission-state',
      retrySafe: false
    });
  });
});
