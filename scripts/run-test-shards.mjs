import { spawn } from 'node:child_process';
import { defaultConcurrency, resolveConcurrency } from './utils/taskGraphRunner.mjs';
import {
  createE2eTestShards,
  createUnitTestShards,
  expandShardPatterns
} from './utils/testShards.mjs';

const suite = process.argv[2];
const shardId = process.argv[3];

if (suite !== 'unit' && suite !== 'e2e') {
  console.error('Usage: node scripts/run-test-shards.mjs <unit|e2e> [shard-id]');
  process.exit(1);
}

const shards = suite === 'unit' ? createUnitTestShards() : createE2eTestShards();
const selectedShards = shardId ? shards.filter((shard) => shard.id === shardId) : shards;

if (selectedShards.length === 0) {
  console.error(`Unknown ${suite} shard: ${shardId}`);
  process.exit(1);
}

const concurrency = shardId
  ? 1
  : resolveConcurrency(process.env.TEST_SHARD_CONCURRENCY, defaultConcurrency());
const config = suite === 'unit' ? 'vitest.unit.config.ts' : 'vitest.e2e.config.ts';

const result = await runShardProcesses(selectedShards, { concurrency, config });
if (!result.ok) {
  process.exit(1);
}

async function runShardProcesses(shardsToRun, { concurrency: maxConcurrency, config }) {
  const pending = [...shardsToRun];
  const running = new Set();
  const failed = [];

  return await new Promise((resolve) => {
    function schedule() {
      if (failed.length > 0 && running.size === 0) {
        resolve({ ok: false, failed });
        return;
      }
      if (failed.length > 0) {
        return;
      }
      while (running.size < maxConcurrency && pending.length > 0) {
        const shard = pending.shift();
        const promise = runShard(shard, config).then((ok) => {
          running.delete(promise);
          if (!ok) {
            failed.push(shard.id);
          }
          schedule();
        });
        running.add(promise);
      }
      if (pending.length === 0 && running.size === 0) {
        resolve({ ok: failed.length === 0, failed });
      }
    }

    schedule();
  });
}

function runShard(shard, config) {
  console.log(`⏳ ${suite} shard ${shard.id}...`);
  const files = expandShardPatterns(shard.patterns);
  if (files.length === 0) {
    console.error(`❌ ${suite} shard ${shard.id} did not match any test files`);
    return Promise.resolve(false);
  }

  const child = spawn('npx', ['vitest', 'run', '--config', config, ...files], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  return new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      if (signal || code !== 0) {
        console.error(`❌ ${suite} shard ${shard.id} failed`);
        resolve(false);
      } else {
        console.log(`✅ ${suite} shard ${shard.id} passed`);
        resolve(true);
      }
    });
    child.on('error', (error) => {
      console.error(`❌ ${suite} shard ${shard.id} failed to start: ${error.message}`);
      resolve(false);
    });
  });
}
