import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LOCKED_DEPENDENCY_CRUISER,
  STANDALONE_SYNTHETIC_CONFIG,
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
    expect(command).toBe(process.execPath);
    expect(args.slice(1)).toEqual(LOCKED_DEPENDENCY_CRUISER.argv);
    expect(args[0]).toBe(join(root, LOCKED_DEPENDENCY_CRUISER.packageRelativeCli));
    expect(options.cwd).toBe(root);
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
  });
});
