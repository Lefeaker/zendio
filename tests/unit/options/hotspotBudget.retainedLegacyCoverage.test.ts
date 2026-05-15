import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function countLines(relativePath: string): number {
  const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
  return source.split('\n').length;
}

describe('options hotspot budgets', () => {
  it('keeps the selected hotspot files under the post-split line budgets', () => {
    expect(countLines('src/options/components/sections/RestSectionView.ts')).toBeLessThanOrEqual(
      265
    );
    expect(
      countLines('src/options/components/sections/FragmentSectionView.ts')
    ).toBeLessThanOrEqual(205);
    expect(
      countLines('src/options/components/sections/UsageDashboardSection.ts')
    ).toBeLessThanOrEqual(180);
    expect(countLines('src/ui/domains/privacy/PrivacySettingsView.ts')).toBeLessThanOrEqual(255);
  });
});
