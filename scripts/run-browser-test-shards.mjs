import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseManagedCommandInvocationArgv } from './config/commandBoundaryProfiles.mjs';
import { startBoundedCommand } from './utils/boundedCommand.mjs';
import { runTaskGraph } from './utils/taskGraphRunner.mjs';
import { createBrowserTestShardSuites } from './utils/testShards.mjs';

export function createBrowserShardTaskGraph(suite) {
  const suites = createBrowserTestShardSuites();
  const shards = Object.hasOwn(suites, suite) ? suites[suite] : undefined;
  if (!shards) throw new Error(`Unknown browser shard suite: ${String(suite)}`);
  return {
    policyId: 'browser-shards-v1',
    tasks: [
      {
        id: 'verify-runtime',
        name: 'Runtime engine guard',
        profile: 'node-script-standard-v1',
        args: ['scripts/verify-runtime.mjs'],
        dependsOn: []
      },
      ...shards.map((shard) => ({
        id: `shard:${shard.id}`,
        name: `browser shard ${shard.id}`,
        profile: 'playwright-v1',
        args: [...shard.args],
        dependsOn: ['verify-runtime']
      }))
    ]
  };
}

export function createBrowserShardEnvironment(taskId, environment = process.env) {
  if (!taskId.startsWith('shard:')) return { ...environment };
  const shardId = sanitizeShardId(taskId.slice('shard:'.length));
  return {
    ...environment,
    PLAYWRIGHT_SKIP_WEB_SERVER_BUILD: '1',
    PLAYWRIGHT_DIST_DIR: 'build/dist',
    PLAYWRIGHT_OUTPUT_DIR: path.join('test-results/browser-shards', shardId),
    PLAYWRIGHT_HTML_REPORT_DIR: path.join('build/reports/playwright-shards', shardId)
  };
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const directArguments = argv[0] === 'node' ? argv.slice(2) : argv;
  const parsed = parseManagedCommandInvocationArgv([
    'node',
    'scripts/run-browser-test-shards.mjs',
    ...directArguments
  ]);
  const [suite] = parsed.arguments;
  const graph = createBrowserShardTaskGraph(suite);
  const startOperation = options.startCommandOperation ?? startBoundedCommand;
  const startCommand =
    options.startCommand ??
    ((task) =>
      startOperation(
        { profileId: task.profile, arguments: task.args },
        { environment: createBrowserShardEnvironment(task.id, options.environment) }
      ));
  return runTaskGraph(graph.tasks, {
    policyId: graph.policyId,
    startCommand,
    ...(options.taskGraphOptions ?? {})
  });
}

function sanitizeShardId(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, '-');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await main();
    if (!result.ok) process.exitCode = result.failed[0]?.code ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
