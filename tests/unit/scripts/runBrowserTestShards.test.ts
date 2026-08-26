import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createBrowserShardEnvironment,
  createBrowserShardTaskGraph,
  main
} from '../../../scripts/run-browser-test-shards.mjs';
import type { BrowserShardTask } from '../../../scripts/run-browser-test-shards.mjs';
import { resolveCommandProfile } from '../../../scripts/config/commandBoundaryProfiles.mjs';
import { startBoundedCommand } from '../../../scripts/utils/boundedCommand.mjs';
import type { BoundedCommandResult } from '../../../scripts/utils/boundedCommand.mjs';

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
  it('registers the exact E2E, visual and bundled Chromium Playwright leaves', () => {
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
    expect(createBrowserShardTaskGraph('bundled').tasks.slice(1)).toEqual([
      {
        id: 'shard:bundled-e2e',
        name: 'browser shard bundled-e2e',
        profile: 'playwright-v1',
        args: [
          'test',
          '--config=playwright.bundled-chromium.config.ts',
          '--project=chromium-desktop',
          'tests/e2e/optionsCrossContextMutation.browser.test.ts',
          'tests/e2e/sessionDraftConcurrency.browser.test.ts',
          'tests/e2e/uiPrimitiveTokenParity.browser.test.ts',
          'tests/e2e/videoScreenshotCacheMigration.browser.test.ts'
        ],
        dependsOn: ['verify-runtime']
      },
      {
        id: 'shard:bundled-visual',
        name: 'browser shard bundled-visual',
        profile: 'playwright-v1',
        args: [
          'test',
          '--config=playwright.bundled-chromium.config.ts',
          '--project=chromium-desktop',
          'tests/visual/options.stitch-secondary.parity.spec.ts',
          'tests/visual/preview.runtime.alignment.spec.ts',
          'tests/visual/preview.task-success.layout.spec.ts',
          'tests/visual/migration-harness.spec.ts'
        ],
        dependsOn: ['shard:bundled-e2e']
      }
    ]);
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

    expect(
      createBrowserShardEnvironment('shard:bundled-e2e', {
        PLAYWRIGHT_WEB_SERVER_PORT: '9999',
        PLAYWRIGHT_DIST_DIR: '../../caller-dist'
      })
    ).toMatchObject({
      PLAYWRIGHT_SKIP_WEB_SERVER_BUILD: '1',
      PLAYWRIGHT_WEB_SERVER_PORT: '43103',
      PLAYWRIGHT_DIST_DIR: 'build/dist-u02c2-bundled-chromium',
      PLAYWRIGHT_OUTPUT_DIR: 'test-results/browser-shards/bundled-e2e',
      PLAYWRIGHT_HTML_REPORT_DIR: 'build/reports/playwright-shards/bundled-e2e'
    });
    expect(createBrowserShardEnvironment('shard:bundled-visual')).toMatchObject({
      PLAYWRIGHT_WEB_SERVER_PORT: '43104',
      PLAYWRIGHT_DIST_DIR: 'build/dist-u02c2-bundled-chromium',
      PLAYWRIGHT_OUTPUT_DIR: 'test-results/browser-shards/bundled-visual',
      PLAYWRIGHT_HTML_REPORT_DIR: 'build/reports/playwright-shards/bundled-visual'
    });
  });

  it('requires bundled extension leaves to consume the coordinator-owned dist directory', () => {
    for (const file of [
      'tests/e2e/optionsCrossContextMutation.browser.test.ts',
      'tests/e2e/sessionDraftConcurrency.browser.test.ts',
      'tests/e2e/videoScreenshotCacheMigration.browser.test.ts'
    ]) {
      const source = readFileSync(resolve(file), 'utf8');
      expect(source).toContain('PLAYWRIGHT_DIST_DIR');
      expect(source).toContain("'--headless=new'");
      expect(source).toContain('headless: false');
      expect(source).not.toContain('channel:');
      expect(source).not.toContain('executablePath');
    }
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

  it('cancels a real active Playwright composite after the first browser shard failure', async () => {
    const environment = { HOME: process.env.HOME, TMPDIR: '/tmp' };
    const guardSpec = resolveCommandProfile('fixture-v1', ['success', 'guard-ok'], {
      environment
    });
    const failedSpec = resolveCommandProfile('fixture-v1', ['exit', '7'], { environment });
    const liveSpec = resolveCommandProfile('fixture-v1', ['ignore-term', '5000'], {
      environment
    });
    const started: string[] = [];
    const observed = new Map<string, BoundedCommandResult>();
    const startCommand = (task: BrowserShardTask) => {
      started.push(task.id);
      const leafSpec = task.id === 'shard:yaml' ? failedSpec : liveSpec;
      const handle = startBoundedCommand(
        { profileId: task.profile, arguments: task.args },
        {
          environment,
          resolveProfile(profileId) {
            if (task.id === 'verify-runtime') return { ...guardSpec, profileId };
            return {
              ...(profileId === 'node-script-standard-v1' ? guardSpec : leafSpec),
              profileId
            };
          }
        }
      );
      void handle.completion.then((result) => observed.set(task.id, result));
      return handle;
    };

    const result = await main(['e2e'], { startCommand });

    expect(result.ok).toBe(false);
    expect(started).toEqual(['verify-runtime', 'shard:yaml', 'shard:reader-panel']);
    expect(observed.get('shard:yaml')).toMatchObject({
      terminalReason: 'nonzero',
      exitCode: 7
    });
    expect(observed.get('shard:reader-panel')).toMatchObject({
      ok: false,
      terminalReason: 'nonzero',
      cancelled: true,
      closeObserved: true,
      pipeDrainObserved: true
    });
    expect(started).not.toContain('shard:smoke');
  });

  it('rejects unknown suites before a command can start', async () => {
    await expect(main(['firefox'])).rejects.toThrow('COORDINATOR_ARGUMENTS_INVALID');
  });
});
