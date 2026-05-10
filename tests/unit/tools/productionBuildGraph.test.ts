import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-production-build-graph.mjs');

function writeMetafile(payload: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aiiinob-build-graph-'));
  const path = join(dir, 'metafile.json');
  writeFileSync(path, JSON.stringify(payload), 'utf8');
  return { dir, path };
}

describe('production build graph report', () => {
  it('classifies retired candidate families from an esbuild metafile', () => {
    const fixture = writeMetafile({
      inputs: {
        'src/options/preview/index.ts': { bytes: 10 },
        'src/dev/contentOrchestratorHarness.ts': { bytes: 10 },
        'src/options/index.ts': { bytes: 10 }
      },
      outputs: {
        'build/audit/options/index.js': {
          entryPoint: 'src/options/index.ts',
          inputs: {
            'src/options/preview/index.ts': { bytesInOutput: 10 },
            'src/options/index.ts': { bytesInOutput: 10 }
          }
        },
        'build/audit/content-orchestrator-harness.js': {
          entryPoint: 'src/dev/contentOrchestratorHarness.ts',
          inputs: {
            'src/dev/contentOrchestratorHarness.ts': { bytesInOutput: 10 }
          }
        }
      }
    });

    try {
      const output = execFileSync(
        process.execPath,
        [scriptPath, '--input-metafile', fixture.path],
        {
          encoding: 'utf8'
        }
      );
      expect(output).toContain('Production build graph sources=3');
      expect(output).toContain('src/options/preview/** | inBuildGraph=true');
      expect(output).toContain('classification=production-user-facing');
      expect(output).toContain('src/options/components/formSections/** | inBuildGraph=false');
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});
