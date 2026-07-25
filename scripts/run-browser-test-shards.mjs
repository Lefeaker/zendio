import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultConcurrency, resolveConcurrency } from './utils/taskGraphRunner.mjs';
import { createBrowserTestShardSuites } from './utils/testShards.mjs';

export async function main(argv = process.argv, env = process.env) {
  const suite = argv[2];
  const browserTestShardSuites = createBrowserTestShardSuites();
  const shards = Object.hasOwn(browserTestShardSuites, suite)
    ? browserTestShardSuites[suite]
    : undefined;

  if (!shards) {
    console.error('Usage: node scripts/run-browser-test-shards.mjs <e2e|visual>');
    return { ok: false, failed: [] };
  }

  const concurrency = resolveConcurrency(env.BROWSER_TEST_CONCURRENCY, defaultConcurrency());
  return runBrowserShards(shards, concurrency, env);
}

async function runBrowserShards(shards, concurrency, env) {
  const pending = [...shards];
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
      while (running.size < concurrency && pending.length > 0) {
        const shard = pending.shift();
        const promise = runBrowserShard(shard, env).then((ok) => {
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

function runBrowserShard(shard, env) {
  console.log(`⏳ browser shard ${shard.id}...`);
  const child = spawn('node', ['scripts/run-playwright.mjs', ...shard.args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...env,
      PLAYWRIGHT_SKIP_WEB_SERVER_BUILD: '1',
      PLAYWRIGHT_DIST_DIR: env.PLAYWRIGHT_DIST_DIR ?? 'build/dist',
      PLAYWRIGHT_OUTPUT_DIR: createShardOutputDir(shard.id, env),
      PLAYWRIGHT_HTML_REPORT_DIR: createShardHtmlReportDir(shard.id, env)
    }
  });

  return new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      if (signal || code !== 0) {
        console.error(`❌ browser shard ${shard.id} failed`);
        resolve(false);
      } else {
        console.log(`✅ browser shard ${shard.id} passed`);
        resolve(true);
      }
    });
    child.on('error', (error) => {
      console.error(`❌ browser shard ${shard.id} failed to start: ${error.message}`);
      resolve(false);
    });
  });
}

function createShardOutputDir(shardId, env) {
  const baseDir = env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results/browser-shards';
  return path.join(baseDir, sanitizeShardId(shardId));
}

function createShardHtmlReportDir(shardId, env) {
  const baseDir = env.PLAYWRIGHT_HTML_REPORT_DIR ?? 'build/reports/playwright-shards';
  return path.join(baseDir, sanitizeShardId(shardId));
}

function sanitizeShardId(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await main();
  if (!result.ok) {
    process.exitCode = 1;
  }
}
