import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** One fixture owns its generated files until teardown, including across Playwright processes. */
export function createGeneratedPreview() {
  let outputRoot: string | undefined;

  return {
    build(): string {
      if (!outputRoot) {
        const privateRoot = mkdtempSync(join(tmpdir(), 'zendio-visual-preview-'));
        try {
          execFileSync(
            process.execPath,
            [resolve(process.cwd(), 'scripts/build-preview.mjs'), '--outdir', privateRoot],
            { cwd: process.cwd(), stdio: 'inherit' }
          );
          outputRoot = privateRoot;
        } catch (error) {
          rmSync(privateRoot, { recursive: true, force: true });
          throw error;
        }
      }
      return join(outputRoot, 'index.html');
    },
    dispose(): void {
      if (outputRoot) {
        rmSync(outputRoot, { recursive: true, force: true });
        outputRoot = undefined;
      }
    }
  };
}
