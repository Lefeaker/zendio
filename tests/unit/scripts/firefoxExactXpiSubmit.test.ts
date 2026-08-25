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
type AdmissionMode = 'normal' | 'duplicate-upload' | 'version-first';

function createSubmissionHarness(failure?: FailurePoint, admissionMode: AdmissionMode = 'normal') {
  const events: string[] = [];
  const failAt = (stage: FailurePoint['stage'], operation: MutationOperation) => {
    if (failure?.stage === stage && failure.operation === operation) {
      throw new Error(`${stage}-${operation}-failed`);
    }
  };
  const journal = {
    beforeMutation: vi.fn((operation: MutationOperation): Promise<void> => {
      events.push(`before:${operation}`);
      failAt('before', operation);
      return Promise.resolve();
    }),
    afterMutation: vi.fn((operation: MutationOperation): Promise<void> => {
      events.push(`after:${operation}`);
      failAt('after', operation);
      return Promise.resolve();
    })
  };

  class SubmitClient {
    fileFromSync(path: string) {
      return { path };
    }

    fetchJson(_url: URL, method = 'GET') {
      const operation: MutationOperation = method === 'POST' ? 'upload' : 'version-submit';
      events.push(`request:${operation}`);
      failAt('request', operation);
      return Promise.resolve(
        operation === 'upload'
          ? { uuid: 'upload-uuid' }
          : { version: { id: 42, edit_url: 'https://example.test/edit' } }
      );
    }

    async getPreviousUuidOrUploadXpi() {
      if (admissionMode === 'version-first') {
        await this.fetchJson(
          new URL('https://addons.mozilla.org/api/v5/addons/addon/fixture@example.test/'),
          'PUT'
        );
        return 'unreachable-upload-uuid';
      }
      await this.fetchJson(new URL('https://addons.mozilla.org/api/v5/addons/upload/'), 'POST');
      if (admissionMode === 'duplicate-upload') {
        await this.fetchJson(new URL('https://addons.mozilla.org/api/v5/addons/upload/'), 'POST');
      }
      return 'upload-uuid';
    }

    doFormDataPatch() {
      events.push('request:source-patch');
      failAt('request', 'source-patch');
      return Promise.resolve();
    }

    async putVersion(_uploadUuid: string, addonId: string) {
      await this.fetchJson(
        new URL(`https://addons.mozilla.org/api/v5/addons/addon/${addonId}/`),
        'PUT'
      );
      await this.doFormDataPatch();
      return { id: addonId };
    }
  }

  return { events, journal, SubmitClient };
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
    buildEnvironment: {}
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
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('exact-XPI submission adapter', () => {
  it('consumes one verified binding and calls the public signer with the existing Gecko id', async () => {
    const fixture = await createBoundRelease();
    const harness = createSubmissionHarness();

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
          credentials: { apiKey: 'key', apiSecret: 'secret' },
          mutationJournal: harness.journal
        },
        { SubmitClient: harness.SubmitClient }
      )
    ).resolves.toEqual({ id: 'fixture@example.test' });
    expect(harness.events).toEqual([
      'before:upload',
      'request:upload',
      'after:upload',
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
      requests: ['request:upload']
    },
    {
      name: 'version request',
      failure: { stage: 'request', operation: 'version-submit' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload', 'request:version-submit']
    },
    {
      name: 'version after-hook',
      failure: { stage: 'after', operation: 'version-submit' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload', 'request:version-submit']
    },
    {
      name: 'source before-hook after prior mutations',
      failure: { stage: 'before', operation: 'source-patch' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload', 'request:version-submit']
    },
    {
      name: 'source request',
      failure: { stage: 'request', operation: 'source-patch' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload', 'request:version-submit', 'request:source-patch']
    },
    {
      name: 'source after-hook',
      failure: { stage: 'after', operation: 'source-patch' },
      code: 'unknown-submission-state',
      retrySafe: false,
      requests: ['request:upload', 'request:version-submit', 'request:source-patch']
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
            credentials: { apiKey: 'key', apiSecret: 'secret' },
            mutationJournal: harness.journal
          },
          { SubmitClient: harness.SubmitClient }
        )
      ).rejects.toMatchObject({ code, retrySafe });
      expect(harness.events.filter((event) => event.startsWith('request:'))).toEqual(requests);
    }
  );

  it('rejects reversed and duplicate mutation admission before another request', async () => {
    const fixture = await createBoundRelease();
    const harness = createSubmissionHarness(undefined, 'duplicate-upload');

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
          credentials: { apiKey: 'key', apiSecret: 'secret' },
          mutationJournal: harness.journal
        },
        { SubmitClient: harness.SubmitClient }
      )
    ).rejects.toMatchObject({ code: 'unknown-submission-state', retrySafe: false });
    expect(harness.events).toEqual(['before:upload', 'request:upload', 'after:upload']);

    const reversedFixture = await createBoundRelease();
    const reversedHarness = createSubmissionHarness(undefined, 'version-first');

    await expect(
      submitVerifiedFirefoxXpi(
        {
          binding: reversedFixture.binding,
          transportMode: 'local-private-v1',
          channel: 'listed',
          id: reversedFixture.binding.geckoId,
          amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
          submissionSource: reversedFixture.sourcePath,
          savedUploadUuidPath: join(reversedFixture.releaseDir, 'upload-state.json'),
          downloadDir: reversedFixture.downloadDir,
          credentials: { apiKey: 'key', apiSecret: 'secret' },
          mutationJournal: reversedHarness.journal
        },
        { SubmitClient: reversedHarness.SubmitClient }
      )
    ).rejects.toMatchObject({ code: 'pre-mutation-failure', retrySafe: true });
    expect(reversedHarness.events).toEqual([]);
  });

  it('fences late completion and keeps separate submission attempts isolated', async () => {
    const lateFixture = await createBoundRelease();
    const events: string[] = [];
    let rejectUpload: ((error: Error) => void) | undefined;
    const upload = new Promise<never>((_resolve, reject) => {
      rejectUpload = reject;
    });
    class PendingSubmitClient {
      static instance: PendingSubmitClient | undefined;

      constructor() {
        PendingSubmitClient.instance = this;
      }

      fileFromSync(path: string) {
        return { path };
      }

      fetchJson(_url: URL, method = 'GET') {
        events.push(`request:${method}`);
        return upload;
      }

      async getPreviousUuidOrUploadXpi() {
        await this.fetchJson(new URL('https://addons.mozilla.org/api/v5/addons/upload/'), 'POST');
        return 'unreachable-upload-uuid';
      }
    }
    const submission = submitVerifiedFirefoxXpi(
      {
        binding: lateFixture.binding,
        transportMode: 'local-private-v1',
        channel: 'listed',
        id: lateFixture.binding.geckoId,
        amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
        submissionSource: lateFixture.sourcePath,
        savedUploadUuidPath: join(lateFixture.releaseDir, 'upload-state.json'),
        downloadDir: lateFixture.downloadDir,
        credentials: { apiKey: 'key', apiSecret: 'secret' },
        mutationJournal: {
          beforeMutation: vi.fn().mockResolvedValue(undefined),
          afterMutation: vi.fn().mockResolvedValue(undefined)
        }
      },
      { SubmitClient: PendingSubmitClient }
    );
    await vi.waitFor(() => expect(events).toEqual(['request:POST']));
    const activeClient = PendingSubmitClient.instance;
    if (!activeClient) throw new Error('active-client-not-installed');
    await expect(
      activeClient.fetchJson(new URL('https://addons.mozilla.org/api/v5/addons/upload/'), 'POST')
    ).rejects.toThrow('FIREFOX_SUBMIT_MUTATION_ORDER');
    expect(events).toEqual(['request:POST']);
    if (!rejectUpload) throw new Error('upload-rejector-not-installed');
    rejectUpload(new Error('late-upload-failure'));
    await expect(submission).rejects.toMatchObject({
      code: 'unknown-submission-state',
      retrySafe: false
    });
    const lateClient = PendingSubmitClient.instance;
    if (!lateClient) throw new Error('late-client-not-installed');
    await expect(
      lateClient.fetchJson(
        new URL('https://addons.mozilla.org/api/v5/addons/addon/fixture@example.test/'),
        'PUT'
      )
    ).rejects.toThrow('FIREFOX_SUBMIT_MUTATION_ORDER');
    expect(events).toEqual(['request:POST']);

    const [leftFixture, rightFixture] = await Promise.all([
      createBoundRelease(),
      createBoundRelease()
    ]);
    const left = createSubmissionHarness();
    const right = createSubmissionHarness();
    await Promise.all([
      submitVerifiedFirefoxXpi(
        {
          binding: leftFixture.binding,
          transportMode: 'local-private-v1',
          channel: 'listed',
          id: leftFixture.binding.geckoId,
          amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
          submissionSource: leftFixture.sourcePath,
          savedUploadUuidPath: join(leftFixture.releaseDir, 'upload-state.json'),
          downloadDir: leftFixture.downloadDir,
          credentials: { apiKey: 'left-key', apiSecret: 'left-secret' },
          mutationJournal: left.journal
        },
        { SubmitClient: left.SubmitClient }
      ),
      submitVerifiedFirefoxXpi(
        {
          binding: rightFixture.binding,
          transportMode: 'local-private-v1',
          channel: 'listed',
          id: rightFixture.binding.geckoId,
          amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
          submissionSource: rightFixture.sourcePath,
          savedUploadUuidPath: join(rightFixture.releaseDir, 'upload-state.json'),
          downloadDir: rightFixture.downloadDir,
          credentials: { apiKey: 'right-key', apiSecret: 'right-secret' },
          mutationJournal: right.journal
        },
        { SubmitClient: right.SubmitClient }
      )
    ]);
    expect(left.events).toHaveLength(9);
    expect(right.events).toHaveLength(9);
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
    const signAddonImpl = vi.fn();

    await expect(
      submitVerifiedFirefoxXpi(
        {
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
        },
        { signAddonImpl }
      )
    ).rejects.toThrow('FIREFOX_SUBMIT_SOURCE_MISMATCH');
    expect(credentialRead).not.toHaveBeenCalled();
    expect(journal.beforeMutation).not.toHaveBeenCalled();
    expect(journal.afterMutation).not.toHaveBeenCalled();
    expect(signAddonImpl).not.toHaveBeenCalled();
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
    const signAddonImpl = vi.fn();

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
        { signAddonImpl }
      )
    ).rejects.toThrow('FIREFOX_RELEASE_BINDING_DRIFT');
    expect(credentialRead).not.toHaveBeenCalled();
    expect(journal.beforeMutation).not.toHaveBeenCalled();
    expect(journal.afterMutation).not.toHaveBeenCalled();
    expect(signAddonImpl).not.toHaveBeenCalled();
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
    const signAddonImpl = vi.fn();

    await expect(
      submitVerifiedFirefoxXpi(
        {
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
        },
        { signAddonImpl }
      )
    ).rejects.toThrow('FIREFOX_RELEASE_BINDING_INVALID');
    expect(credentialRead).not.toHaveBeenCalled();
    expect(signAddonImpl).not.toHaveBeenCalled();
  });

  it('freezes the bounded production timing constants', () => {
    expect(FIREFOX_SUBMISSION_MUTATIONS).toEqual(['upload', 'version-submit', 'source-patch']);
    expect(FIREFOX_SUBMISSION_LIMITS.validationTotalMs).toBe(600_000);
    expect(FIREFOX_SUBMISSION_LIMITS.approvalTotalMs).toBe(900_000);
    expect(FIREFOX_SUBMISSION_LIMITS.downloadMs).toBe(120_000);
  });
});
