import { spawn } from 'node:child_process';
import path from 'node:path';
import { defaultConcurrency, resolveConcurrency } from './utils/taskGraphRunner.mjs';

const suite = process.argv[2];

const suites = {
  e2e: [
    {
      id: 'yaml',
      args: ['test', 'tests/visual/yaml-config.interaction.spec.ts']
    },
    {
      id: 'reader-panel',
      args: ['test', 'tests/e2e/readerPanelFlow.test.ts', '--config=playwright.reader.config.ts']
    },
    {
      id: 'smoke',
      args: ['test', 'tests/visual/migration-harness.spec.ts', '--project=chromium-desktop']
    }
  ],
  visual: ['chromium-desktop', 'chromium-tablet', 'chromium-mobile'].map((project) => ({
    id: project,
    args: ['test', '--config=playwright.config.ts', `--project=${project}`]
  }))
};

if (!suites[suite]) {
  console.error('Usage: node scripts/run-browser-test-shards.mjs <e2e|visual>');
  process.exit(1);
}

const concurrency = resolveConcurrency(process.env.BROWSER_TEST_CONCURRENCY, defaultConcurrency());
const result = await runBrowserShards(suites[suite], concurrency);
if (!result.ok) {
  process.exit(1);
}

async function runBrowserShards(shards, concurrency) {
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
        const promise = runBrowserShard(shard).then((ok) => {
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

function runBrowserShard(shard) {
  console.log(`⏳ browser shard ${shard.id}...`);
  const child = spawn('node', ['scripts/run-playwright.mjs', ...shard.args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      PLAYWRIGHT_SKIP_WEB_SERVER_BUILD: '1',
      PLAYWRIGHT_DIST_DIR: process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist',
      PLAYWRIGHT_OUTPUT_DIR: createShardOutputDir(shard.id),
      PLAYWRIGHT_HTML_REPORT_DIR: createShardHtmlReportDir(shard.id)
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

function createShardOutputDir(shardId) {
  const baseDir = process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results/browser-shards';
  return path.join(baseDir, sanitizeShardId(shardId));
}

function createShardHtmlReportDir(shardId) {
  const baseDir = process.env.PLAYWRIGHT_HTML_REPORT_DIR ?? 'build/reports/playwright-shards';
  return path.join(baseDir, sanitizeShardId(shardId));
}

function sanitizeShardId(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
