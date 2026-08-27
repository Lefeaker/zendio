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
    const report = JSON.parse(output) as {
      theme: string;
      entries: string[];
      surfaceCanonicalValues: Record<string, Record<string, string>>;
      failures: string[];
    };
    expect(report.theme).toBe('src/ui/stitch-runtime/styles/runtime/theme-tokens.css');
    expect(report.entries).toHaveLength(6);
    expect(report.surfaceCanonicalValues).toEqual({
      dark: {
        '--zendio-stitch-bg': '#09090b',
        '--zendio-stitch-text': '#fafafa',
        '--zendio-stitch-accent': '#a78bfa',
        '--zendio-stitch-line': '#27272a',
        '--zendio-stitch-radius-md': '8px',
        '--zendio-stitch-motion-fast': '140ms'
      },
      light: {
        '--zendio-stitch-bg': '#f5f6fb',
        '--zendio-stitch-text': '#111114',
        '--zendio-stitch-accent': '#7c3aed',
        '--zendio-stitch-line': '#e4e4eb',
        '--zendio-stitch-radius-md': '8px',
        '--zendio-stitch-motion-fast': '140ms'
      }
    });
    expect(report.failures).toEqual([]);
  });
});
