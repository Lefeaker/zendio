import { EventEmitter } from 'node:events';
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
  FIREFOX_XPI_SMOKE_TIMEOUTS,
  runVerifiedFirefoxXpiSmoke
} from '../../../scripts/utils/webExtFirefoxSmokeAdapter.mjs';

const roots: string[] = [];

async function mintBinding(root: string) {
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
    git: { head: 'a'.repeat(40), tree: 'b'.repeat(40) },
    packageMetadata: { version: '1', manifestVersion: '1', geckoId: 'fixture@example.test' },
    toolchain: {},
    gaConfig: {},
    buildEnvironment: {}
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  await writeFile(manifestPath, canonicalArtifactJson(manifest), { mode: 0o600 });
  return verifyFirefoxReleaseArtifactManifest({
    manifestPath,
    transportMode: 'local-private-v1',
    expectedAttemptRoot: root
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('exact-XPI Firefox smoke adapter', () => {
  it('uses the pinned runner seam and closes the managed Firefox before profile cleanup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zendio-firefox-smoke-'));
    roots.push(root);
    const binding = await mintBinding(root);
    const child = new EventEmitter();
    const kill = vi.fn(() => true);
    Object.assign(child, { pid: 1234, kill });
    const remoteFirefox = {
      installTemporaryAddon: vi.fn().mockResolvedValue({ id: binding.geckoId }),
      getInstalledAddon: vi
        .fn()
        .mockResolvedValue({ id: binding.geckoId, temporarilyInstalled: true }),
      reloadAddon: vi.fn().mockResolvedValue(undefined)
    };
    const exit = vi.fn(() => {
      queueMicrotask(() => child.emit('close', 0, null));
      return Promise.resolve();
    });
    const webExt = {
      cmd: {
        run: vi.fn().mockResolvedValue({
          extensionRunners: [{ remoteFirefox, runningInfo: { firefox: child }, exit }]
        })
      }
    };
    const profilePath = join(root, 'profile');

    await expect(
      runVerifiedFirefoxXpiSmoke(
        {
          binding,
          firefoxExecutable: '/private/firefox',
          profilePath,
          bootstrapSourceDir: '/private/bootstrap',
          transportMode: 'local-private-v1'
        },
        { webExt }
      )
    ).resolves.toMatchObject({ temporarilyInstalled: true, reloaded: true });
    expect(webExt.cmd.run).toHaveBeenCalledWith(
      expect.objectContaining({
        firefox: '/private/firefox',
        args: ['-headless'],
        firefoxProfile: profilePath,
        keepProfileChanges: true
      }),
      { shouldExitProgram: false }
    );
    expect(remoteFirefox.installTemporaryAddon).toHaveBeenCalledWith(binding.xpiPath);
    expect(remoteFirefox.reloadAddon).toHaveBeenCalledWith(binding.geckoId);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(kill).not.toHaveBeenCalled();
    expect(child.listenerCount('close')).toBe(0);
    await expect(
      import('node:fs/promises').then(({ lstat }) => lstat(profilePath))
    ).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('rejects a relative Firefox executable before launching web-ext', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zendio-firefox-smoke-relative-'));
    roots.push(root);
    const binding = await mintBinding(root);
    const run = vi.fn();

    await expect(
      runVerifiedFirefoxXpiSmoke(
        {
          binding,
          firefoxExecutable: 'relative/firefox',
          profilePath: join(root, 'profile'),
          bootstrapSourceDir: '/private/bootstrap',
          transportMode: 'local-private-v1'
        },
        { webExt: { cmd: { run } } }
      )
    ).rejects.toThrow('FIREFOX_SMOKE_EXECUTABLE');
    expect(run).not.toHaveBeenCalled();
  });

  it('fails when the managed Firefox closes during XPI installation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zendio-firefox-smoke-early-close-'));
    roots.push(root);
    const binding = await mintBinding(root);
    const child = new EventEmitter();
    const kill = vi.fn(() => true);
    Object.assign(child, { pid: 1234, kill });
    const installTemporaryAddon = vi.fn(
      () =>
        new Promise((resolve) => {
          queueMicrotask(() => child.emit('close', 1, null));
          queueMicrotask(() => resolve({ id: binding.geckoId }));
        })
    );
    const getInstalledAddon = vi.fn();
    const reloadAddon = vi.fn();
    const exit = vi.fn().mockResolvedValue(undefined);
    const profilePath = join(root, 'profile');

    await expect(
      runVerifiedFirefoxXpiSmoke(
        {
          binding,
          firefoxExecutable: '/private/firefox',
          profilePath,
          bootstrapSourceDir: '/private/bootstrap',
          transportMode: 'local-private-v1'
        },
        {
          webExt: {
            cmd: {
              run: vi.fn().mockResolvedValue({
                extensionRunners: [
                  {
                    remoteFirefox: {
                      installTemporaryAddon,
                      getInstalledAddon,
                      reloadAddon
                    },
                    runningInfo: { firefox: child },
                    exit
                  }
                ]
              })
            }
          }
        }
      )
    ).rejects.toThrow('FIREFOX_SMOKE_PROCESS_CLOSED');
    expect(getInstalledAddon).not.toHaveBeenCalled();
    expect(reloadAddon).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(kill).not.toHaveBeenCalled();
    await expect(
      import('node:fs/promises').then(({ lstat }) => lstat(profilePath))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('freezes the production timeout contract', () => {
    expect(FIREFOX_XPI_SMOKE_TIMEOUTS).toEqual({
      launchMs: 120_000,
      installMs: 60_000,
      queryMs: 30_000,
      reloadMs: 30_000,
      exitMs: 30_000,
      gracefulCloseMs: 20_000,
      forcedCloseMs: 10_000,
      cleanupMs: 30_000,
      wholeMs: 420_000
    });
  });
});
