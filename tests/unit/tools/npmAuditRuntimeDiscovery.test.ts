import { EventEmitter } from 'node:events';
import {
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPortableRuntimeFixture } from '../../utils/npmAuditRegressionFixtures';

const modulePath = pathToFileURL(resolve('tools/npm-audit-regression/runtime-discovery.mjs')).href;
const loadRuntimeDiscovery = () => import(modulePath);

describe('portable runtime discovery', () => {
  it('contains no developer-home or implicit command lookup authority', () => {
    const source = readFileSync('tools/npm-audit-regression/runtime-discovery.mjs', 'utf8');
    expect(source).not.toMatch(/\/Users\/[^/]+\/\.nvm/u);
    expect(source).not.toMatch(/\b(?:which|npx)\b/u);
  });

  it('accepts equal bytes under unrelated installation prefixes', async () => {
    const { detectNpmCommand, revalidateRuntime } = await loadRuntimeDiscovery();
    for (const suffix of ['first', 'second']) {
      const root = mkdtempSync(join(tmpdir(), `zendio-runtime-${suffix}-`));
      try {
        const fixture = createPortableRuntimeFixture(root);
        const observed = detectNpmCommand({
          execPath: fixture.nodePath,
          nodeVersion: fixture.policy.nodeVersion,
          policy: fixture.policy,
          environment: {},
          spawnSyncOperation: () => ({
            status: 0,
            stdout: `${fixture.policy.npmVersion}\n`,
            stderr: ''
          })
        });
        expect(observed.runtimePrefix).toBe(realpathSync(root));
        expect(observed.realpath).toBe(realpathSync(fixture.cliPath));
        expect(() => revalidateRuntime(observed)).not.toThrow();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('fails closed on package bytes, runtime version, and post-discovery replacement', async () => {
    const { detectNpmCommand, revalidateRuntime } = await loadRuntimeDiscovery();
    const root = mkdtempSync(join(tmpdir(), 'zendio-runtime-mutation-'));
    try {
      const fixture = createPortableRuntimeFixture(root);
      const options = {
        execPath: fixture.nodePath,
        nodeVersion: fixture.policy.nodeVersion,
        policy: fixture.policy,
        environment: {},
        spawnSyncOperation: () => ({
          status: 0,
          stdout: `${fixture.policy.npmVersion}\n`,
          stderr: ''
        })
      };
      const observed = detectNpmCommand(options);
      writeFileSync(fixture.packagePath, '{}\n');
      expect(() => revalidateRuntime(observed)).toThrow('Evidence changed during operation');
      expect(() => detectNpmCommand(options)).toThrow('RUNTIME_NPM_DIGEST');
      writeFileSync(fixture.packagePath, '{"name":"npm","version":"10.8.2"}\n');
      expect(() => detectNpmCommand({ ...options, nodeVersion: 'wrong-node' })).toThrow(
        'RUNTIME_VERSION_MISMATCH'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['node image', 'nodePath'],
    ['npm CLI', 'cliPath'],
    ['npm package', 'packagePath']
  ])('rejects %s replacement during the version child', async (_label, target) => {
    const { detectNpmCommand } = await loadRuntimeDiscovery();
    const root = mkdtempSync(join(tmpdir(), 'zendio-runtime-version-window-'));
    try {
      const fixture = createPortableRuntimeFixture(root);
      const targetPath =
        target === 'nodePath'
          ? fixture.nodePath
          : target === 'cliPath'
            ? fixture.cliPath
            : fixture.packagePath;
      expect(() =>
        detectNpmCommand({
          execPath: fixture.nodePath,
          nodeVersion: fixture.policy.nodeVersion,
          policy: fixture.policy,
          environment: {},
          spawnSyncOperation: () => {
            writeFileSync(targetPath, 'replacement bytes\n');
            return { status: 0, stdout: `${fixture.policy.npmVersion}\n`, stderr: '' };
          }
        })
      ).toThrow('Evidence changed during operation');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    'NoDe_OpTiOnS',
    'NpM_CoNfIg_ReGiStRy',
    'GiT_DiR',
    'HuSkY',
    'CUSTOM_PRELOAD_PATH',
    'CUSTOM_LOADER_PATH'
  ])('rejects inherited environment key %s case-insensitively', async (key) => {
    const { assertClosedRuntimeEnvironment } = await loadRuntimeDiscovery();
    expect(() => assertClosedRuntimeEnvironment({ [key]: 'hostile' })).toThrow('Forbidden');
  });

  it('rejects node hard links plus npm symlink escape, loop, and foreign ownership', async () => {
    const { detectNpmCommand } = await loadRuntimeDiscovery();
    const root = mkdtempSync(join(tmpdir(), 'zendio-runtime-identity-'));
    try {
      const fixture = createPortableRuntimeFixture(root);
      const options = {
        execPath: fixture.nodePath,
        nodeVersion: fixture.policy.nodeVersion,
        policy: fixture.policy,
        environment: {},
        spawnSyncOperation: () => ({
          status: 0,
          stdout: `${fixture.policy.npmVersion}\n`,
          stderr: ''
        })
      };
      linkSync(fixture.nodePath, join(root, 'node-hardlink'));
      expect(() => detectNpmCommand(options)).toThrow('RUNTIME_NODE_IDENTITY');
      unlinkSync(join(root, 'node-hardlink'));

      const launcher = join(root, 'bin', 'npm');
      unlinkSync(launcher);
      symlinkSync('/private/var/empty/npm-cli.js', launcher);
      expect(() => detectNpmCommand(options)).toThrow('RUNTIME_SYMLINK_ESCAPE');
      unlinkSync(launcher);
      symlinkSync('npm', launcher);
      expect(() => detectNpmCommand(options)).toThrow('RUNTIME_SYMLINK_LOOP');
      unlinkSync(launcher);
      symlinkSync('../lib/node_modules/npm/bin/npm-cli.js', launcher);
      const physicalLauncher = join(realpathSync(join(root, 'bin')), 'npm');
      expect(() =>
        detectNpmCommand({
          ...options,
          lstatOperation: (path: string) => {
            const stats = lstatSync(path);
            return path === physicalLauncher
              ? new Proxy(stats, {
                  get: (target, property) =>
                    property === 'uid' ? 9999 : Reflect.get(target, property)
                })
              : stats;
          }
        })
      ).toThrow('RUNTIME_SYMLINK_OWNER');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects .nvmrc and package engine drift before runtime discovery', async () => {
    const { detectNpmCommand } = await loadRuntimeDiscovery();
    const root = mkdtempSync(join(tmpdir(), 'zendio-runtime-engine-'));
    const project = mkdtempSync(join(tmpdir(), 'zendio-project-engine-'));
    try {
      const fixture = createPortableRuntimeFixture(root);
      const options = {
        execPath: fixture.nodePath,
        nodeVersion: fixture.policy.nodeVersion,
        policy: fixture.policy,
        repositoryRoot: project,
        environment: {},
        spawnSyncOperation: () => ({
          status: 0,
          stdout: `${fixture.policy.npmVersion}\n`,
          stderr: ''
        })
      };
      writeFileSync(join(project, '.nvmrc'), 'wrong\n');
      writeFileSync(
        join(project, 'package.json'),
        '{"engines":{"node":">=20.19 <21","npm":">=10 <11"}}\n'
      );
      expect(() => detectNpmCommand(options)).toThrow('RUNTIME_NVMRC_MISMATCH');
      writeFileSync(join(project, '.nvmrc'), '20.20.2\n');
      writeFileSync(
        join(project, 'package.json'),
        '{"engines":{"node":"wrong","npm":">=10 <11"}}\n'
      );
      expect(() => detectNpmCommand(options)).toThrow('RUNTIME_ENGINE_MISMATCH');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('fails closed after deadline even when TERM produces exit zero, and bounds final drain', async () => {
    const { detectNpmCommand, runNpmAudit } = await loadRuntimeDiscovery();
    const root = mkdtempSync(join(tmpdir(), 'zendio-runtime-timeout-'));
    try {
      const fixture = createPortableRuntimeFixture(root);
      const npmInfo = detectNpmCommand({
        execPath: fixture.nodePath,
        nodeVersion: fixture.policy.nodeVersion,
        policy: fixture.policy,
        environment: {},
        spawnSyncOperation: () => ({
          status: 0,
          stdout: `${fixture.policy.npmVersion}\n`,
          stderr: ''
        })
      });
      class FakeChild extends EventEmitter {
        stdout = new EventEmitter();
        stderr = new EventEmitter();
        constructor(private readonly closes: boolean) {
          super();
        }
        kill(signal: string) {
          if (signal === 'SIGTERM' && this.closes) {
            queueMicrotask(() => {
              this.emit('exit', 0, null);
              this.emit('close');
            });
          }
          return true;
        }
      }
      const invoke = (child: FakeChild) =>
        runNpmAudit({
          root,
          omitDev: false,
          userconfig: join(root, 'userconfig'),
          globalconfig: join(root, 'globalconfig'),
          npmInfo,
          limits: {
            maxReportBytes: 128,
            stderrLimitBytes: 64,
            auditTimeoutMs: 10,
            auditTerminateMs: 30
          },
          spawnOperation: () => child
        });
      await expect(invoke(new FakeChild(true))).rejects.toThrow('bounded timeout');
      await expect(invoke(new FakeChild(false))).rejects.toThrow('did not close');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
