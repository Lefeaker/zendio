import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { R03_CI_JOB_SEQUENCE_RESERVATIONS } from '../../../scripts/config/commandBoundaryProfiles.mjs';
import { GITHUB_ACTION_PINS } from '../../../scripts/config/githubActionPins.mjs';

const workflow = readFileSync('.github/workflows/release-chrome-webstore.yml', 'utf8');
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
  const args = ['tools/report-chrome-webstore-release-workflow.mjs', '--check'];
  if (candidate !== undefined) {
    root = mkdtempSync(join(tmpdir(), 'zendio-chrome-workflow-'));
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

describe('Chrome Web Store release workflow contract', () => {
  it('accepts the committed same-SHA protected workflow and CLI', () => {
    expect(check()).toMatchObject({ status: 0, signal: null, stdout: '', stderr: '' });
  });

  it('rejects an invalid isolated build temporary path', () => {
    const invalid = workflow.replace(/(--temp-dir "[^"]*\/)[^"]+"/, '$1wrong-temp"');
    expect(check(invalid).status).not.toBe(0);
  });

  it.each([
    ['build output path', '/dist-chrome"', '/wrong-dist"'],
    [
      'ref-scoped concurrency',
      'group: zendio-chrome-webstore-release-v1',
      'group: ${{ github.ref }}'
    ],
    ['rerun admission', 'github.run_attempt == 1', 'github.run_attempt >= 1'],
    [
      'prepare environment',
      '  prepare:\n',
      '  prepare:\n    environment: chrome-webstore-release\n'
    ],
    [
      'artifact identity',
      'artifact-ids: ${{ needs.prepare.outputs.artifact_id }}',
      'name: zendio-chrome-release-v1'
    ],
    ['digest hard failure', 'digest-mismatch: error', 'digest-mismatch: warn'],
    [
      'fresh reauthorization',
      '--profile release-provenance-v1 -- scripts/utils/releaseCiProvenance.mjs --reauthorize',
      '--profile release-state-init-v1 -- --browser chrome'
    ],
    [
      'store profile',
      '--profile chrome-publish-v1 -- --publish --artifact-manifest',
      'node scripts/publish-chrome-webstore.mjs --publish'
    ],
    ['always evidence', 'if: ${{ always() }}', 'if: ${{ success() }}'],
    ['constant state name', 'zendio-chrome-submission-state-v1', 'zendio-${{ github.ref }}-state'],
    ['prepare supply-chain gate', supplyChainRun, `${supplyChainRun} && true`],
    ['immutable checkout pin', pinnedUse('actions/checkout'), 'actions/checkout@v6']
  ])('rejects %s mutation', (_label, before, after) => {
    const result = check(workflow.replace(before, after));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('contract failed');
  });

  it('confines every CWS secret to the single protected mutation step', () => {
    for (const key of [
      'CWS_CLIENT_ID',
      'CWS_CLIENT_SECRET',
      'CWS_REFRESH_TOKEN',
      'CWS_EXTENSION_ID',
      'CWS_PUBLISHER_ID'
    ]) {
      expect(workflow.match(new RegExp(`${key}:`, 'g'))).toHaveLength(1);
    }
    expect(workflow).not.toContain('npm run release:chrome');
    expect(workflow).not.toContain('publish-chrome-webstore.mjs');
  });

  it('keeps one early unprivileged supply-chain guard and the exact prepare budget', () => {
    const prepare = jobBlock(workflow, '  prepare:\n', '  publish:\n');
    const publish = jobBlock(workflow, '  publish:\n', '  release-attempt-verdict:\n');
    expect(prepare.match(new RegExp(supplyChainRun, 'gu'))).toHaveLength(1);
    expect(prepare.indexOf(supplyChainRun)).toBeLessThan(
      prepare.indexOf('Validate release runtime')
    );
    expect(prepare).toContain(
      'ZENDIO_CHROME_ATTEMPT_ROOT: ${{ runner.temp }}/zendio-chrome-${{ github.run_id }}-${{ github.run_attempt }}'
    );
    expect(publish).not.toContain(supplyChainRun);
    expect(publish).not.toContain('Verify immutable GitHub Actions supply chain');
    expect(
      R03_CI_JOB_SEQUENCE_RESERVATIONS['chrome-prepare-v1'].reduce(
        (total, reservation) => total + reservation.fullMs,
        0
      )
    ).toBe(3_150_000);
    expect(workflow.match(new RegExp(pinnedUse('actions/checkout'), 'gu'))).toHaveLength(2);
    expect(workflow.match(new RegExp(pinnedUse('actions/upload-artifact'), 'gu'))).toHaveLength(2);
    expect(workflow.match(new RegExp(pinnedUse('actions/download-artifact'), 'gu'))).toHaveLength(
      1
    );
  });
});
