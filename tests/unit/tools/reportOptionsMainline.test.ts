import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('report-options-mainline', () => {
  it('does not allowlist the retired legacy OptionsRepository source path', async () => {
    const source = await readFile('tools/report-options-mainline.mjs', 'utf8');
    const retiredPath = ['src/infrastructure', 'optionsRepository.ts'].join('/');

    expect(source).not.toContain(retiredPath);
  });
});
