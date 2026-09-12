import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Firefox AMO submit CLI', () => {
  it('is import-safe and rejects every open or reordered grammar', () => {
    expect(() =>
      execFileSync(process.execPath, ['-e', "import('./scripts/submit-firefox-amo-release.mjs')"], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe'
      })
    ).not.toThrow();
    for (const argv of [
      [],
      ['--artifact-manifest', '/tmp/manifest.json'],
      [
        '--artifact-manifest',
        '/tmp/manifest.json',
        '--transport-mode',
        'local-private-v1',
        '--submission-state-file',
        '/tmp/state.json',
        '--saved-upload-uuid-path',
        '/tmp/uuid.json',
        '--channel',
        'listed'
      ]
    ]) {
      expect(() =>
        execFileSync(process.execPath, ['scripts/submit-firefox-amo-release.mjs', ...argv], {
          cwd: process.cwd(),
          encoding: 'utf8',
          stdio: 'pipe'
        })
      ).toThrow(/FIREFOX_AMO_ARGUMENTS_INVALID|RELEASE_ARTIFACT/u);
    }
  });
});
