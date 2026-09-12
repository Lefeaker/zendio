import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const toolPath = resolve('tools/report-ui-production-ownership.mjs');

type Graph = {
  reachableSources: Record<string, { entrypointOwners: string[] }>;
  failures: string[];
};

type OwnershipModule = {
  calculateUiDigests: (root: string) => {
    uiPathSetSha256: string;
    uiContentSha256: string;
  };
  parseArgs: (args: string[]) => unknown;
  runProductionBuildGraph: (root: string) => Graph;
  validateOwnership: (input: {
    root: string;
    manifest: Manifest;
    graph: Graph;
    requireFinal?: boolean;
  }) => unknown;
};

type Row = {
  path: string;
  disposition:
    | 'production-runtime'
    | 'production-compile'
    | 'promote-u02c1'
    | 'retire-u02c2'
    | 'retire-u02c3'
    | 'deferred-state-convergence';
  productionOwners: string[];
  replacement: { owner: string; milestone: string };
  evidence: { docs: string[]; tests: string[]; tools: string[] };
  reason: string;
};

type Manifest = {
  schemaVersion: 1;
  closureState: 'intermediate' | 'final';
  uiPathSetSha256: string;
  uiContentSha256: string;
  rows: Row[];
};

function write(root: string, path: string, contents: string): void {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents, 'utf8');
}

function git(root: string, args: string[]): void {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

async function loadTool(): Promise<OwnershipModule> {
  return (await import(pathToFileURL(toolPath).href)) as OwnershipModule;
}

function graph(overrides: Graph['reachableSources'] = {}): Graph {
  return { reachableSources: overrides, failures: [] };
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'zendio-ui-ownership-'));
  write(
    root,
    'src/options/index.ts',
    "import { runtime } from '@ui/runtime';\nimport type { Contract } from '@ui/contracts';\nvoid runtime;\nvoid (null as Contract | null);\n"
  );
  write(root, 'src/ui/runtime.ts', 'export const runtime = true;\n');
  write(root, 'src/ui/contracts.ts', 'export interface Contract { value: string }\n');
  write(root, 'src/ui/retired.ts', 'export const retired = true;\n');
  write(root, 'src/shared/replacement.ts', 'export const replacement = true;\n');
  write(root, 'docs/ownership.md', '# ownership\n');
  write(root, 'tests/unit/tools/ownership.test.ts', 'export {};\n');
  write(root, 'tools/report-production-build-graph.mjs', 'export {};\n');
  write(root, 'tools/report-ui-production-ownership.mjs', 'export {};\n');
  git(root, ['init']);
  git(root, ['add', 'src', 'docs', 'tests', 'tools']);
  return root;
}

function row(path: string, disposition: Row['disposition'], productionOwners: string[] = []): Row {
  const replacement =
    disposition === 'production-runtime' || disposition === 'production-compile'
      ? { owner: path, milestone: 'current-production' }
      : {
          owner: 'src/shared/replacement.ts',
          milestone:
            disposition === 'promote-u02c1'
              ? 'U02C1'
              : disposition === 'retire-u02c2'
                ? 'U02C2'
                : disposition === 'retire-u02c3'
                  ? 'U02C3'
                  : 'U02C4'
        };
  return {
    path,
    disposition,
    productionOwners,
    replacement,
    evidence: {
      docs: ['docs/ownership.md'],
      tests: ['tests/unit/tools/ownership.test.ts'],
      tools: ['tools/report-production-build-graph.mjs']
    },
    reason: 'An exact production ownership decision is recorded for this source file.'
  };
}

function manifest(
  root: string,
  rows: Row[],
  closureState: Manifest['closureState'] = 'intermediate'
) {
  return async (): Promise<Manifest> => {
    const tool = await loadTool();
    const digests = tool.calculateUiDigests(root);
    return {
      schemaVersion: 1,
      closureState,
      ...digests,
      rows
    };
  };
}

function fixtureRows(): Row[] {
  return [
    row('src/ui/contracts.ts', 'production-compile', ['src/options/index.ts']),
    row('src/ui/retired.ts', 'retire-u02c2'),
    row('src/ui/runtime.ts', 'production-runtime', ['src/options/index.ts'])
  ];
}

function fixtureGraph(): Graph {
  return graph({
    'src/options/index.ts': { entrypointOwners: ['src/options/index.ts'] },
    'src/ui/runtime.ts': { entrypointOwners: ['src/options/index.ts'] }
  });
}

describe('ui production ownership', () => {
  it('validates the exact tracked set and distinguishes runtime from compile ownership', async () => {
    const root = createFixture();
    try {
      const tool = await loadTool();
      const rows = fixtureRows();
      const input = await manifest(root, rows)();

      expect(
        tool.validateOwnership({
          root,
          manifest: input,
          graph: fixtureGraph()
        })
      ).toEqual(
        expect.objectContaining({ productionCompileRows: 1, productionRuntimeRows: 1, rows: 3 })
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed for stale graph input, path-set drift, missing rows, glob rows, duplicate rows, and test owners', async () => {
    const root = createFixture();
    try {
      const tool = await loadTool();
      const rows = fixtureRows();
      const baseline = await manifest(root, rows)();
      const currentGraph = fixtureGraph();

      expect(() =>
        tool.validateOwnership({
          root,
          manifest: baseline,
          graph: graph({
            ...currentGraph.reachableSources,
            'src/ui/retired.ts': { entrypointOwners: ['src/options/index.ts'] }
          })
        })
      ).toThrow('non-production row is reachable');
      expect(() =>
        tool.validateOwnership({
          root,
          manifest: { ...baseline, uiPathSetSha256: '0'.repeat(64) },
          graph: currentGraph
        })
      ).toThrow('uiPathSetSha256 drifted');
      expect(() =>
        tool.validateOwnership({
          root,
          manifest: { ...baseline, rows: baseline.rows.slice(1) },
          graph: currentGraph
        })
      ).toThrow('manifest rows do not exactly match');
      expect(() =>
        tool.validateOwnership({
          root,
          manifest: {
            ...baseline,
            rows: [{ ...baseline.rows[0], path: 'src/ui/*.ts' }, ...baseline.rows.slice(1)]
          },
          graph: currentGraph
        })
      ).toThrow('exact file path');
      expect(() =>
        tool.validateOwnership({
          root,
          manifest: {
            ...baseline,
            rows: [baseline.rows[0], baseline.rows[0], ...baseline.rows.slice(1)]
          },
          graph: currentGraph
        })
      ).toThrow('sorted with no duplicates');
      expect(() =>
        tool.validateOwnership({
          root,
          manifest: {
            ...baseline,
            rows: baseline.rows.map((candidate) =>
              candidate.path === 'src/ui/runtime.ts'
                ? { ...candidate, productionOwners: ['tests/unit/tools/ownership.test.ts'] }
                : candidate
            )
          },
          graph: currentGraph
        })
      ).toThrow('production-runtime owners drifted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects content, extra-path, and untracked-source drift', async () => {
    const root = createFixture();
    try {
      const tool = await loadTool();
      const baseline = await manifest(root, fixtureRows())();
      const currentGraph = fixtureGraph();

      writeFileSync(join(root, 'src/ui/runtime.ts'), 'export const runtime = false;\n', 'utf8');
      expect(() =>
        tool.validateOwnership({ root, manifest: baseline, graph: currentGraph })
      ).toThrow('uiContentSha256 drifted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    const extraRoot = createFixture();
    try {
      const tool = await loadTool();
      const baseline = await manifest(extraRoot, fixtureRows())();
      write(extraRoot, 'src/ui/extra.ts', 'export const extra = true;\n');
      git(extraRoot, ['add', 'src/ui/extra.ts']);
      expect(() =>
        tool.validateOwnership({ root: extraRoot, manifest: baseline, graph: fixtureGraph() })
      ).toThrow('manifest rows do not exactly match');
    } finally {
      rmSync(extraRoot, { recursive: true, force: true });
    }

    const untrackedRoot = createFixture();
    try {
      const tool = await loadTool();
      const baseline = await manifest(untrackedRoot, fixtureRows())();
      write(untrackedRoot, 'src/ui/untracked.ts', 'export const untracked = true;\n');
      expect(() =>
        tool.validateOwnership({ root: untrackedRoot, manifest: baseline, graph: fixtureGraph() })
      ).toThrow('untracked UI TypeScript source');
    } finally {
      rmSync(untrackedRoot, { recursive: true, force: true });
    }
  });

  it('rejects unexpected runtime reachability for compile-only and accepts a zero-deferred final closure', async () => {
    const root = createFixture();
    try {
      const tool = await loadTool();
      const intermediate = await manifest(root, fixtureRows())();
      const currentGraph = fixtureGraph();

      expect(() =>
        tool.validateOwnership({
          root,
          manifest: intermediate,
          graph: graph({
            ...currentGraph.reachableSources,
            'src/ui/contracts.ts': { entrypointOwners: ['src/options/index.ts'] }
          })
        })
      ).toThrow('production-compile row is runtime-reachable');
      expect(() =>
        tool.validateOwnership({
          root,
          manifest: intermediate,
          graph: currentGraph,
          requireFinal: true
        })
      ).toThrow('--require-final requires closureState');

      rmSync(join(root, 'src/ui/retired.ts'));
      git(root, ['add', '-u']);
      const finalRows = fixtureRows().filter(
        (candidate) => candidate.disposition !== 'retire-u02c2'
      );
      const final = await manifest(root, finalRows, 'final')();
      expect(
        tool.validateOwnership({ root, manifest: final, graph: currentGraph, requireFinal: true })
      ).toEqual(expect.objectContaining({ closureState: 'final', rows: 2 }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('regenerates a unique production graph instead of trusting build/reports and exposes no graph injection CLI flag', async () => {
    const root = createFixture();
    try {
      const tool = await loadTool();
      write(
        root,
        'tools/report-production-build-graph.mjs',
        "import { writeFileSync } from 'node:fs';\nconst target = process.argv[process.argv.indexOf('--write-json') + 1];\nwriteFileSync(target, JSON.stringify({ reachableSources: { 'src/ui/runtime.ts': { entrypointOwners: ['src/options/index.ts'] } }, failures: [] }));\n"
      );
      write(
        root,
        'build/reports/production-build-graph.json',
        JSON.stringify({
          reachableSources: { 'src/ui/retired.ts': { entrypointOwners: ['stale'] } },
          failures: []
        })
      );

      expect(tool.runProductionBuildGraph(root)).toEqual({
        reachableSources: { 'src/ui/runtime.ts': { entrypointOwners: ['src/options/index.ts'] } },
        failures: []
      });
      expect(() =>
        tool.parseArgs(['--input-graph', 'build/reports/production-build-graph.json'])
      ).toThrow('unknown argument');
      expect(
        readFileSync(join(root, 'build/reports/production-build-graph.json'), 'utf8')
      ).toContain('retired');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
