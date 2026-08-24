import { describe, expect, it } from 'vitest';
import {
  createBrowserShardEnvironment,
  createBrowserShardTaskGraph,
  main
} from '../../../scripts/run-browser-test-shards.mjs';
import type { BrowserShardTask } from '../../../scripts/run-browser-test-shards.mjs';

function successfulHandle(profileId: string) {
  const emptyOutput = { bytes: 0, sha256: '', overflow: false, text: '' };
  return {
    child: null,
    cancel: () => true,
    completion: Promise.resolve({
      version: 'command-boundary-v1',
      profileId,
      cwd: process.cwd(),
      executable: null,
      argv: [],
      startedAt: 0,
      endedAt: 0,
      durationMs: 0,
      ok: true,
      terminalReason: 'success',
      exitCode: 0,
      signal: null,
      spawnError: null,
      timedOut: false,
      cancelled: false,
      escalation: [],
      closeObserved: true,
      pipeDrainObserved: true,
      output: {
        stdout: emptyOutput,
        stderr: emptyOutput,
        fd4: emptyOutput,
        fd5: emptyOutput
      }
    })
  };
}

describe('browser shard command graph', () => {
  it('registers the exact E2E and visual Playwright leaves', () => {
    expect(createBrowserShardTaskGraph('e2e').tasks).toEqual([
      {
        id: 'verify-runtime',
        name: 'Runtime engine guard',
        profile: 'node-script-standard-v1',
        args: ['scripts/verify-runtime.mjs'],
        dependsOn: []
      },
      {
        id: 'shard:yaml',
        name: 'browser shard yaml',
        profile: 'playwright-v1',
        args: ['test', 'tests/visual/yaml-config.interaction.spec.ts'],
        dependsOn: ['verify-runtime']
      },
      {
        id: 'shard:reader-panel',
        name: 'browser shard reader-panel',
        profile: 'playwright-v1',
        args: ['test', 'tests/e2e/readerPanelFlow.test.ts', '--config=playwright.reader.config.ts'],
        dependsOn: ['verify-runtime']
      },
      {
        id: 'shard:smoke',
        name: 'browser shard smoke',
        profile: 'playwright-v1',
        args: ['test', 'tests/visual/migration-harness.spec.ts', '--project=chromium-desktop'],
        dependsOn: ['verify-runtime']
      }
    ]);
    expect(
      createBrowserShardTaskGraph('visual')
        .tasks.slice(1)
        .map((task) => task.args)
    ).toEqual(
      ['chromium-desktop', 'chromium-tablet', 'chromium-mobile'].map((project) => [
        'test',
        '--config=playwright.config.ts',
        `--project=${project}`
      ])
    );
  });

  it('owns fixed, isolated output directories instead of accepting caller-selected paths', () => {
    const environment = createBrowserShardEnvironment('shard:reader-panel', {
      HOME: '/private/home',
      PLAYWRIGHT_DIST_DIR: '../../caller-dist',
      PLAYWRIGHT_OUTPUT_DIR: '../../caller-output',
      PLAYWRIGHT_HTML_REPORT_DIR: '../../caller-report'
    });

    expect(environment).toMatchObject({
      PLAYWRIGHT_SKIP_WEB_SERVER_BUILD: '1',
      PLAYWRIGHT_DIST_DIR: 'build/dist',
      PLAYWRIGHT_OUTPUT_DIR: 'test-results/browser-shards/reader-panel',
      PLAYWRIGHT_HTML_REPORT_DIR: 'build/reports/playwright-shards/reader-panel'
    });
  });

  it('executes the graph through injected bounded handles without a second queue', async () => {
    const started: string[] = [];
    const startCommand = (task: BrowserShardTask) => {
      started.push(task.id);
      return successfulHandle(task.profile);
    };

    const result = await main(['e2e'], { startCommand });

    expect(result.ok).toBe(true);
    expect(started).toEqual(['verify-runtime', 'shard:yaml', 'shard:reader-panel', 'shard:smoke']);
  });

  it('rejects unknown suites before a command can start', async () => {
    await expect(main(['firefox'])).rejects.toThrow('COORDINATOR_ARGUMENTS_INVALID');
  });
});
