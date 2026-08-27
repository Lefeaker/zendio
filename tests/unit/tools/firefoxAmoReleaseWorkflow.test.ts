import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/release-firefox-amo.yml', 'utf8');

function check(candidate?: string) {
  let root: string | undefined;
  const args = ['tools/report-firefox-amo-release-workflow.mjs', '--check'];
  if (candidate !== undefined) {
    root = mkdtempSync(join(tmpdir(), 'zendio-firefox-workflow-'));
    const path = join(root, 'workflow.yml');
    writeFileSync(path, candidate);
    args.push('--workflow', path);
  }
  try {
    return spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8' });
  } finally {
    if (root) rmSync(root, { recursive: true, force: true });
  }
}

describe('Firefox AMO release workflow contract', () => {
  it('accepts the committed exact-XPI protected workflow and CLI', () => {
    expect(check()).toMatchObject({ status: 0, signal: null, stdout: '', stderr: '' });
  });

  it.each([
    ['channel default', 'default: listed', 'default: unlisted'],
    ['store concurrency', 'group: zendio-firefox-amo-release-v1', 'group: ${{ github.ref }}'],
    [
      'host dependency phase',
      'playwright-host-deps-platform-v1 -- firefox-with-host-deps',
      'playwright-browser-install-v1 -- firefox-with-host-deps'
    ],
    [
      'browser phase',
      'playwright-browser-install-v1 -- firefox-with-host-deps',
      'npx playwright install firefox'
    ],
    [
      'geckodriver phase',
      'firefox-geckodriver-provision-v1 -- --output-dir',
      'curl -L https://github.com/mozilla/geckodriver'
    ],
    [
      'artifact transport',
      'artifact-ids: ${{ needs.prepare.outputs.artifact_id }}',
      'name: zendio-firefox-release-v1'
    ],
    ['download digest', 'digest-mismatch: error', 'digest-mismatch: warn'],
    [
      'protected reauthorization',
      '--profile release-provenance-v1 -- scripts/utils/releaseCiProvenance.mjs --reauthorize',
      '--profile release-state-init-v1 -- --browser firefox'
    ],
    [
      'submit owner',
      '--profile firefox-submit-v1 -- --artifact-manifest',
      'node scripts/package-firefox.mjs --sign'
    ],
    ['always state evidence', 'if: ${{ always() }}', 'if: ${{ success() }}']
  ])('rejects %s mutation', (_label, before, after) => {
    const result = check(workflow.replace(before, after));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('contract failed');
  });

  it('keeps AMO credentials on one final step and removes source-directory signing', () => {
    expect(workflow.match(/WEB_EXT_API_KEY:/g)).toHaveLength(1);
    expect(workflow.match(/WEB_EXT_API_SECRET:/g)).toHaveLength(1);
    expect(workflow.match(/firefox-submit-v1 -- --artifact-manifest/g)).toHaveLength(1);
    expect(workflow).not.toMatch(/package:firefox:sign|--sign|uploadSourceCode|cmd\.sign/u);
  });
});
