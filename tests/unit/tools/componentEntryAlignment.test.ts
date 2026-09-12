import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('component entry alignment', () => {
  it('requires the production surface adapters to use the primitive owners', () => {
    expect(() =>
      execFileSync(process.execPath, ['tools/report-component-entry-alignment.mjs', '--check'], {
        cwd: resolve(__dirname, '../../..'),
        stdio: 'pipe'
      })
    ).not.toThrow();
  });
});
