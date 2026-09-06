import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';
import { createSharedFirefoxFixture } from '../../utils/firefoxBrowserInputFixture';
import { runFirefoxXpiSmoke } from '../../../scripts/run-firefox-xpi-smoke.mjs';
import type { runVerifiedFirefoxXpiSmoke } from '../../../scripts/utils/firefoxWebDriverBidiSmokeAdapter.mjs';
import {
  canonicalArtifactJson,
  createFirefoxReleaseArtifactManifest
} from '../../../scripts/utils/firefoxReleaseArtifactManifest.mjs';
import {
  STANDALONE_SYNTHETIC_CONFIG,
  validateReleasePublicBuildConfig
} from '../../../scripts/utils/releasePublicBuildConfig.mjs';

const roots: string[] = [];

function fixtureIdentity() {
  const raw = {
    ZENDIO_GA_MEASUREMENT_ID: STANDALONE_SYNTHETIC_CONFIG.measurementId,
    ZENDIO_GA_PROXY_ENDPOINT: STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint,
    ZENDIO_GA_TRANSPORT_MODE: 'proxy'
  };
  const publicConfig = validateReleasePublicBuildConfig({
    configMode: 'standalone-synthetic',
    environment: raw
  });
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
      amoClient: 'direct-v5',
      bidiAdapter: 'webdriver-bidi-v1',
      geckodriver: '0.37.1',
      ws: '8.21.0',
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
      configMode: 'standalone-synthetic'
    }
  };
}

async function createAttempt() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'zendio-firefox-smoke-wrapper-')));
  roots.push(root);
  const releaseDir = join(root, 'release');
  const distDir = join(root, 'dist');
  const sourceDir = join(root, 'source');
  const browserRoot = join(root, 'playwright-browsers');
  const driverRoot = join(root, 'geckodriver');
  await Promise.all(
    [releaseDir, distDir, sourceDir, browserRoot, driverRoot].map((path) =>
      mkdir(path, { mode: 0o700 })
    )
  );
  const identity = fixtureIdentity();
  const extensionManifest = `${JSON.stringify({
    name: 'fixture',
    version: identity.packageMetadata.version,
    browser_specific_settings: { gecko: { id: identity.packageMetadata.geckoId } }
  })}\n`;
  await writeFile(join(distDir, 'manifest.json'), extensionManifest);
  await writeFile(join(sourceDir, 'README.md'), '# source\n');
  const xpiPath = join(releaseDir, 'fixture.xpi');
  const sourcePath = join(releaseDir, 'fixture-source.zip');
  await writeFile(
    xpiPath,
    buildZipFixture([{ path: 'manifest.json', content: extensionManifest }]),
    { mode: 0o600 }
  );
  await writeFile(sourcePath, buildZipFixture([{ path: 'README.md', content: '# source\n' }]), {
    mode: 0o600
  });
  const manifest = await createFirefoxReleaseArtifactManifest({
    releaseDir,
    distDir,
    xpiPath,
    sourceArchivePath: sourcePath,
    ...identity
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  await writeFile(manifestPath, canonicalArtifactJson(manifest), { mode: 0o600 });
  const firefoxExecutable = join(browserRoot, 'firefox', 'firefox');
  await mkdir(join(browserRoot, 'firefox'), { mode: 0o700 });
  await writeFile(firefoxExecutable, 'fixture-firefox\n', { mode: 0o700 });
  const geckodriverExecutable = join(driverRoot, 'geckodriver');
  await writeFile(geckodriverExecutable, 'fixture-geckodriver\n', { mode: 0o700 });
  return {
    root,
    browserRoot,
    manifestPath,
    firefoxExecutable,
    geckodriverExecutable,
    resultPath: join(root, 'smoke-result.json')
  };
}

function setAttemptEnvironment(root: string, browserRoot: string) {
  process.env.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT = root;
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserRoot;
}

afterEach(async () => {
  delete process.env.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT;
  delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  delete process.env.WEB_EXT_API_SECRET;
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Firefox exact-XPI smoke command wrapper', () => {
  it('uses only the current attempt browser and geckodriver, then publishes a private result', async () => {
    const attempt = await createAttempt();
    setAttemptEnvironment(attempt.root, attempt.browserRoot);
    process.env.WEB_EXT_API_SECRET = 'must-not-cross-smoke-boundary';
    const result = {
      schema: 'firefox-exact-xpi-smoke-v2',
      adapter: 'webdriver-bidi-v1',
      geckoId: 'fixture@example.test',
      installed: true,
      bootstrapped: true,
      uninstalled: true,
      reinstalled: true,
      rebootstrapped: true
    };
    const runVerifiedFirefoxXpiSmoke = vi.fn().mockResolvedValue(result);

    await expect(
      runFirefoxXpiSmoke(
        [
          '--manifest',
          attempt.manifestPath,
          '--transport-mode',
          'local-private-v1',
          '--result-json',
          attempt.resultPath
        ],
        {
          importPlaywrightImpl: () =>
            Promise.resolve({ firefox: { executablePath: () => attempt.firefoxExecutable } }),
          importAdapterImpl: () => Promise.resolve({ runVerifiedFirefoxXpiSmoke })
        }
      )
    ).resolves.toEqual(result);
    expect(runVerifiedFirefoxXpiSmoke).toHaveBeenCalledWith(
      expect.objectContaining({
        firefoxExecutable: attempt.firefoxExecutable,
        geckodriverExecutable: attempt.geckodriverExecutable,
        profileRoot: join(attempt.root, 'firefox-xpi-smoke-profile-root'),
        transportMode: 'local-private-v1'
      })
    );
    expect(runVerifiedFirefoxXpiSmoke.mock.calls[0]?.[0]?.driverEnvironment).toEqual({
      CI: '1',
      HOME: join(attempt.root, 'home'),
      LANG: 'C',
      LC_ALL: 'C',
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      PLAYWRIGHT_BROWSERS_PATH: attempt.browserRoot,
      TEMP: join(attempt.root, 'tmp'),
      TMP: join(attempt.root, 'tmp'),
      TMPDIR: join(attempt.root, 'tmp'),
      TZ: 'UTC'
    });
    expect(runVerifiedFirefoxXpiSmoke.mock.calls[0]?.[0]?.driverEnvironment).not.toHaveProperty(
      'WEB_EXT_API_SECRET'
    );
    expect(process.env.WEB_EXT_API_SECRET).toBe('must-not-cross-smoke-boundary');
    expect(JSON.parse(await readFile(attempt.resultPath, 'utf8'))).toEqual(result);
    expect((await lstat(attempt.resultPath)).mode & 0o777).toBe(0o600);
  });

  it('rejects a geckodriver that is not private and executable', async () => {
    const attempt = await createAttempt();
    setAttemptEnvironment(attempt.root, attempt.browserRoot);
    await chmod(attempt.geckodriverExecutable, 0o600);
    const runVerifiedFirefoxXpiSmoke = vi.fn();
    await expect(
      runFirefoxXpiSmoke(
        [
          '--manifest',
          attempt.manifestPath,
          '--transport-mode',
          'local-private-v1',
          '--result-json',
          attempt.resultPath
        ],
        {
          importPlaywrightImpl: () =>
            Promise.resolve({ firefox: { executablePath: () => attempt.firefoxExecutable } }),
          importAdapterImpl: () => Promise.resolve({ runVerifiedFirefoxXpiSmoke })
        }
      )
    ).rejects.toThrow('FIREFOX_SMOKE_GECKODRIVER');
    expect(runVerifiedFirefoxXpiSmoke).not.toHaveBeenCalled();
  });

  it('rejects a result path outside the current release attempt', async () => {
    const attempt = await createAttempt();
    setAttemptEnvironment(attempt.root, attempt.browserRoot);
    await expect(
      runFirefoxXpiSmoke(
        [
          '--manifest',
          attempt.manifestPath,
          '--transport-mode',
          'local-private-v1',
          '--result-json',
          join(tmpdir(), 'outside-firefox-smoke.json')
        ],
        {
          importPlaywrightImpl: vi.fn(),
          importAdapterImpl: vi.fn()
        }
      )
    ).rejects.toThrow('FIREFOX_SMOKE_PATH_ESCAPE');
  });
});

describe('shared readonly Firefox smoke wrapper', () => {
  async function fixture() {
    const attempt = await createAttempt();
    const cacheRoot = await realpath(await mkdtemp(join(tmpdir(), 'zendio-firefox-shared-')));
    roots.push(cacheRoot);
    const cache = createSharedFirefoxFixture(cacheRoot);
    setAttemptEnvironment(attempt.root, cache.browsersPath);
    const args = [
      '--manifest',
      attempt.manifestPath,
      '--transport-mode',
      'local-private-v1',
      '--result-json',
      attempt.resultPath
    ];
    return { attempt, cache, args };
  }

  it('binds the registered executable and keeps fresh home, temp, profile and result in the attempt', async () => {
    const { attempt, cache, args } = await fixture();
    vi.stubEnv('HOME', join(attempt.root, 'home'));
    const adapter = vi.fn<typeof runVerifiedFirefoxXpiSmoke>().mockResolvedValue({
      schema: 'firefox-exact-xpi-smoke-v2',
      adapter: 'webdriver-bidi-v1',
      geckoId: 'fixture@example.test',
      installed: true,
      bootstrapped: true,
      uninstalled: true,
      reinstalled: true,
      rebootstrapped: true
    });
    await runFirefoxXpiSmoke(args, {
      browserInputOperations: cache.operations,
      importPlaywrightImpl: () =>
        Promise.resolve({
          firefox: { executablePath: () => cache.firefoxExecutable }
        }),
      importAdapterImpl: () => Promise.resolve({ runVerifiedFirefoxXpiSmoke: adapter })
    });
    const supplied = adapter.mock.calls[0]?.[0];
    expect(supplied?.firefoxExecutable).toBe(cache.firefoxExecutable);
    expect(supplied?.browserInput).toMatchObject({
      mode: 'shared-readonly',
      browserVersion: '150.0.2'
    });
    expect(supplied?.driverEnvironment).toMatchObject({
      HOME: join(attempt.root, 'home'),
      TMPDIR: join(attempt.root, 'tmp'),
      PLAYWRIGHT_BROWSERS_PATH: cache.browsersPath
    });
    expect(supplied?.profileRoot).toBe(join(attempt.root, 'firefox-xpi-smoke-profile-root'));
    expect((await lstat(join(attempt.root, 'home'))).mode & 0o777).toBe(0o700);
    expect((await lstat(join(attempt.root, 'tmp'))).mode & 0o777).toBe(0o700);
    expect((await lstat(attempt.resultPath)).mode & 0o777).toBe(0o600);
  });

  it.each(['wrong-executable', 'replaced-executable'])(
    'rejects %s between validation and adapter launch',
    async (failure) => {
      const { cache, args } = await fixture();
      const adapter = vi.fn();
      await expect(
        runFirefoxXpiSmoke(args, {
          browserInputOperations: cache.operations,
          importPlaywrightImpl: async () => {
            if (failure === 'replaced-executable') {
              const bytes = await readFile(cache.firefoxExecutable);
              bytes[32] = 1;
              await writeFile(cache.firefoxExecutable, bytes);
            }
            return {
              firefox: {
                executablePath: () =>
                  failure === 'wrong-executable'
                    ? join(cache.revisionRoot, 'other-firefox')
                    : cache.firefoxExecutable
              }
            };
          },
          importAdapterImpl: () => Promise.resolve({ runVerifiedFirefoxXpiSmoke: adapter })
        })
      ).rejects.toThrow(
        failure === 'wrong-executable'
          ? 'FIREFOX_SMOKE_EXECUTABLE'
          : 'PLAYWRIGHT_SHARED_IDENTITY_CHANGED'
      );
      expect(adapter).not.toHaveBeenCalled();
    }
  );

  it('rejects genuine CI before creating private state', async () => {
    const { attempt, cache, args } = await fixture();
    vi.stubEnv('CI', 'true');
    await expect(
      runFirefoxXpiSmoke(args, { browserInputOperations: cache.operations })
    ).rejects.toThrow('PLAYWRIGHT_SHARED_CONTEXT_INVALID');
    await expect(lstat(join(attempt.root, 'home'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a symlinked result parent and reused writable home', async () => {
    const { attempt, cache, args } = await fixture();
    const outputLink = join(attempt.root, 'output-link');
    await symlink(cache.browsersPath, outputLink);
    await expect(
      runFirefoxXpiSmoke([...args.slice(0, 5), join(outputLink, 'result.json')], {
        browserInputOperations: cache.operations
      })
    ).rejects.toThrow('FIREFOX_SMOKE_PATH_ESCAPE');
    await mkdir(join(attempt.root, 'home'), { mode: 0o700 });
    await expect(
      runFirefoxXpiSmoke(args, { browserInputOperations: cache.operations })
    ).rejects.toThrow('FIREFOX_SMOKE_PRIVATE_ROOT_EXISTS');
  });
});
