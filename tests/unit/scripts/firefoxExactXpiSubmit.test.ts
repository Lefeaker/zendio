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
  submitVerifiedFirefoxXpi
} from '../../../scripts/utils/firefoxExactXpiSubmit.mjs';

const roots: string[] = [];

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
    const signAddonImpl = vi.fn().mockResolvedValue({ id: 'fixture@example.test' });
    const journal = {
      beforeMutation: vi.fn().mockResolvedValue(undefined),
      afterMutation: vi.fn().mockResolvedValue(undefined)
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
          credentials: { apiKey: 'key', apiSecret: 'secret' },
          mutationJournal: journal
        },
        { signAddonImpl }
      )
    ).resolves.toEqual({ id: 'fixture@example.test' });
    expect(signAddonImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'fixture@example.test',
        xpiPath: fixture.binding.xpiPath,
        approvalCheckTimeout: 0
      })
    );
    expect(journal.beforeMutation).toHaveBeenCalledTimes(1);
    expect(journal.afterMutation).toHaveBeenCalledTimes(1);
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
    expect(FIREFOX_SUBMISSION_LIMITS.validationTotalMs).toBe(600_000);
    expect(FIREFOX_SUBMISSION_LIMITS.approvalTotalMs).toBe(900_000);
    expect(FIREFOX_SUBMISSION_LIMITS.downloadMs).toBe(120_000);
  });
});
