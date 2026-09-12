import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseManagedCommandInvocationArgv } from './config/commandBoundaryProfiles.mjs';
import { runTaskGraph } from './utils/taskGraphRunner.mjs';
import {
  createE2eTestShards,
  createUnitTestShards,
  expandShardPatterns
} from './utils/testShards.mjs';

export function createTestShardTaskGraph(suite, shardId) {
  const shards = suite === 'unit' ? createUnitTestShards() : createE2eTestShards();
  const selected = shardId ? shards.filter((shard) => shard.id === shardId) : shards;
  if (selected.length === 0) throw new Error(`Unknown ${suite} shard: ${String(shardId)}`);
  const config = suite === 'unit' ? 'vitest.unit.config.ts' : 'vitest.e2e.config.ts';
  const tasks = [
    {
      id: 'verify-runtime',
      name: 'Runtime engine guard',
      profile: 'node-script-standard-v1',
      args: ['scripts/verify-runtime.mjs'],
      dependsOn: []
    }
  ];
  for (const shard of selected) {
    const files = expandShardPatterns(shard.patterns);
    if (files.length === 0)
      throw new Error(`${suite} shard ${shard.id} did not match any test files`);
    tasks.push({
      id: `shard:${shard.id}`,
      name: `${suite} shard ${shard.id}`,
      profile: 'vitest-v1',
      args: ['run', '--config', config, ...files],
      dependsOn: ['verify-runtime']
    });
  }
  return { policyId: 'vitest-shards-v1', tasks };
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseManagedCommandInvocationArgv([
    'node',
    'scripts/run-test-shards.mjs',
    ...argv
  ]);
  const [suite, shardId] = parsed.arguments;
  const graph = createTestShardTaskGraph(suite, shardId);
  return runTaskGraph(graph.tasks, {
    policyId: graph.policyId,
    ...options,
    concurrency: shardId ? 1 : options.concurrency
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await main();
    if (!result.ok) process.exitCode = result.failed[0]?.code ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
