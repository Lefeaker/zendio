import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/release-chrome-webstore.yml', 'utf8');

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

  it.each([
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
    ['constant state name', 'zendio-chrome-submission-state-v1', 'zendio-${{ github.ref }}-state']
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
});
