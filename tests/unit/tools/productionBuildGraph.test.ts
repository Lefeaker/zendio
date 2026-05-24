import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-production-build-graph.mjs');
const canonicalReportPath = resolve('build/reports/production-build-graph.json');

function readCanonicalReport(): string | null {
  return existsSync(canonicalReportPath) ? readFileSync(canonicalReportPath, 'utf8') : null;
}

function restoreCanonicalReport(content: string | null): void {
  if (content === null) {
    rmSync(canonicalReportPath, { force: true });
    return;
  }

  writeFileSync(canonicalReportPath, content, 'utf8');
}

function writeMetafile(payload: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aiiinob-build-graph-'));
  const path = join(dir, 'metafile.json');
  writeFileSync(path, JSON.stringify(payload), 'utf8');
  return { dir, path };
}

describe('production build graph report', () => {
  it('reports reachable sources from a complete esbuild metafile', () => {
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
        'src/onboarding/index.ts': { bytes: 10 },
        'src/options/widgets/fake.ts': { bytes: 10 },
        'src/options/index.ts': { bytes: 10 }
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
          inputs: {
            'src/options/widgets/fake.ts': { bytesInOutput: 10 },
            'src/options/index.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/content-orchestrator-harness.js': {
          entryPoint: 'src/dev/contentOrchestratorHarness.ts',
          inputs: {
            'src/dev/contentOrchestratorHarness.ts': { bytesInOutput: 10 }
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

    const canonicalReportBefore = readCanonicalReport();

    try {
      const output = execFileSync(
        process.execPath,
        [scriptPath, '--input-metafile', fixture.path, '--no-write-json'],
        {
          encoding: 'utf8'
        }
      );
      expect(output).toContain('Production Build Graph Report');
      expect(output).toContain('Source count: 11');
      expect(output).toContain('src/options/widgets/fake.ts');
      expect(output).toContain('src/dev/contentOrchestratorHarness.ts');
      expect(readCanonicalReport()).toBe(canonicalReportBefore);
    } finally {
      restoreCanonicalReport(canonicalReportBefore);
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});
