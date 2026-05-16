import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const scriptPath = resolve('tools/report-production-build-graph.mjs');

interface ProductionBuildGraphFixtureReport {
  reachableSources: Record<string, { entrypointOwners: string[] }>;
  requiredEntrypoints: { missing: string[] };
}

function writeMetafile(payload: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aiiinob-production-build-graph-'));
  const path = join(dir, 'metafile.json');
  writeFileSync(path, JSON.stringify(payload), 'utf8');
  return { dir, path };
}

describe('report-production-build-graph', () => {
  it('reports structured entrypoint ownership from an esbuild metafile', () => {
    const fixture = writeMetafile({
      inputs: {
        'src/background/index.ts': { bytes: 10 },
        'src/content/index.ts': { bytes: 10 },
        'src/content/runtime/localVaultPermissionFrame.ts': { bytes: 10 },
        'src/dev/contentOrchestratorHarness.ts': { bytes: 10 },
        'src/dev/interactionContractHarness.ts': { bytes: 10 },
        'src/dev/localVaultWriteHarness.ts': { bytes: 10 },
        'src/dev/runtimeObservabilityHarness.ts': { bytes: 10 },
        'src/offscreen/localVault.ts': { bytes: 10 },
        'src/options/index.ts': { bytes: 10 },
        'src/onboarding/index.ts': { bytes: 10 },
        'src/options/app/bootstrap.ts': { bytes: 10 }
      },
      outputs: {
        'build/audit/background/index.js': {
          entryPoint: 'src/background/index.ts',
          inputs: {
            'src/background/index.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/content/runtime.js': {
          entryPoint: 'src/content/index.ts',
          inputs: {
            'src/content/index.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/options/index.js': {
          entryPoint: 'src/options/index.ts',
          imports: [{ path: 'build/audit/chunk-options.js', kind: 'import-statement' }],
          inputs: {
            'src/options/index.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/chunk-options.js': {
          inputs: {
            'src/options/app/bootstrap.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/onboarding/index.js': {
          entryPoint: 'src/onboarding/index.ts',
          inputs: {
            'src/onboarding/index.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/local-vault-permission.js': {
          entryPoint: 'src/content/runtime/localVaultPermissionFrame.ts',
          inputs: {
            'src/content/runtime/localVaultPermissionFrame.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/offscreen/local-vault.js': {
          entryPoint: 'src/offscreen/localVault.ts',
          inputs: {
            'src/offscreen/localVault.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/interaction-contract-harness.js': {
          entryPoint: 'src/dev/interactionContractHarness.ts',
          inputs: {
            'src/dev/interactionContractHarness.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/content-orchestrator-harness.js': {
          entryPoint: 'src/dev/contentOrchestratorHarness.ts',
          inputs: {
            'src/dev/contentOrchestratorHarness.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/runtime-observability-harness.js': {
          entryPoint: 'src/dev/runtimeObservabilityHarness.ts',
          inputs: {
            'src/dev/runtimeObservabilityHarness.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/local-vault-write-harness.js': {
          entryPoint: 'src/dev/localVaultWriteHarness.ts',
          inputs: {
            'src/dev/localVaultWriteHarness.ts': { bytesInOutput: 10 }
          }
        }
      }
    });

    try {
      const output = execFileSync(
        process.execPath,
        [
          scriptPath,
          '--input-metafile',
          fixture.path,
          '--write-json',
          join(fixture.dir, 'graph.json')
        ],
        { encoding: 'utf8' }
      );
      expect(output).toContain('Production Build Graph Report');
      expect(output).toContain('src/options/index.ts');
      expect(output).toContain('src/content/index.ts');

      const json = JSON.parse(
        readFileSync(join(fixture.dir, 'graph.json'), 'utf8')
      ) as ProductionBuildGraphFixtureReport;
      expect(json.reachableSources['src/options/index.ts'].entrypointOwners).toContain(
        'src/options/index.ts'
      );
      expect(json.reachableSources['src/options/app/bootstrap.ts'].entrypointOwners).toContain(
        'src/options/index.ts'
      );
      expect(json.requiredEntrypoints.missing).toEqual([]);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('fails closed when required production entrypoints are missing', () => {
    const fixture = writeMetafile({
      inputs: {
        'src/options/index.ts': { bytes: 10 }
      },
      outputs: {
        'build/audit/options/index.js': {
          entryPoint: 'src/options/index.ts',
          inputs: {
            'src/options/index.ts': { bytesInOutput: 10 }
          }
        }
      }
    });

    try {
      expect(() =>
        execFileSync(process.execPath, [scriptPath, '--input-metafile', fixture.path], {
          encoding: 'utf8'
        })
      ).toThrow();
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});
