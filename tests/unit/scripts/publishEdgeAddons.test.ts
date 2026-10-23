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
  EDGE_LIMITS,
  edgeOperationId,
  publishVerifiedEdgeRelease
} from '../../../scripts/publish-edge-addons.mjs';

const roots: string[] = [];
const product = '11111111-1111-1111-1111-111111111111';
const upload = '22222222-2222-2222-2222-222222222222';
const publish = '33333333-3333-3333-3333-333333333333';
const base = `https://api.addons.microsoftedge.microsoft.com/v1/products/${product}/submissions`;
const environment = {
  EDGE_CLIENT_ID: 'client-id',
  EDGE_API_KEY: 'EDGE_DO_NOT_EXPOSE_SECRET',
  EDGE_PRODUCT_ID: product
};

async function fixture(invalidManifest = false) {
  const root = await mkdtemp(join(tmpdir(), 'zendio-edge-'));
  roots.push(root);
  await chmod(root, 0o755);
  const releaseDir = join(root, 'release');
  const distDir = join(root, 'dist');
  await mkdir(releaseDir, { mode: 0o755 });
  await mkdir(distDir, { mode: 0o700 });
  const zipPath = join(releaseDir, 'fixture.zip');
  await writeFile(
    zipPath,
    buildZipFixture([
      {
        path: 'manifest.json',
        content: JSON.stringify({
          manifest_version: 3,
          version: '0.3.5',
          name: '__MSG_extName__',
          description: '__MSG_extDescription__',
          background: { service_worker: 'background.js' },
          ...(invalidManifest ? { update_url: 'https://example.com/update' } : {})
        })
      },
      {
        path: '_locales/en/messages.json',
        content: JSON.stringify({
          extName: { message: 'Zendio' },
          extDescription: { message: 'Save structured notes.' }
        })
      }
    ]),
    { mode: 0o644 }
  );
  const manifest = await createChromeReleaseArtifactManifest({
    releaseDir,
    distDir,
    zipPath,
    repository: { name: 'zendio' },
    git: { head: 'a'.repeat(40), tree: 'b'.repeat(40) },
    packageMetadata: { version: '0.3.5' },
    buildConfig: { configMode: 'standalone-synthetic' }
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  await writeFile(manifestPath, canonicalReleaseArtifactJson(manifest), { mode: 0o644 });
  const binding = await verifyChromeReleaseArtifactManifest({
    manifestPath,
    transportMode: 'github-artifact-v1'
  });
  const stateFile = join(root, 'state.json');
  await writeFile(
    stateFile,
    JSON.stringify({
      schema: 'zendio-release-store-state-v1',
      browser: 'edge',
      releaseSha: binding.releaseSha,
      releaseTree: binding.releaseTree,
      manifestPath,
      outcome: 'not-started',
      mutationInvoked: false,
      retrySafe: true,
      recovery: 'none',
      stage: 'preflight',
      terminalResult: null,
      uploadOperationId: null,
      publishOperationId: null
    }),
    { mode: 0o600 }
  );
  return { binding, stateFile, environment, zipPath };
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const accepted = (id: string) => new Response('', { status: 202, headers: { location: id } });
const status = (id: string, state = 'Succeeded') =>
  new Response(JSON.stringify({ id, status: state, errorCode: '', errors: null }), { status: 200 });

describe('Edge Add-ons exact package submission', () => {
  it('persists each operation before network effects, uploads verified bytes and reports review only', async () => {
    const value = await fixture();
    const requests: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      const state = JSON.parse(await readFile(value.stateFile, 'utf8')) as Record<string, unknown>;
      expect(state).toMatchObject({
        mutationInvoked: true,
        retrySafe: false,
        outcome: 'unknown-submission-state'
      });
      if (requests.length === 1) {
        expect(state.stage).toBe('upload-started');
        expect(init?.body).toEqual(await readFile(value.zipPath));
        return accepted(upload);
      }
      if (requests.length === 2) {
        expect(state.uploadOperationId).toBe(upload);
        return status(upload);
      }
      if (requests.length === 3) {
        expect(state).toMatchObject({ stage: 'publish-started', lastCompletedOperation: 'upload' });
        expect(new URLSearchParams(String(init?.body)).get('notes')).toContain('Zendio 0.3.5');
        return accepted(publish);
      }
      expect(state.publishOperationId).toBe(publish);
      return status(publish);
    });
    await expect(publishVerifiedEdgeRelease(value, { fetchImpl })).resolves.toMatchObject({
      terminalResult: 'PENDING_REVIEW',
      uploadOperationId: upload,
      publishOperationId: publish
    });
    expect(requests.map((r) => [r.init?.method, r.url])).toEqual([
      ['POST', `${base}/draft/package`],
      ['GET', `${base}/draft/package/operations/${upload}`],
      ['POST', base],
      ['GET', `${base}/operations/${publish}`]
    ]);
    expect(requests.every((r) => r.init?.redirect === 'error')).toBe(true);
    const state = await readFile(value.stateFile, 'utf8');
    expect(state).not.toContain(environment.EDGE_API_KEY);
    expect(state).not.toContain(environment.EDGE_CLIENT_ID);
    expect(JSON.parse(state)).toMatchObject({
      outcome: 'success',
      terminalResult: 'PENDING_REVIEW'
    });
  });

  it.each(['config', 'manifest', 'changed-package'])(
    'rejects %s before any POST',
    async (reason) => {
      const value = await fixture(reason === 'manifest');
      if (reason === 'config') value.environment = { ...environment, EDGE_API_KEY: '' };
      if (reason === 'changed-package') await writeFile(value.zipPath, 'changed');
      const fetchImpl = vi.fn();
      await expect(publishVerifiedEdgeRelease(value, { fetchImpl })).rejects.toThrow(
        'EDGE_PREFLIGHT_FAILED'
      );
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(JSON.parse(await readFile(value.stateFile, 'utf8'))).toMatchObject({
        mutationInvoked: false,
        retrySafe: true,
        outcome: 'pre-mutation-failure'
      });
    }
  );

  it.each(['rejected', 'network', 'wrong-id', 'foreign-location', 'oversized', 'publish-rejected'])(
    'does not repeat POST or advance after %s',
    async (reason) => {
      const value = await fixture();
      const calls: string[] = [];
      const fetchImpl = vi.fn((_url: string | URL, init?: RequestInit): Promise<Response> => {
        calls.push(init?.method ?? 'GET');
        if (calls.length === 1) {
          if (reason === 'rejected')
            return Promise.resolve(new Response(environment.EDGE_API_KEY, { status: 401 }));
          if (reason === 'network') return Promise.reject(new Error(environment.EDGE_API_KEY));
          if (reason === 'foreign-location')
            return Promise.resolve(accepted(`https://evil.example/${upload}`));
          return Promise.resolve(accepted(upload));
        }
        if (calls.length === 2) {
          if (reason === 'wrong-id') return Promise.resolve(status(publish));
          if (reason === 'oversized')
            return Promise.resolve(new Response('x'.repeat(EDGE_LIMITS.responseBytes + 1)));
          return Promise.resolve(status(upload));
        }
        return Promise.resolve(new Response('failure', { status: 503 }));
      });
      await expect(publishVerifiedEdgeRelease(value, { fetchImpl })).rejects.toMatchObject({
        message: 'unknown-submission-state:EDGE_RECONCILE_REQUIRED',
        retrySafe: false
      });
      expect(calls.filter((method) => method === 'POST')).toHaveLength(
        reason === 'publish-rejected' ? 2 : 1
      );
      const state = await readFile(value.stateFile, 'utf8');
      expect(state).not.toContain(environment.EDGE_API_KEY);
      expect(JSON.parse(state)).toMatchObject({
        outcome: 'unknown-submission-state',
        retrySafe: false,
        recovery: 'reconcile'
      });
      await expect(publishVerifiedEdgeRelease(value, { fetchImpl })).rejects.toThrow(
        'EDGE_STATE_BINDING_INVALID'
      );
    }
  );

  it('bounds polling while retaining the operation ID for reconciliation', async () => {
    const value = await fixture();
    const fetchImpl = vi.fn((_url: string | URL, init?: RequestInit) =>
      Promise.resolve(init?.method === 'POST' ? accepted(upload) : status(upload, 'InProgress'))
    );
    await expect(
      publishVerifiedEdgeRelease(value, { fetchImpl, sleep: () => Promise.resolve() })
    ).rejects.toThrow('EDGE_RECONCILE_REQUIRED');
    expect(fetchImpl).toHaveBeenCalledTimes(EDGE_LIMITS.pollAttempts + 1);
    expect(JSON.parse(await readFile(value.stateFile, 'utf8'))).toMatchObject({
      uploadOperationId: upload,
      publishOperationId: null,
      errorCode: 'EDGE_POLL_TIMEOUT'
    });
  });

  it('times out a stalled POST without retry and aborts the request', async () => {
    const value = await fixture();
    const fetchImpl = vi.fn(
      (_url: string | URL, _init?: RequestInit) => new Promise<Response>(() => {})
    );
    vi.useFakeTimers();
    const task = publishVerifiedEdgeRelease(value, { fetchImpl }).catch((error: unknown) => error);
    await vi.waitUntil(() => fetchImpl.mock.calls.length === 1);
    await vi.advanceTimersByTimeAsync(EDGE_LIMITS.uploadMs);
    expect(await task).toMatchObject({
      message: 'unknown-submission-state:EDGE_RECONCILE_REQUIRED',
      retrySafe: false
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(JSON.parse(await readFile(value.stateFile, 'utf8'))).toMatchObject({
      errorCode: 'EDGE_REQUEST_TIMEOUT',
      retrySafe: false
    });
  });

  it('only accepts operation IDs or exact same-endpoint operation URLs', () => {
    expect(edgeOperationId(upload, `${base}/draft/package`)).toBe(upload);
    expect(edgeOperationId(`${base}/operations/${publish}`, base)).toBe(publish);
    expect(() => edgeOperationId(`${base}/operations/${publish}?token=x`, base)).toThrow();
    expect(() => edgeOperationId(`${base}/draft/package/operations/${publish}`, base)).toThrow();
  });
});
