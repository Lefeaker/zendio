import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function printStylelintConfig(filePath: string): { rules?: Record<string, unknown> } {
  const output = execFileSync('npx', ['stylelint', '--print-config', filePath], {
    encoding: 'utf8'
  });
  return JSON.parse(output);
}

describe('Options Stylelint config', () => {
  it('applies non-empty rules to current Stitch Options CSS', () => {
    const config = printStylelintConfig('src/options/stitch/styles/stitch.css');

    expect(Object.keys(config.rules ?? {})).toContain('selector-class-pattern');
  });
});
