import { parseManagedCommandInvocationArgv } from './config/commandBoundaryProfiles.mjs';
import { runTaskGraph } from './utils/taskGraphRunner.mjs';

const LEAVES = [
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

export function createPreflightTaskGraph() {
  return {
    policyId: 'preflight-v1',
    tasks: LEAVES.map(([id, profile, args], index) => ({
      id,
      name: id,
      profile,
      args,
      dependsOn: index === 0 ? [] : [LEAVES[index - 1][0]]
    }))
  };
}

export async function runPreflight(options = {}) {
  const graph = createPreflightTaskGraph();
  return runTaskGraph(graph.tasks, { policyId: graph.policyId, ...options });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  parseManagedCommandInvocationArgv([
    'node',
    'scripts/verify-preflight.mjs',
    ...process.argv.slice(2)
  ]);
  const result = await runPreflight();
  if (!result.ok) process.exitCode = result.failed[0]?.code ?? 1;
}
