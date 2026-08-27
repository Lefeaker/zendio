import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('design token alignment', () => {
  it('keeps the Stitch semantic aliases owned by design-tokens.css', () => {
    const output = execFileSync(
      process.execPath,
      ['tools/report-design-token-alignment.mjs', '--check'],
      {
        cwd: resolve(__dirname, '../../..'),
        encoding: 'utf8'
      }
    );
    const report = JSON.parse(output) as { theme: string; entries: string[]; failures: string[] };
    expect(report.theme).toBe('src/ui/stitch-runtime/styles/runtime/theme-tokens.css');
    expect(report.entries).toHaveLength(6);
    expect(report.failures).toEqual([]);
  });
});
