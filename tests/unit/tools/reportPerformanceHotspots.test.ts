import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('report-performance-hotspots', () => {
  it('tracks current src files that remain over 250 LOC', () => {
    const output = execFileSync(
      process.execPath,
      [resolve('tools/report-performance-hotspots.mjs')],
      {
        encoding: 'utf8'
      }
    );

    expect(output).toContain('src/i18n/schemaShellMessages.ts');
    expect(output).toContain('src/content/reader/utils/markdownBuilder.ts');
    expect(output).toContain('src/options/app/productionStitchShellMount.ts');
    expect(output).toContain('src/ui/domains/privacy/PrivacySettingsView.ts');
  });
});
