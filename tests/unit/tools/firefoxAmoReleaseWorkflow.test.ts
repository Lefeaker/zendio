import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R03_CI_JOB_SEQUENCE_RESERVATIONS } from '../../../scripts/config/commandBoundaryProfiles.mjs';
import { GITHUB_ACTION_PINS } from '../../../scripts/config/githubActionPins.mjs';

const workflow = readFileSync('.github/workflows/release-firefox-amo.yml', 'utf8');
const supplyChainRun =
  'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:github-actions-supply-chain:check';

function pinnedUse(action: string): string {
  const pin = GITHUB_ACTION_PINS.find((row) => row.action === action);
  if (!pin) throw new Error(`Missing GitHub Action pin: ${action}`);
  return `${pin.action}@${pin.commit} # ${pin.alias}`;
}

function jobBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end < 0 ? source.length : end);
}

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

  it('rejects a release directory that the preparation owner cannot accept', () => {
    const invalid = workflow.replace(/(--release-dir "[^"]*\/)[^"]+"/, '$1wrong-release"');
    expect(check(invalid).status).not.toBe(0);
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
    ['always state evidence', 'if: ${{ always() }}', 'if: ${{ success() }}'],
    ['prepare supply-chain gate', supplyChainRun, `${supplyChainRun} && true`],
    ['immutable checkout pin', pinnedUse('actions/checkout'), 'actions/checkout@v6']
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

  it('keeps one early unprivileged supply-chain guard and the exact prepare budget', () => {
    const prepare = jobBlock(workflow, '  prepare:\n', '  submit:\n');
    const submit = jobBlock(workflow, '  submit:\n', '  release-attempt-verdict:\n');
    expect(prepare.match(new RegExp(supplyChainRun, 'gu'))).toHaveLength(1);
    expect(prepare.indexOf(supplyChainRun)).toBeLessThan(
      prepare.indexOf('Validate release runtime')
    );
    expect(prepare).toContain(
      'ZENDIO_FIREFOX_ATTEMPT_ROOT: ${{ runner.temp }}/zendio-firefox-${{ github.run_id }}-${{ github.run_attempt }}'
    );
    expect(submit).not.toContain(supplyChainRun);
    expect(submit).not.toContain('Verify immutable GitHub Actions supply chain');
    expect(
      R03_CI_JOB_SEQUENCE_RESERVATIONS['firefox-prepare-v1'].reduce(
        (total, reservation) => total + reservation.fullMs,
        0
      )
    ).toBe(6_420_000);
    expect(workflow.match(new RegExp(pinnedUse('actions/checkout'), 'gu'))).toHaveLength(2);
    expect(workflow.match(new RegExp(pinnedUse('actions/upload-artifact'), 'gu'))).toHaveLength(2);
    expect(workflow.match(new RegExp(pinnedUse('actions/download-artifact'), 'gu'))).toHaveLength(
      1
    );
  });
});
