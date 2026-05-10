import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-dependency-cruiser-coverage.mjs');

function writeCruiseResult(payload: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aiiinob-depcruise-'));
  const path = join(dir, 'result.json');
  writeFileSync(path, JSON.stringify(payload), 'utf8');
  return { dir, path };
}

function makeCruiseResult(args: {
  modules: number;
  dependencies: number;
  violations?: Array<Record<string, unknown>>;
}): unknown {
  return {
    modules: Array.from({ length: args.modules }, (_, index) => ({
      source: `src/module-${index}.ts`,
      dependencies: []
    })),
    summary: {
      totalDependenciesCruised: args.dependencies,
      violations: args.violations ?? []
    }
  };
}

describe('dependency-cruiser coverage report', () => {
  it('accepts a full graph with no violations', () => {
    const fixture = writeCruiseResult(makeCruiseResult({ modules: 400, dependencies: 300 }));
    try {
      const output = execFileSync(process.execPath, [scriptPath, '--input-json', fixture.path], {
        encoding: 'utf8'
      });
      expect(output).toContain('modules=400 dependencies=300 violations=0');
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('fails when coverage is too small', () => {
    const fixture = writeCruiseResult(makeCruiseResult({ modules: 2, dependencies: 1 }));
    try {
      const result = spawnSync(process.execPath, [scriptPath, '--input-json', fixture.path], {
        encoding: 'utf8'
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('modules=2 dependencies=1 violations=0');
      expect(result.stderr).toContain('module coverage below threshold');
      expect(result.stderr).toContain('dependency coverage below threshold');
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('fails when dependency-cruiser reports violations', () => {
    const fixture = writeCruiseResult(
      makeCruiseResult({
        modules: 400,
        dependencies: 300,
        violations: [
          {
            from: 'src/a.ts',
            to: 'src/b.ts',
            rule: { name: 'no-circular' }
          }
        ]
      })
    );
    try {
      const result = spawnSync(process.execPath, [scriptPath, '--input-json', fixture.path], {
        encoding: 'utf8'
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('modules=400 dependencies=300 violations=1');
      expect(result.stderr).toContain('no-circular: src/a.ts -> src/b.ts');
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});
