import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('design token alignment', () => {
  it('keeps the Stitch semantic aliases owned by design-tokens.css', () => {
    expect(() =>
      execFileSync(process.execPath, ['tools/report-design-token-alignment.mjs', '--check'], {
        cwd: resolve(__dirname, '../../..'),
        stdio: 'pipe'
      })
    ).not.toThrow();
  });
});
