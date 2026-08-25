import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LOCKED_DEPENDENCY_CRUISER,
  RELEASE_BUILD_FORBIDDEN_KEYS,
  STANDALONE_SYNTHETIC_CONFIG,
  runIsolatedReleaseBuild,
  runLockedDependencyCruiser,
  validateReleasePublicBuildConfig
} from '../../../scripts/utils/releasePublicBuildConfig.mjs';
import { runDependencyCruiserReport } from '../../../tools/report-dependency-cruiser-coverage.mjs';

const roots: string[] = [];

function write(root: string, path: string, contents: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
}

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'zendio-cruiser-runtime-'));
  roots.push(root);
  write(
    root,
    'package.json',
    JSON.stringify({ devDependencies: { 'dependency-cruiser': '16.10.4' }, scripts: {} })
  );
  write(
    root,
    'package-lock.json',
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { devDependencies: { 'dependency-cruiser': '16.10.4' } },
        'node_modules/dependency-cruiser': { version: '16.10.4' }
      }
    })
  );
  write(root, '.dependency-cruiser.cjs', 'module.exports = { forbidden: [] };\n');
  write(
    root,
    'node_modules/dependency-cruiser/package.json',
    JSON.stringify({
      name: 'dependency-cruiser',
      version: '16.10.4',
      bin: { 'dependency-cruiser': 'bin/dependency-cruise.mjs' }
    })
  );
  write(root, LOCKED_DEPENDENCY_CRUISER.packageRelativeCli, 'console.log("fixture");\n');
  return root;
}

function headReader(root: string) {
  return (_repoRoot: string, relativePath: string): Buffer =>
    readFileSync(join(root, relativePath));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('locked dependency-cruiser runtime', () => {
  it('is import-safe when argv[1] is absent', async () => {
    const original = [...process.argv];
    process.argv.splice(1);
    try {
      await expect(
        import(
          `${pathToFileURL(resolve('scripts/utils/releasePublicBuildConfig.mjs')).href}?safe=${Date.now()}`
        )
      ).resolves.toHaveProperty('runLockedDependencyCruiser');
    } finally {
      process.argv.splice(0, process.argv.length, ...original);
    }
  });

  it('uses the exact direct Node CLI with a closed environment', () => {
    const root = createRepository();
    const spawn = vi.fn(
      (
        _command: string,
        _args: readonly string[],
        _options: Readonly<Record<string, unknown>>
      ) => ({
        status: 0,
        signal: null,
        stdout: Buffer.from('{"modules":[],"summary":{"totalDependenciesCruised":0}}'),
        stderr: Buffer.alloc(0)
      })
    );
    const result = runLockedDependencyCruiser(
      { repoRoot: root, environment: { HOME: join(root, 'home'), NODE_OPTIONS: '--require bad' } },
      { readHeadFile: headReader(root), spawnSync: spawn }
    );
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    const call = spawn.mock.calls[0];
    if (!call) throw new Error('DEPENDENCY_CRUISER_SPAWN_NOT_OBSERVED');
    const [command, args, options] = call;
    const canonicalRoot = realpathSync(root);
    expect(command).toBe(process.execPath);
    expect(args.slice(1)).toEqual(LOCKED_DEPENDENCY_CRUISER.argv);
    expect(args[0]).toBe(join(canonicalRoot, LOCKED_DEPENDENCY_CRUISER.packageRelativeCli));
    expect(options.cwd).toBe(canonicalRoot);
    expect(options.shell).toBe(false);
    expect(options.env).not.toHaveProperty('NODE_OPTIONS');
    expect(options.env).not.toHaveProperty('npm_config_registry');
  });

  it('rejects dependency projection, lock, config, and installed CLI drift before spawn', () => {
    for (const mutation of [
      (root: string) => write(root, 'package.json', JSON.stringify({ devDependencies: {} })),
      (root: string) =>
        write(root, 'package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: {} })),
      (root: string) => write(root, '.dependency-cruiser.cjs', 'module.exports = {};\n'),
      (root: string) => write(root, 'node_modules/dependency-cruiser/package.json', '{}')
    ]) {
      const root = createRepository();
      const frozen = new Map(
        ['package.json', 'package-lock.json', '.dependency-cruiser.cjs'].map((path) => [
          path,
          readFileSync(join(root, path))
        ])
      );
      mutation(root);
      const spawn = vi.fn();
      expect(() =>
        runLockedDependencyCruiser(
          { repoRoot: root },
          {
            readHeadFile: (_repoRoot, path) => frozen.get(path) ?? Buffer.alloc(0),
            spawnSync: spawn
          }
        )
      ).toThrow(/DEPENDENCY_CRUISER_/u);
      expect(spawn).not.toHaveBeenCalled();
    }
  });

  it('keeps the input-json report path child-free', () => {
    const root = createRepository();
    const input = join(root, 'result.json');
    write(
      root,
      'result.json',
      JSON.stringify({
        modules: Array.from({ length: 400 }, (_, index) => ({ source: String(index) })),
        summary: { totalDependenciesCruised: 300, violations: [] }
      })
    );
    const child = vi.fn();
    const report = runDependencyCruiserReport(['--input-json', input], {
      runLockedDependencyCruiser: child
    });
    expect(report.failures).toEqual([]);
    expect(child).not.toHaveBeenCalled();
  });

  it('validates the synthetic public config without reading ambient values', () => {
    const result = validateReleasePublicBuildConfig({
      configMode: 'standalone-synthetic',
      environment: {
        ZENDIO_GA_MEASUREMENT_ID: STANDALONE_SYNTHETIC_CONFIG.measurementId,
        ZENDIO_GA_TRANSPORT_MODE: STANDALONE_SYNTHETIC_CONFIG.transportMode,
        ZENDIO_GA_PROXY_ENDPOINT: STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint
      }
    });
    expect(result).toMatchObject({
      configMode: 'standalone-synthetic',
      artifactConfigEligible: false
    });
    expect(result.policy).toMatchObject({ id: 'release-build-env-v1' });
    expect(result.esbuild).toMatchObject({
      platform: process.platform,
      architecture: process.arch
    });
  });

  it('rejects every forbidden release semantic input by own-property presence', () => {
    for (const key of RELEASE_BUILD_FORBIDDEN_KEYS) {
      expect(() =>
        validateReleasePublicBuildConfig({
          configMode: 'standalone-synthetic',
          environment: {
            ZENDIO_GA_MEASUREMENT_ID: STANDALONE_SYNTHETIC_CONFIG.measurementId,
            ZENDIO_GA_TRANSPORT_MODE: STANDALONE_SYNTHETIC_CONFIG.transportMode,
            ZENDIO_GA_PROXY_ENDPOINT: STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint,
            [key]: ''
          }
        })
      ).toThrow(`RELEASE_BUILD_ENVIRONMENT_FORBIDDEN:${key}`);
    }
    expect(RELEASE_BUILD_FORBIDDEN_KEYS).toHaveLength(24);
  });

  it('runs exactly one contained isolated Firefox build and rejects bad paths before spawn', () => {
    const attemptRoot = realpathSync(mkdtempSync(join(tmpdir(), 'zendio-isolated-build-')));
    roots.push(attemptRoot);
    chmodSync(attemptRoot, 0o700);
    const installRoot = join(attemptRoot, 'install');
    mkdirSync(installRoot, { mode: 0o700 });
    for (const name of ['npm-userconfig', 'npm-globalconfig']) {
      writeFileSync(join(installRoot, name), '', { mode: 0o600 });
      chmodSync(join(installRoot, name), 0o600);
    }
    const environment = {
      NPM_CONFIG_USERCONFIG: join(installRoot, 'npm-userconfig'),
      NPM_CONFIG_GLOBALCONFIG: join(installRoot, 'npm-globalconfig')
    };
    const buildRoot = join(attemptRoot, 'build');
    mkdirSync(buildRoot, { mode: 0o700 });
    chmodSync(buildRoot, 0o700);
    const distDir = join(buildRoot, 'dist-firefox');
    const tempDir = join(buildRoot, 'tmp-firefox');
    mkdirSync(tempDir, { mode: 0o700 });
    chmodSync(tempDir, 0o700);
    const spawn = vi.fn((_command: string, args: readonly string[]) => {
      expect(args).toContain('--firefox');
      expect(args.slice(-2)).toEqual(['--outdir', distDir]);
      writeFileSync(join(distDir, 'manifest.json'), '{}\n');
      return { status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    });
    const result = runIsolatedReleaseBuild(
      {
        configMode: 'standalone-synthetic',
        browser: 'firefox',
        distDir,
        tempDir,
        environment
      },
      { repositoryStatusOperation: () => '', spawnSync: spawn }
    );
    expect(result).toMatchObject({ browser: 'firefox', distDir, tempDir });
    expect(spawn).toHaveBeenCalledTimes(1);

    const chromeDist = join(buildRoot, 'dist-chrome');
    const chromeTemp = join(buildRoot, 'tmp-chrome');
    mkdirSync(chromeTemp, { mode: 0o700 });
    chmodSync(chromeTemp, 0o700);
    const dirtySpawn = vi.fn();
    expect(() =>
      runIsolatedReleaseBuild(
        {
          configMode: 'standalone-synthetic',
          browser: 'chrome',
          distDir: chromeDist,
          tempDir: chromeTemp,
          environment
        },
        { repositoryStatusOperation: () => ' M src/options/index.ts\n', spawnSync: dirtySpawn }
      )
    ).toThrow('RELEASE_BUILD_REPOSITORY_DIRTY');
    expect(dirtySpawn).not.toHaveBeenCalled();

    const chromeSpawn = vi.fn((_command: string, args: readonly string[]) => {
      expect(args).not.toContain('--firefox');
      expect(args.slice(-2)).toEqual(['--outdir', chromeDist]);
      writeFileSync(join(chromeDist, 'manifest.json'), '{}\n');
      return { status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    });
    expect(
      runIsolatedReleaseBuild(
        {
          configMode: 'standalone-synthetic',
          browser: 'chrome',
          distDir: chromeDist,
          tempDir: chromeTemp,
          environment
        },
        { repositoryStatusOperation: () => '', spawnSync: chromeSpawn }
      )
    ).toMatchObject({ browser: 'chrome', distDir: chromeDist, tempDir: chromeTemp });
    expect(chromeSpawn).toHaveBeenCalledTimes(1);

    const blocked = vi.fn((_command: string, _args: readonly string[]) => ({
      status: 0,
      signal: null,
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0)
    }));
    expect(() =>
      runIsolatedReleaseBuild(
        {
          configMode: 'standalone-synthetic',
          browser: 'chrome',
          distDir: join(buildRoot, 'nested/dist'),
          tempDir,
          environment
        },
        { repositoryStatusOperation: () => '', spawnSync: blocked }
      )
    ).toThrow('RELEASE_BUILD_DIST_INVALID');
    expect(blocked).not.toHaveBeenCalled();
  });
});
