import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  name: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}
interface Job {
  name: string;
  environment?: { name: string };
  if?: string;
  needs?: string[];
  steps: Step[];
  outputs?: Record<string, string>;
}
const source = readFileSync('.github/workflows/release-edge-addons.yml', 'utf8');
const workflow = parse(source) as {
  permissions: Record<string, string>;
  concurrency: { group: string; 'cancel-in-progress': boolean };
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
};
const prepare = workflow.jobs.prepare;
const publish = workflow.jobs.publish;

describe('Edge protected release workflow', () => {
  it('uses independent serialization, explicit tag/manual triggers and first-attempt admission', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(workflow.permissions).toEqual({});
    expect(workflow.concurrency).toEqual({
      group: 'zendio-edge-addons-release-v1',
      'cancel-in-progress': false
    });
    expect(publish.environment).toEqual({ name: 'edge-addons-release' });
    expect(publish.if).toContain('github.run_attempt == 1');
    expect(publish.needs).toEqual(['release-attempt-policy', 'prepare']);
    expect(workflow.jobs['release-attempt-verdict'].if).toBe('${{ always() }}');
    expect(workflow.jobs['release-attempt-verdict'].needs).toEqual([
      'release-attempt-policy',
      'prepare',
      'publish'
    ]);
  });

  it('reuses credential-free Chromium preparation and verifies the immutable artifact before Edge state/mutation', () => {
    expect(prepare.environment).toBeUndefined();
    expect(JSON.stringify(prepare)).not.toContain('secrets.');
    expect(JSON.stringify(prepare)).toContain('--profile chrome-prepare-v1');
    const download = publish.steps.find((step) =>
      step.uses?.startsWith('actions/download-artifact@')
    );
    expect(download?.with).toMatchObject({
      'artifact-ids': '${{ needs.prepare.outputs.artifact_id }}',
      'digest-mismatch': 'error'
    });
    const runs = publish.steps.map((step) => step.run ?? '');
    const verifyIndex = runs.findIndex((run) => run.includes('--profile edge-verify-v1'));
    const authorizeIndex = runs.findIndex((run) => run.includes('--reauthorize'));
    const stateIndex = runs.findIndex((run) =>
      run.includes('--profile release-state-init-v1 -- --browser edge')
    );
    const submitIndex = runs.findIndex((run) =>
      run.includes('--profile edge-publish-v1 -- --publish')
    );
    expect(verifyIndex).toBeGreaterThan(0);
    expect(authorizeIndex).toBeGreaterThan(verifyIndex);
    expect(stateIndex).toBeGreaterThan(authorizeIndex);
    expect(submitIndex).toBeGreaterThan(stateIndex);
    expect(runs[authorizeIndex]).toContain('${{ needs.prepare.outputs.artifact_digest }}');
    expect(runs[submitIndex]).toContain('/store-state/edge/publish-state.json');
  });

  it('only passes Edge credentials to the mutation step and always retains submission evidence', () => {
    const privileged = publish.steps.filter((step) =>
      JSON.stringify(step.env ?? {}).includes('secrets.')
    );
    expect(privileged).toHaveLength(1);
    expect(privileged[0].run).toContain('--profile edge-publish-v1');
    expect(privileged[0].env).toMatchObject({
      EDGE_CLIENT_ID: '${{ secrets.EDGE_CLIENT_ID }}',
      EDGE_API_KEY: '${{ secrets.EDGE_API_KEY }}',
      EDGE_PRODUCT_ID: '${{ vars.EDGE_PRODUCT_ID }}'
    });
    expect(source).not.toContain('CWS_CLIENT');
    expect(source).not.toContain('WEB_EXT_API');
    const evidence = publish.steps.find(
      (step) => step.with?.name === 'zendio-edge-submission-state-v1'
    );
    expect(evidence?.if).toBe('${{ always() }}');
    expect(evidence?.with).toMatchObject({ 'if-no-files-found': 'error', overwrite: false });
    expect(
      publish.steps.find((step) => step.run?.includes('--profile release-state-check-v1'))?.if
    ).toBe('${{ always() }}');
  });
});
