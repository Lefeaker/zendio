import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { chmod, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';
import {
  canonicalArtifactJson,
  createFirefoxReleaseArtifactManifest,
  verifyFirefoxReleaseArtifactManifest
} from '../../../scripts/utils/firefoxReleaseArtifactManifest.mjs';
import {
  FIREFOX_WEBDRIVER_BIDI_SMOKE_SCHEMA,
  runVerifiedFirefoxXpiSmoke
} from '../../../scripts/utils/firefoxWebDriverBidiSmokeAdapter.mjs';
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
      bidiAdapter: FIREFOX_WEBDRIVER_BIDI_SMOKE_SCHEMA,
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

async function mintBinding(root: string) {
  const releaseDir = join(root, 'release');
  const distDir = join(root, 'dist');
  const sourceDir = join(root, 'source');
  const identity = fixtureIdentity();
  await Promise.all([releaseDir, distDir, sourceDir].map((path) => mkdir(path, { mode: 0o700 })));
  const extensionManifest = `${JSON.stringify({
    name: 'fixture',
    version: identity.packageMetadata.version,
    browser_specific_settings: { gecko: { id: 'fixture@example.test' } }
  })}\n`;
  await writeFile(join(distDir, 'manifest.json'), extensionManifest);
  await writeFile(join(sourceDir, 'README.md'), '# source\n');
  const xpiPath = join(releaseDir, 'fixture.xpi');
  const sourcePath = join(releaseDir, 'fixture-source.zip');
  await writeFile(
    xpiPath,
    buildZipFixture([{ path: 'manifest.json', content: extensionManifest }])
  );
  await writeFile(sourcePath, buildZipFixture([{ path: 'README.md', content: '# source\n' }]));
  await chmod(xpiPath, 0o600);
  await chmod(sourcePath, 0o600);
  const manifest = await createFirefoxReleaseArtifactManifest({
    releaseDir,
    distDir,
    xpiPath,
    sourceArchivePath: sourcePath,
    ...identity
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  await writeFile(manifestPath, canonicalArtifactJson(manifest), { mode: 0o600 });
  return verifyFirefoxReleaseArtifactManifest({
    manifestPath,
    transportMode: 'local-private-v1',
    expectedAttemptRoot: root
  });
}

function createDriverEnvironment(root: string) {
  return {
    CI: '1',
    HOME: join(root, 'home'),
    LANG: 'C',
    LC_ALL: 'C',
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    PLAYWRIGHT_BROWSERS_PATH: join(root, 'playwright-browsers'),
    TEMP: join(root, 'tmp'),
    TMP: join(root, 'tmp'),
    TMPDIR: join(root, 'tmp'),
    TZ: 'UTC'
  };
}

class FakeChild extends EventEmitter {
  pid = 4321;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = new PassThrough();
  stderr = new PassThrough();

  finish(signal: NodeJS.Signals | null = 'SIGTERM') {
    if (this.exitCode != null || this.signalCode != null) return;
    this.signalCode = signal;
    queueMicrotask(() => this.emit('close', null, signal));
  }
}

type CommandResponse =
  | { type: 'success'; result: Record<string, unknown> }
  | { type: 'error'; error: string };

type AddonIdentity = {
  id: string;
  version: string;
  isActive: boolean;
  appDisabled: boolean;
  userDisabled: boolean;
};

function createFakeWebSocket(commandResponses: CommandResponse[], commands: string[]) {
  return class FakeWebSocket extends EventEmitter {
    readyState = 0;

    constructor(readonly url: string) {
      super();
      queueMicrotask(() => {
        this.readyState = 1;
        this.emit('open');
      });
    }

    send(serialized: string, callback: (error?: Error) => void) {
      const command = JSON.parse(serialized);
      commands.push(command.method);
      const response = commandResponses.shift();
      if (!response) {
        callback(new Error('missing fake response'));
        return;
      }
      callback();
      queueMicrotask(() =>
        this.emit(
          'message',
          Buffer.from(
            JSON.stringify(
              response.type === 'success'
                ? { id: command.id, type: 'success', result: response.result }
                : { id: command.id, type: 'error', error: response.error }
            )
          )
        )
      );
    }

    close() {
      this.readyState = 3;
      queueMicrotask(() => this.emit('close'));
    }
  };
}

function createHarness(
  geckoId: string,
  commandResponses: CommandResponse[] = [
    { type: 'success', result: { ready: false, message: 'session active' } },
    { type: 'success', result: { extension: geckoId } },
    { type: 'success', result: {} },
    { type: 'success', result: { extension: geckoId } }
  ],
  addonResponses: Array<AddonIdentity | null> = [
    {
      id: geckoId,
      version: '0.2.1',
      isActive: true,
      appDisabled: false,
      userDisabled: false
    },
    {
      id: geckoId,
      version: '0.2.1',
      isActive: true,
      appDisabled: false,
      userDisabled: false
    }
  ]
) {
  const child = new FakeChild();
  const commands: string[] = [];
  const webdriverEvents: string[] = [];
  const allocatePortImpl = vi
    .fn<() => Promise<number>>()
    .mockResolvedValueOnce(4444)
    .mockResolvedValueOnce(9222);
  const fetchImpl = vi.fn((url: URL | string, init?: RequestInit): Promise<Response> => {
    const target = new URL(url);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && target.pathname === '/status') {
      return Promise.resolve(
        new Response(JSON.stringify({ value: { ready: true } }), { status: 200 })
      );
    }
    if (method === 'POST' && target.pathname === '/session') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            value: {
              sessionId: 'session-fixture',
              capabilities: { webSocketUrl: 'ws://127.0.0.1:9222/session/session-fixture' }
            }
          }),
          { status: 200 }
        )
      );
    }
    if (method === 'POST' && target.pathname.endsWith('/moz/context')) {
      const body = JSON.parse(String(init?.body));
      webdriverEvents.push(`context:${body.context}`);
      return Promise.resolve(new Response(JSON.stringify({ value: null }), { status: 200 }));
    }
    if (method === 'POST' && target.pathname.endsWith('/execute/async')) {
      webdriverEvents.push('execute:addon-manager');
      return Promise.resolve(
        new Response(JSON.stringify({ value: addonResponses.shift() ?? null }), { status: 200 })
      );
    }
    if (method === 'DELETE' && target.pathname === '/session/session-fixture') {
      return Promise.resolve(new Response(JSON.stringify({ value: null }), { status: 200 }));
    }
    throw new Error(`unexpected webdriver request: ${method} ${target.href}`);
  });
  const killProcessGroupImpl = vi.fn((_pid: number, signal: NodeJS.Signals) => {
    child.finish(signal);
    return true;
  });
  return {
    child,
    commands,
    webdriverEvents,
    dependencies: {
      allocatePortImpl,
      fetchImpl,
      spawnImpl: vi.fn(() => child),
      WebSocketImpl: createFakeWebSocket(commandResponses, commands),
      killProcessGroupImpl,
      sleepImpl: () => Promise.resolve()
    },
    fetchImpl,
    killProcessGroupImpl
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('exact-XPI Firefox WebDriver BiDi smoke adapter', () => {
  it('installs, proves identity, uninstalls and reinstalls before bounded shutdown', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'zendio-firefox-bidi-smoke-')));
    roots.push(root);
    const binding = await mintBinding(root);
    const harness = createHarness(binding.geckoId);
    const profileRoot = join(root, 'profile-root');

    await expect(
      runVerifiedFirefoxXpiSmoke(
        {
          binding,
          firefoxExecutable: '/private/firefox',
          geckodriverExecutable: join(root, 'geckodriver', 'geckodriver'),
          profileRoot,
          transportMode: 'local-private-v1',
          driverEnvironment: createDriverEnvironment(root)
        },
        harness.dependencies
      )
    ).resolves.toEqual({
      schema: 'firefox-exact-xpi-smoke-v2',
      adapter: FIREFOX_WEBDRIVER_BIDI_SMOKE_SCHEMA,
      geckoId: binding.geckoId,
      installed: true,
      bootstrapped: true,
      uninstalled: true,
      reinstalled: true,
      rebootstrapped: true
    });
    expect(harness.commands).toEqual([
      'session.status',
      'webExtension.install',
      'webExtension.uninstall',
      'webExtension.install'
    ]);
    expect(harness.webdriverEvents).toEqual([
      'context:chrome',
      'execute:addon-manager',
      'context:content',
      'context:chrome',
      'execute:addon-manager',
      'context:content'
    ]);
    expect(harness.killProcessGroupImpl).toHaveBeenCalledWith(-4321, 'SIGTERM');
    expect(harness.dependencies.spawnImpl).toHaveBeenCalledWith(
      join(root, 'geckodriver', 'geckodriver'),
      expect.arrayContaining(['--allow-system-access']),
      expect.objectContaining({ env: createDriverEnvironment(root) })
    );
    await expect(lstat(profileRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails when the first installed identity does not match the release Gecko id', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'zendio-firefox-bidi-id-')));
    roots.push(root);
    const binding = await mintBinding(root);
    const harness = createHarness(binding.geckoId, [
      { type: 'success', result: { ready: false } },
      { type: 'success', result: { extension: 'other@example.test' } }
    ]);
    await expect(
      runVerifiedFirefoxXpiSmoke(
        {
          binding,
          firefoxExecutable: '/private/firefox',
          geckodriverExecutable: join(root, 'geckodriver', 'geckodriver'),
          profileRoot: join(root, 'profile-root'),
          transportMode: 'local-private-v1',
          driverEnvironment: createDriverEnvironment(root)
        },
        harness.dependencies
      )
    ).rejects.toThrow('FIREFOX_SMOKE_ADDON_ID');
    expect(harness.killProcessGroupImpl).toHaveBeenCalled();
  });

  it('propagates a BiDi uninstall failure and admits no reinstall', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'zendio-firefox-bidi-error-')));
    roots.push(root);
    const binding = await mintBinding(root);
    const harness = createHarness(binding.geckoId, [
      { type: 'success', result: { ready: false } },
      { type: 'success', result: { extension: binding.geckoId } },
      { type: 'error', error: 'invalid argument' }
    ]);
    await expect(
      runVerifiedFirefoxXpiSmoke(
        {
          binding,
          firefoxExecutable: '/private/firefox',
          geckodriverExecutable: join(root, 'geckodriver', 'geckodriver'),
          profileRoot: join(root, 'profile-root'),
          transportMode: 'local-private-v1',
          driverEnvironment: createDriverEnvironment(root)
        },
        harness.dependencies
      )
    ).rejects.toThrow('FIREFOX_SMOKE_BIDI_COMMAND:invalid argument');
    expect(harness.commands).toEqual([
      'session.status',
      'webExtension.install',
      'webExtension.uninstall'
    ]);
  });

  it('fails closed when the installed extension never proves its runtime identity', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'zendio-firefox-bidi-bootstrap-')));
    roots.push(root);
    const binding = await mintBinding(root);
    const harness = createHarness(
      binding.geckoId,
      [
        { type: 'success', result: { ready: false } },
        { type: 'success', result: { extension: binding.geckoId } }
      ],
      [null]
    );
    let now = 0;
    const dependencies = {
      ...harness.dependencies,
      now: () => now,
      sleepImpl: () => {
        now += 60_000;
        return Promise.resolve();
      }
    };
    await expect(
      runVerifiedFirefoxXpiSmoke(
        {
          binding,
          firefoxExecutable: '/private/firefox',
          geckodriverExecutable: join(root, 'geckodriver', 'geckodriver'),
          profileRoot: join(root, 'profile-root'),
          transportMode: 'local-private-v1',
          driverEnvironment: createDriverEnvironment(root)
        },
        dependencies
      )
    ).rejects.toThrow('FIREFOX_SMOKE_BOOTSTRAP_IDENTITY_TIMEOUT');
    expect(harness.commands).toEqual(['session.status', 'webExtension.install']);
    expect(harness.webdriverEvents).toEqual([
      'context:chrome',
      'execute:addon-manager',
      'context:content'
    ]);
  });

  it('fails closed when geckodriver exits before the WebDriver session starts', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'zendio-firefox-driver-close-')));
    roots.push(root);
    const binding = await mintBinding(root);
    const harness = createHarness(binding.geckoId);
    harness.child.stderr.end('driver failed');
    harness.dependencies.spawnImpl = vi.fn(() => {
      queueMicrotask(() => harness.child.finish('SIGTERM'));
      return harness.child;
    });
    await expect(
      runVerifiedFirefoxXpiSmoke(
        {
          binding,
          firefoxExecutable: '/private/firefox',
          geckodriverExecutable: join(root, 'geckodriver', 'geckodriver'),
          profileRoot: join(root, 'profile-root'),
          transportMode: 'local-private-v1',
          driverEnvironment: createDriverEnvironment(root)
        },
        harness.dependencies
      )
    ).rejects.toThrow('FIREFOX_SMOKE_DRIVER_CLOSED');
  });

  it('requires the provisioned geckodriver to belong to the current attempt root', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'zendio-firefox-driver-path-')));
    roots.push(root);
    const binding = await mintBinding(root);
    const spawnImpl = vi.fn();
    await expect(
      runVerifiedFirefoxXpiSmoke(
        {
          binding,
          firefoxExecutable: '/private/firefox',
          geckodriverExecutable: '/private/geckodriver',
          profileRoot: join(root, 'profile-root'),
          transportMode: 'local-private-v1',
          driverEnvironment: createDriverEnvironment(root)
        },
        { spawnImpl }
      )
    ).rejects.toThrow('FIREFOX_SMOKE_EXECUTABLE');
    expect(spawnImpl).not.toHaveBeenCalled();
  });
});
