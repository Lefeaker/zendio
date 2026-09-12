import { describe, expect, it, vi } from 'vitest';
import { createPreflightTaskGraph, runPreflight } from '../../../scripts/verify-preflight.mjs';

const expectedLeaves = [
  ['verify-runtime', 'npm-script-quick-v1', ['verify:runtime']],
  ['typecheck-app', 'npm-script-standard-v1', ['typecheck:app']],
  ['typecheck-tests', 'npm-script-standard-v1', ['typecheck:tests']],
  ['typecheck-strict', 'npm-script-standard-v1', ['typecheck:strict']],
  ['release-metadata-check', 'npm-script-quick-v1', ['release:metadata:check']],
  ['i18n-catalog-check', 'npm-script-standard-v1', ['i18n:catalog:check']],
  [
    'audit-i18n-uncatalogued-user-copy-check',
    'npm-script-standard-v1',
    ['audit:i18n-uncatalogued-user-copy:check']
  ],
  ['audit-ga-proxy-contract', 'npm-script-standard-v1', ['audit:ga:proxy-contract']],
  ['audit-ga-docs', 'npm-script-standard-v1', ['audit:ga:docs']],
  ['audit-ga-legacy-api', 'npm-script-standard-v1', ['audit:ga:legacy-api']],
  ['lint-quiet', 'npm-script-standard-v1', ['lint', '--', '--quiet']],
  ['build-dev', 'npm-script-build-v1', ['build:dev']],
  ['audit-ga-client-secret', 'npm-script-standard-v1', ['audit:ga:client-secret']],
  ['audit-ga-release-surface', 'npm-script-standard-v1', ['audit:ga:release-surface']],
  ['audit-imports-check', 'npm-script-standard-v1', ['audit:imports:check']],
  ['audit-ui-architecture-report', 'npm-script-standard-v1', ['audit:ui-architecture:report']],
  [
    'audit-interaction-contract-report',
    'npm-script-standard-v1',
    ['audit:interaction-contract:report']
  ],
  ['audit-options-mainline-report', 'npm-script-standard-v1', ['audit:options-mainline:report']],
  ['audit-build-report', 'npm-script-standard-v1', ['audit:build:report']],
  ['audit-performance-report', 'npm-script-standard-v1', ['audit:performance:report']]
];

describe('preflight command graph', () => {
  it('preserves the exact 20-leaf order as a serial dependency chain', () => {
    const graph = createPreflightTaskGraph();

    expect(graph.policyId).toBe('preflight-v1');
    expect(graph.tasks.map((task) => [task.id, task.profile, task.args, task.dependsOn])).toEqual(
      expectedLeaves.map(([id, profile, args], index) => [
        id,
        profile,
        args,
        index === 0 ? [] : [expectedLeaves[index - 1]?.[0]]
      ])
    );
  });

  it('admits each leaf only after its predecessor succeeds', async () => {
    const started: string[] = [];
    const startCommand = vi.fn((task: { id: string }) => {
      started.push(task.id);
      return {
        child: null,
        cancel: () => true,
        completion: Promise.resolve({
          ok: true,
          terminalReason: 'success',
          exitCode: 0,
          signal: null
        })
      };
    });

    const result = await runPreflight({ startCommand });

    expect(result.ok).toBe(true);
    expect(started).toEqual(expectedLeaves.map(([id]) => id));
    expect(startCommand).toHaveBeenCalledTimes(20);
  });
});
