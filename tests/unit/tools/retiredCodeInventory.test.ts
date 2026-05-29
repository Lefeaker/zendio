import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('retired code inventory document', () => {
  it('contains concrete decisions without unknown placeholders', () => {
    const previewFamily = `${['src', 'options', 'preview'].join('/')}/**`;
    const source = readFileSync(join(process.cwd(), 'docs/retired-code-inventory.md'), 'utf8');
    expect(source).toContain(previewFamily);
    expect(source).not.toMatch(/\b(?:unknown|unclear|later|maybe)\b/i);
  });

  it('does not count synthetic audit fixtures as retired source owners', () => {
    const output = execFileSync(process.execPath, ['tools/report-retired-code-inventory.mjs'], {
      encoding: 'utf8'
    });

    expect(output).not.toContain('tests/unit/tools/reportNonProductionSource.test.ts');
    expect(output).not.toContain('tests/unit/tools/reportCompatibilityDuplicates.test.ts');
    expect(output).not.toContain('tests/fixtures/tools/compatibility-duplicates/allowlist.json');
    expect(output).not.toContain(
      'tests/fixtures/tools/compatibility-duplicates/allowlist-stale.json'
    );
  });
});
