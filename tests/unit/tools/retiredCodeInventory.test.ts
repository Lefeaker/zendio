import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('retired code inventory document', () => {
  it('contains concrete decisions without unknown placeholders', () => {
    const source = readFileSync(join(process.cwd(), 'docs/retired-code-inventory.md'), 'utf8');
    expect(source).toContain('src/options/preview/**');
    expect(source).not.toMatch(/\b(?:unknown|unclear|later|maybe)\b/i);
  });
});
