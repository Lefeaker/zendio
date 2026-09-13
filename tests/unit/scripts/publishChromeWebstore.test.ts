import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';
import {
  canonicalReleaseArtifactJson,
  createChromeReleaseArtifactManifest,
  verifyChromeReleaseArtifactManifest
} from '../../../scripts/utils/releaseArtifactManifest.mjs';
import {
  CHROME_DEFAULT_PUBLIC_PUBLISH_REQUEST,
  dryRunVerifiedChromeRelease,
  publishVerifiedChromeWebStore,
  resolveReleaseOptionsFromArgs
} from '../../../scripts/publish-chrome-webstore.mjs';

const roots: string[] = [];
const sha = 'a'.repeat(40);

async function readCompactState(path: string): Promise<Record<string, string | boolean | null>> {
  const bytes = await readFile(path, 'utf8');
  expect(bytes.endsWith('\n')).toBe(true);
  expect(bytes.slice(0, -1)).not.toContain('\n');
  const state: Record<string, string | boolean | null> = JSON.parse(bytes);
  expect(Object.keys(state)).toEqual(Object.keys(state).sort());
  return state;
}

async function fixture(transport: 'local-private-v1' | 'github-artifact-v1') {
  const root = await mkdtemp(join(tmpdir(), 'zendio-cws-'));
  roots.push(root);
  await chmod(root, transport === 'local-private-v1' ? 0o700 : 0o755);
  const releaseDir = join(root, 'release');
  const distDir = join(root, 'dist');
  await mkdir(releaseDir, { mode: transport === 'local-private-v1' ? 0o700 : 0o755 });
  await mkdir(distDir, { mode: 0o700 });
  const zipPath = join(releaseDir, 'fixture.zip');
  const zipBytes = buildZipFixture([{ path: 'manifest.json', content: '{}\n' }]);
  await writeFile(zipPath, zipBytes, { mode: transport === 'local-private-v1' ? 0o600 : 0o644 });
  const manifest = await createChromeReleaseArtifactManifest({
    releaseDir,
    distDir,
    zipPath,
    repository: { name: 'zendio' },
    git: { head: sha, tree: 'b'.repeat(40) },
    packageMetadata: { version: '0.2.1' },
    buildConfig: { configMode: 'standalone-synthetic' }
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  await writeFile(manifestPath, canonicalReleaseArtifactJson(manifest), {
    mode: transport === 'local-private-v1' ? 0o600 : 0o644
  });
  const binding = await verifyChromeReleaseArtifactManifest({
    manifestPath,
    transportMode: transport
  });
  const stateFile = join(root, 'state.json');
  const state = {
    schema: 'zendio-release-store-state-v1',
    browser: 'chrome',
    releaseSha: sha,
    releaseTree: 'b'.repeat(40),
    artifactReceiptSha256: 'c'.repeat(64),
    manifestPath,
    manifestSha256: createHash('sha256')
      .update(await readFile(manifestPath))
      .digest('hex'),
    store: 'chrome-web-store-v1',
    channel: 'default',
    packageSha256: 'd'.repeat(64),
    lockSha256: 'e'.repeat(64),
    artifactRole: 'extension-zip',
    itemId: null,
    publisherIdFingerprint: null,
    packageVersion: null,
    archiveSha256: null,
    terminalResult: null,
    errorCode: null,
    recovery: 'none',
    stage: 'preflight',
    outcome: 'not-started',
    mutationInvoked: false,
    retrySafe: true
  };
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  return { binding, stateFile, zipPath };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Chrome Web Store publisher', () => {
  it('publishes the verified byte snapshot with exact default-public request', async () => {
    const value = await fixture('github-artifact-v1');
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn((url: string | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      if (String(url).includes('oauth2')) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'token' }), { status: 200 })
        );
      }
      if (String(url).includes(':upload')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              name: 'publishers/publisher/items/item',
              itemId: 'item',
              uploadState: 'SUCCEEDED',
              crxVersion: '0.2.1'
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            name: 'publishers/publisher/items/item',
            itemId: 'item',
            state: 'PENDING_REVIEW',
            warnings: []
          }),
          { status: 200 }
        )
      );
    });
    await expect(
      publishVerifiedChromeWebStore(
        {
          binding: value.binding,
          stateFile: value.stateFile,
          environment: {
            CWS_CLIENT_ID: 'client',
            CWS_CLIENT_SECRET: 'secret',
            CWS_REFRESH_TOKEN: 'refresh',
            CWS_EXTENSION_ID: 'item',
            CWS_PUBLISHER_ID: 'publisher'
          }
        },
        { fetchImpl }
      )
    ).resolves.toMatchObject({ terminalResult: 'PENDING_REVIEW' });
    expect(calls).toHaveLength(3);
    expect(calls[1].init?.body).toBeInstanceOf(Buffer);
    expect(calls[2].init?.body).toBe(JSON.stringify(CHROME_DEFAULT_PUBLIC_PUBLISH_REQUEST));
    expect(await readCompactState(value.stateFile)).toMatchObject({
      stage: 'publish-completed',
      outcome: 'success',
      retrySafe: false,
      terminalResult: 'PENDING_REVIEW'
    });
  });

  it('keeps token failure retry-safe and upload failure unknown without publish', async () => {
    const tokenFixture = await fixture('github-artifact-v1');
    await expect(
      publishVerifiedChromeWebStore(
        {
          binding: tokenFixture.binding,
          stateFile: tokenFixture.stateFile,
          environment: {
            CWS_CLIENT_ID: 'client',
            CWS_CLIENT_SECRET: 'secret',
            CWS_REFRESH_TOKEN: 'refresh',
            CWS_EXTENSION_ID: 'item',
            CWS_PUBLISHER_ID: 'publisher'
          }
        },
        { fetchImpl: () => Promise.resolve(new Response('{}', { status: 401 })) }
      )
    ).rejects.toThrow('CHROME_RESPONSE_HTTP');
    expect(await readCompactState(tokenFixture.stateFile)).toMatchObject({
      outcome: 'pre-mutation-failure',
      mutationInvoked: false,
      retrySafe: true
    });

    const uploadFixture = await fixture('github-artifact-v1');
    const fetchImpl = vi
      .fn<(url: string | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token' }), { status: 200 })
      )
      .mockRejectedValueOnce(new Error('lost'));
    await expect(
      publishVerifiedChromeWebStore(
        {
          binding: uploadFixture.binding,
          stateFile: uploadFixture.stateFile,
          environment: {
            CWS_CLIENT_ID: 'client',
            CWS_CLIENT_SECRET: 'secret',
            CWS_REFRESH_TOKEN: 'refresh',
            CWS_EXTENSION_ID: 'item',
            CWS_PUBLISHER_ID: 'publisher'
          }
        },
        { fetchImpl }
      )
    ).rejects.toMatchObject({ code: 'unknown-submission-state', retrySafe: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await readCompactState(uploadFixture.stateFile)).toMatchObject({
      outcome: 'unknown-submission-state',
      mutationInvoked: true,
      retrySafe: false
    });
  });

  it('keeps dry-run credential- and network-free', async () => {
    const value = await fixture('local-private-v1');
    await expect(
      dryRunVerifiedChromeRelease({ binding: value.binding, stateFile: value.stateFile })
    ).resolves.toMatchObject({ mode: 'dry-run', packageVersion: '0.2.1' });
    expect(() =>
      resolveReleaseOptionsFromArgs([
        '--publish',
        '--zip',
        value.zipPath,
        '--artifact-manifest',
        value.binding.manifestPath,
        '--state-file',
        value.stateFile,
        '--transport-mode',
        'github-artifact-v1'
      ])
    ).toThrow('CHROME_RELEASE_ARGUMENTS_INVALID');
  });
});
