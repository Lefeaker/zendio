import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';
import {
  canonicalArtifactJson,
  createFirefoxReleaseArtifactManifest,
  verifyFirefoxReleaseArtifactManifest
} from '../../../scripts/utils/firefoxReleaseArtifactManifest.mjs';
import {
  FIREFOX_AMO_API_BASE_URL,
  FIREFOX_SUBMISSION_LIMITS,
  FIREFOX_SUBMISSION_MUTATIONS,
  submitVerifiedFirefoxXpi
} from '../../../scripts/utils/firefoxExactXpiSubmit.mjs';

const roots: string[] = [];
type MutationOperation = 'upload' | 'version-submit' | 'source-patch';
type FailurePoint = { stage: 'before' | 'request' | 'after'; operation: MutationOperation };

function failAt(
  failure: FailurePoint | undefined,
  stage: FailurePoint['stage'],
  operation: MutationOperation
): void {
  if (failure?.stage === stage && failure.operation === operation) {
    throw new Error(`${stage}-${operation}-failed`);
  }
}

function createMutationJournal(events: string[], failure?: FailurePoint) {
  return {
    beforeMutation: vi.fn((operation: MutationOperation): Promise<void> => {
      events.push(`before:${operation}`);
      failAt(failure, 'before', operation);
      return Promise.resolve();
    }),
    afterMutation: vi.fn((operation: MutationOperation): Promise<void> => {
      events.push(`after:${operation}`);
      failAt(failure, 'after', operation);
      return Promise.resolve();
    })
  };
}

function installPinnedFetch(events: string[], failure?: FailurePoint) {
  const fetchMock = vi.fn((url: URL, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    if (method === 'POST' && url.pathname.endsWith('/addons/upload/')) {
      events.push('request:upload');
      failAt(failure, 'request', 'upload');
      return Promise.resolve(
        new Response(JSON.stringify({ uuid: 'upload-uuid' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    }
    if (method === 'GET' && url.pathname.endsWith('/addons/upload/upload-uuid/')) {
      events.push('request:validation-read');
      return Promise.resolve(
        new Response(
          JSON.stringify({
            processed: true,
            valid: true,
            uuid: 'upload-uuid',
            validation: { errors: 0 }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    }
    if (method === 'PUT' && /\/addons\/addon\/[^/]+\/$/u.test(url.pathname)) {
      events.push('request:version-submit');
      failAt(failure, 'request', 'version-submit');
      return Promise.resolve(
        new Response(
          JSON.stringify({ version: { id: 42, edit_url: 'https://example.test/edit' } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    }
    if (method === 'PATCH' && /\/addons\/addon\/[^/]+\/versions\/[^/]+\/$/u.test(url.pathname)) {
      events.push('request:source-patch');
      failAt(failure, 'request', 'source-patch');
      return Promise.resolve(
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    }
    throw new Error(`unexpected-fetch:${method}:${url.href}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function createSubmissionHarness(failure?: FailurePoint) {
  const events: string[] = [];
  const journal = createMutationJournal(events, failure);
  const fetchMock = installPinnedFetch(events, failure);
  return { events, journal, fetchMock };
}

async function createBoundRelease() {
  const root = await mkdtemp(join(tmpdir(), 'zendio-firefox-submit-'));
  roots.push(root);
  const releaseDir = join(root, 'release');
  const distDir = join(root, 'dist');
  const sourceDir = join(root, 'source');
  await Promise.all([releaseDir, distDir, sourceDir].map((path) => mkdir(path, { mode: 0o700 })));
  await writeFile(join(distDir, 'manifest.json'), '{}\n');
  await writeFile(join(sourceDir, 'README.md'), '# source\n');
  const xpiPath = join(releaseDir, 'fixture.xpi');
  const sourcePath = join(releaseDir, 'fixture-source.zip');
  await writeFile(xpiPath, buildZipFixture([{ path: 'manifest.json', content: '{}\n' }]));
  await writeFile(sourcePath, buildZipFixture([{ path: 'README.md', content: '# source\n' }]));
  await chmod(xpiPath, 0o600);
  await chmod(sourcePath, 0o600);
  const manifest = await createFirefoxReleaseArtifactManifest({
    releaseDir,
    distDir,
    xpiPath,
    sourceArchivePath: sourcePath,
    git: {},
    packageMetadata: { geckoId: 'fixture@example.test' },
    toolchain: {},
    gaConfig: {},
    buildEnvironment: { configMode: 'standalone-synthetic' }
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  await writeFile(manifestPath, canonicalArtifactJson(manifest), { mode: 0o600 });
  const binding = await verifyFirefoxReleaseArtifactManifest({
    manifestPath,
    transportMode: 'local-private-v1',
    expectedAttemptRoot: root
  });
  const downloadDir = join(releaseDir, 'download');
  await mkdir(downloadDir, { mode: 0o700 });
  return { binding, downloadDir, releaseDir, sourcePath };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('exact-XPI submission adapter', () => {
  it('consumes one verified binding and calls the public signer with the existing Gecko id', async () => {
    const fixture = await createBoundRelease();
    const harness = createSubmissionHarness();

    await expect(
      submitVerifiedFirefoxXpi({
        binding: fixture.binding,
        transportMode: 'local-private-v1',
        channel: 'listed',
        id: fixture.binding.geckoId,
        amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
        submissionSource: fixture.sourcePath,
        savedUploadUuidPath: join(fixture.releaseDir, 'upload-state.json'),
        downloadDir: fixture.downloadDir,
        credentials: { apiKey: 'key', apiSecret: 'secret' },
        mutationJournal: harness.journal
      })
    ).resolves.toEqual({ id: 'fixture@example.test' });
    expect(harness.events).toEqual([
      'before:upload',
      'request:upload',
      'after:upload',
      'request:validation-read',
      'before:version-submit',
      'request:version-submit',
      'after:version-submit',
      'before:source-patch',
      'request:source-patch',
      'after:source-patch'
    ]);
    expect(harness.journal.beforeMutation).toHaveBeenCalledTimes(3);
    expect(harness.journal.afterMutation).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      name: 'upload before-hook',
      failure: { stage: 'before', operation: 'upload' },
      code: 'pre-mutation-failure',
      retrySafe: true,
      requests: []
    },
    {
      name: 'upload request',
      failure: { stage: 'request', operation: 'upload' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload']
    },
    {
      name: 'upload after-hook',
      failure: { stage: 'after', operation: 'upload' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload']
    },
    {
      name: 'version before-hook after upload',
      failure: { stage: 'before', operation: 'version-submit' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload', 'request:validation-read']
    },
    {
      name: 'version request',
      failure: { stage: 'request', operation: 'version-submit' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload', 'request:validation-read', 'request:version-submit']
    },
    {
      name: 'version after-hook',
      failure: { stage: 'after', operation: 'version-submit' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload', 'request:validation-read', 'request:version-submit']
    },
    {
      name: 'source before-hook after prior mutations',
      failure: { stage: 'before', operation: 'source-patch' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload', 'request:validation-read', 'request:version-submit']
    },
    {
      name: 'source request',
      failure: { stage: 'request', operation: 'source-patch' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: [
        'request:upload',
        'request:validation-read',
        'request:version-submit',
        'request:source-patch'
      ]
    },
    {
      name: 'source after-hook',
      failure: { stage: 'after', operation: 'source-patch' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: [
        'request:upload',
        'request:validation-read',
        'request:version-submit',
        'request:source-patch'
      ]
    }
  ] satisfies Array<{
    name: string;
    failure: FailurePoint;
    code: 'pre-mutation-failure' | 'unknown-submission-state';
    retrySafe: boolean;
    requests: string[];
  }>)(
    'classifies $name without admitting a later mutation',
    async ({ failure, code, retrySafe, requests }) => {
      const fixture = await createBoundRelease();
      const harness = createSubmissionHarness(failure);

      await expect(
        submitVerifiedFirefoxXpi({
          binding: fixture.binding,
          transportMode: 'local-private-v1',
          channel: 'listed',
          id: fixture.binding.geckoId,
          amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
          submissionSource: fixture.sourcePath,
          savedUploadUuidPath: join(fixture.releaseDir, 'upload-state.json'),
          downloadDir: fixture.downloadDir,
          credentials: { apiKey: 'key', apiSecret: 'secret' },
          mutationJournal: harness.journal
        })
      ).rejects.toMatchObject({ code, retrySafe });
      expect(harness.events.filter((event) => event.startsWith('request:'))).toEqual(requests);
    }
  );

  it('rejects signer and client injection before binding, credentials, journal, or mutation', async () => {
    for (const injectionKind of ['signer', 'client']) {
      const fixture = await createBoundRelease();
      const externalMutation = vi.fn();
      const credentialRead = vi.fn();
      const journal = {
        beforeMutation: vi.fn(),
        afterMutation: vi.fn()
      };
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const injection =
        injectionKind === 'signer'
          ? {
              signAddonImpl: () => {
                externalMutation();
                return Promise.resolve({ id: 'bypass' });
              }
            }
          : {
              SubmitClient: class InheritedSubmitClientBypass {
                constructor() {
                  externalMutation();
                }
              }
            };

      await expect(
        submitVerifiedFirefoxXpi(
          {
            binding: fixture.binding,
            transportMode: 'local-private-v1',
            channel: 'listed',
            id: fixture.binding.geckoId,
            amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
            submissionSource: fixture.sourcePath,
            savedUploadUuidPath: join(fixture.releaseDir, 'upload-state.json'),
            downloadDir: fixture.downloadDir,
            credentials: {
              get apiKey() {
                credentialRead();
                return 'key';
              },
              get apiSecret() {
                credentialRead();
                return 'secret';
              }
            },
            mutationJournal: journal
          },
          injection
        )
      ).rejects.toThrow('FIREFOX_SUBMIT_INJECTION_FORBIDDEN');
      expect(externalMutation).not.toHaveBeenCalled();
      expect(credentialRead).not.toHaveBeenCalled();
      expect(journal.beforeMutation).not.toHaveBeenCalled();
      expect(journal.afterMutation).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();

      const harness = createSubmissionHarness();
      await expect(
        submitVerifiedFirefoxXpi({
          binding: fixture.binding,
          transportMode: 'local-private-v1',
          channel: 'listed',
          id: fixture.binding.geckoId,
          amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
          submissionSource: fixture.sourcePath,
          savedUploadUuidPath: join(fixture.releaseDir, 'upload-state.json'),
          downloadDir: fixture.downloadDir,
          credentials: { apiKey: 'key', apiSecret: 'secret' },
          mutationJournal: harness.journal
        })
      ).resolves.toEqual({ id: 'fixture@example.test' });
    }
  });

  it('fences a late upload rejection without admitting a later pinned mutation', async () => {
    const fixture = await createBoundRelease();
    const events: string[] = [];
    const journal = createMutationJournal(events);
    let resolveUpload: ((response: Response) => void) | undefined;
    let rejectUpload: ((error: Error) => void) | undefined;
    const pendingUpload = new Promise<Response>((resolve, reject) => {
      resolveUpload = resolve;
      rejectUpload = reject;
    });
    const fetchMock = vi.fn((url: URL, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? 'GET';
      events.push(`request:${method}:${url.pathname}`);
      return pendingUpload;
    });
    vi.stubGlobal('fetch', fetchMock);

    const submission = submitVerifiedFirefoxXpi({
      binding: fixture.binding,
      transportMode: 'local-private-v1',
      channel: 'listed',
      id: fixture.binding.geckoId,
      amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
      submissionSource: fixture.sourcePath,
      savedUploadUuidPath: join(fixture.releaseDir, 'upload-state.json'),
      downloadDir: fixture.downloadDir,
      credentials: { apiKey: 'key', apiSecret: 'secret' },
      mutationJournal: journal
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    if (!rejectUpload || !resolveUpload) throw new Error('upload-controls-not-installed');
    rejectUpload(new Error('late-upload-failure'));
    await expect(submission).rejects.toMatchObject({
      code: 'unknown-submission-state',
      retrySafe: false
    });
    resolveUpload(new Response('{}', { status: 200 }));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(journal.afterMutation).not.toHaveBeenCalled();
  });

  it('keeps concurrent pinned submissions and journals isolated', async () => {
    const [leftFixture, rightFixture] = await Promise.all([
      createBoundRelease(),
      createBoundRelease()
    ]);
    const networkEvents: string[] = [];
    installPinnedFetch(networkEvents);
    const leftEvents: string[] = [];
    const rightEvents: string[] = [];
    const leftJournal = createMutationJournal(leftEvents);
    const rightJournal = createMutationJournal(rightEvents);

    await Promise.all([
      submitVerifiedFirefoxXpi({
        binding: leftFixture.binding,
        transportMode: 'local-private-v1',
        channel: 'listed',
        id: leftFixture.binding.geckoId,
        amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
        submissionSource: leftFixture.sourcePath,
        savedUploadUuidPath: join(leftFixture.releaseDir, 'upload-state.json'),
        downloadDir: leftFixture.downloadDir,
        credentials: { apiKey: 'left-key', apiSecret: 'left-secret' },
        mutationJournal: leftJournal
      }),
      submitVerifiedFirefoxXpi({
        binding: rightFixture.binding,
        transportMode: 'local-private-v1',
        channel: 'listed',
        id: rightFixture.binding.geckoId,
        amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
        submissionSource: rightFixture.sourcePath,
        savedUploadUuidPath: join(rightFixture.releaseDir, 'upload-state.json'),
        downloadDir: rightFixture.downloadDir,
        credentials: { apiKey: 'right-key', apiSecret: 'right-secret' },
        mutationJournal: rightJournal
      })
    ]);
    expect(leftEvents).toEqual([
      'before:upload',
      'after:upload',
      'before:version-submit',
      'after:version-submit',
      'before:source-patch',
      'after:source-patch'
    ]);
    expect(rightEvents).toEqual(leftEvents);
    expect(networkEvents.filter((event) => event === 'request:upload')).toHaveLength(2);
    expect(networkEvents.filter((event) => event === 'request:validation-read')).toHaveLength(2);
    expect(networkEvents.filter((event) => event === 'request:version-submit')).toHaveLength(2);
    expect(networkEvents.filter((event) => event === 'request:source-patch')).toHaveLength(2);
  });

  it('rejects an in-release substitute source before credentials, journal, or signer', async () => {
    const fixture = await createBoundRelease();
    const substitutePath = join(fixture.releaseDir, 'substitute-source.zip');
    await writeFile(substitutePath, buildZipFixture([{ path: 'README.md', content: '# other\n' }]));
    await chmod(substitutePath, 0o600);
    const credentialRead = vi.fn();
    const journal = {
      beforeMutation: vi.fn(),
      afterMutation: vi.fn()
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitVerifiedFirefoxXpi({
        binding: fixture.binding,
        transportMode: 'local-private-v1',
        channel: 'listed',
        id: fixture.binding.geckoId,
        amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
        submissionSource: substitutePath,
        savedUploadUuidPath: join(fixture.releaseDir, 'upload-state.json'),
        downloadDir: fixture.downloadDir,
        credentials: {
          get apiKey() {
            credentialRead();
            return 'key';
          },
          get apiSecret() {
            credentialRead();
            return 'secret';
          }
        },
        mutationJournal: journal
      })
    ).rejects.toThrow('FIREFOX_SUBMIT_SOURCE_MISMATCH');
    expect(credentialRead).not.toHaveBeenCalled();
    expect(journal.beforeMutation).not.toHaveBeenCalled();
    expect(journal.afterMutation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects bound source mutation before credentials, journal, or signer', async () => {
    const fixture = await createBoundRelease();
    await writeFile(
      fixture.sourcePath,
      buildZipFixture([{ path: 'README.md', content: '# replaced\n' }])
    );
    const credentialRead = vi.fn();
    const journal = {
      beforeMutation: vi.fn(),
      afterMutation: vi.fn()
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitVerifiedFirefoxXpi({
        binding: fixture.binding,
        transportMode: 'local-private-v1',
        channel: 'listed',
        id: fixture.binding.geckoId,
        amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
        submissionSource: fixture.sourcePath,
        savedUploadUuidPath: join(fixture.releaseDir, 'upload-state.json'),
        downloadDir: fixture.downloadDir,
        credentials: {
          get apiKey() {
            credentialRead();
            return 'key';
          },
          get apiSecret() {
            credentialRead();
            return 'secret';
          }
        },
        mutationJournal: journal
      })
    ).rejects.toThrow('FIREFOX_RELEASE_BINDING_DRIFT');
    expect(credentialRead).not.toHaveBeenCalled();
    expect(journal.beforeMutation).not.toHaveBeenCalled();
    expect(journal.afterMutation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a structural clone without reading credentials or invoking the signer', async () => {
    const fixture = await createBoundRelease();
    const credentialRead = vi.fn();
    const credentials = {
      get apiKey() {
        credentialRead();
        return '';
      },
      get apiSecret() {
        credentialRead();
        return '';
      }
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitVerifiedFirefoxXpi({
        binding: { ...fixture.binding },
        transportMode: 'local-private-v1',
        channel: 'listed',
        id: fixture.binding.geckoId,
        amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
        submissionSource: fixture.sourcePath,
        savedUploadUuidPath: join(fixture.releaseDir, 'upload-state.json'),
        downloadDir: fixture.downloadDir,
        credentials,
        mutationJournal: {
          beforeMutation: vi.fn(),
          afterMutation: vi.fn()
        }
      })
    ).rejects.toThrow('FIREFOX_RELEASE_BINDING_INVALID');
    expect(credentialRead).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('freezes the bounded production timing constants', () => {
    expect(FIREFOX_SUBMISSION_MUTATIONS).toEqual(['upload', 'version-submit', 'source-patch']);
    expect(FIREFOX_SUBMISSION_LIMITS.validationTotalMs).toBe(600_000);
    expect(FIREFOX_SUBMISSION_LIMITS.approvalTotalMs).toBe(900_000);
    expect(FIREFOX_SUBMISSION_LIMITS.downloadMs).toBe(120_000);
  });
});
