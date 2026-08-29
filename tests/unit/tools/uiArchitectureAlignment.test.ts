import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

type OwnershipRow = {
  path: string;
  disposition: string;
};

type OwnershipManifest = {
  closureState: 'intermediate' | 'final';
  rows: OwnershipRow[];
};

type UiArchitectureModule = {
  collectManifestTreeFindings: (root: string, manifest: OwnershipManifest) => string[];
};

function isUiArchitectureModule(value: object): value is UiArchitectureModule {
  return (
    'collectManifestTreeFindings' in value &&
    typeof value.collectManifestTreeFindings === 'function'
  );
}

async function loadUiArchitectureModule(): Promise<UiArchitectureModule> {
  const modulePath: string = '../../../tools/report-ui-architecture-alignment.mjs';
  const moduleValue = (await import(modulePath)) as object;
  if (!isUiArchitectureModule(moduleValue)) {
    throw new Error('UI architecture tool is missing its manifest tree validator export');
  }
  return moduleValue;
}

const { collectManifestTreeFindings } = await loadUiArchitectureModule();

function write(root: string, relativePath: string): void {
  const fullPath = join(root, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, 'export {};\n', 'utf8');
}

function withFixture(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'zendio-ui-architecture-'));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('ui architecture ownership alignment', () => {
  it('accepts an intermediate manifest without embedding future retirement filenames', () => {
    withFixture((root) => {
      const paths = [
        'src/ui/current/runtime.ts',
        'src/ui/future/retirement.ts',
        'src/ui/temporary/contract.ts'
      ];
      paths.forEach((path) => write(root, path));

      expect(
        collectManifestTreeFindings(root, {
          closureState: 'intermediate',
          rows: [
            { path: paths[0], disposition: 'production-runtime' },
            { path: paths[1], disposition: 'retire-later' },
            { path: paths[2], disposition: 'deferred-state-convergence' }
          ]
        })
      ).toEqual([]);
    });
  });

  it('accepts the same validator in final mode with only production rows', () => {
    withFixture((root) => {
      write(root, 'src/ui/current/runtime.ts');
      write(root, 'src/ui/current/contracts.ts');

      expect(
        collectManifestTreeFindings(root, {
          closureState: 'final',
          rows: [
            { path: 'src/ui/current/contracts.ts', disposition: 'production-compile' },
            { path: 'src/ui/current/runtime.ts', disposition: 'production-runtime' }
          ]
        })
      ).toEqual([]);
    });
  });

  it('fails closed for missing, wildcard, duplicate, and final deferred rows', () => {
    withFixture((root) => {
      write(root, 'src/ui/current/runtime.ts');
      const findings = collectManifestTreeFindings(root, {
        closureState: 'final',
        rows: [
          { path: 'src/ui/current/runtime.ts', disposition: 'production-runtime' },
          { path: 'src/ui/current/runtime.ts', disposition: 'production-runtime' },
          { path: 'src/ui/missing.ts', disposition: 'production-runtime' },
          { path: 'src/ui/*.ts', disposition: 'deferred-state-convergence' }
        ]
      });

      expect(findings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('duplicate UI path'),
          expect.stringContaining('missing from the current tree'),
          expect.stringContaining('not an exact UI path'),
          expect.stringContaining('final ownership manifest still contains')
        ])
      );
    });
  });
});
