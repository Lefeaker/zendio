import { parseCiWorkflowJobs } from './yamlSubset.mjs';
import {
  assertEqual,
  assertIncludes,
  assertJobUsesAction,
  assertNotIncludes,
  assertR01BrowserJob,
  getJobBlock,
  invokesOwnershipAudit
} from './model.mjs';

const REQUIRED_JOB_IDS = [
  'static-preflight',
  'static-release-surface',
  'static-generated-artifacts',
  'static-style-and-locale',
  'static-reporting-audits',
  'coverage',
  'visual',
  'e2e-vitest',
  'browser-yaml',
  'browser-reader-panel',
  'browser-smoke',
  'browser-video',
  'browser-firefox',
  'package'
];

const REQUIRED_VISUAL_PROJECTS = ['chromium-desktop', 'chromium-tablet', 'chromium-mobile'];

const REQUIRED_BROWSER_COMMANDS = new Map([
  ['e2e-vitest', 'npm run test:e2e'],
  ['browser-yaml', 'npm run test:e2e:browser'],
  ['browser-reader-panel', 'npm run test:e2e:browser:reader-panel'],
  ['browser-smoke', 'npm run test:e2e:browser:smoke'],
  ['browser-video', 'npm run test:e2e:browser:video'],
  ['browser-firefox', 'npm run test:e2e:browser:firefox']
]);

const R01_BROWSER_JOB_CONTRACTS = {
  'browser-video': {
    displayName: 'Browser video flow',
    steps: [
      { name: 'Checkout repository', uses: 'actions/checkout@v6' },
      { name: 'Setup Playwright', uses: './.github/actions/setup-playwright' },
      { name: 'Run browser video tests', run: 'npm run test:e2e:browser:video' },
      {
        name: 'Upload browser video reports',
        uses: 'actions/upload-artifact@v7',
        if: 'failure()',
        with: {
          name: 'browser-video-reports',
          path: 'test-results/',
          'if-no-files-found': 'ignore'
        }
      }
    ]
  },
  'browser-firefox': {
    displayName: 'Browser Firefox flow',
    steps: [
      { name: 'Checkout repository', uses: 'actions/checkout@v6' },
      { name: 'Setup Playwright', uses: './.github/actions/setup-playwright' },
      { name: 'Install Firefox browser', run: 'npx playwright install --with-deps firefox' },
      { name: 'Run browser Firefox tests', run: 'npm run test:e2e:browser:firefox' },
      {
        name: 'Upload browser Firefox reports',
        uses: 'actions/upload-artifact@v7',
        if: 'failure()',
        with: {
          name: 'browser-firefox-reports',
          path: 'tests/visual/__output__/\nbuild/reports/playwright/',
          'if-no-files-found': 'ignore'
        }
      }
    ]
  }
};

export function checkCiWorkflowContractInputs({
  workflow,
  firefoxReleaseWorkflow,
  nodeAction,
  packageJson,
  playwrightAction,
  qualityCheck
}) {
  const failures = [];
  let parsedWorkflow;

  function recordCheck(label, callback) {
    try {
      callback();
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const jobId of REQUIRED_JOB_IDS) {
    recordCheck(`job:${jobId}`, () => getJobBlock(workflow, jobId));
  }

  recordCheck('parsed-job-topology', () => {
    parsedWorkflow = parseCiWorkflowJobs(workflow);
    assertEqual(parsedWorkflow.order, REQUIRED_JOB_IDS, 'CI job ID order');
    if (parsedWorkflow.topLevelFields.includes('defaults')) {
      throw new Error('CI workflow must not define workflow-level run defaults');
    }
  });

  recordCheck('setup-node-deps-action', () => {
    assertIncludes(nodeAction, 'uses: actions/setup-node@v6', 'setup-node-deps action');
    assertIncludes(nodeAction, "node-version-file: '.nvmrc'", 'setup-node-deps action');
    assertIncludes(nodeAction, "cache: 'npm'", 'setup-node-deps action');
    assertIncludes(nodeAction, 'run: npm ci', 'setup-node-deps action');
  });

  recordCheck('setup-playwright-action', () => {
    assertIncludes(
      playwrightAction,
      'uses: ./.github/actions/setup-node-deps',
      'setup-playwright action'
    );
    assertIncludes(playwrightAction, 'uses: actions/cache@v4', 'setup-playwright action');
    assertIncludes(playwrightAction, 'path: ~/.cache/ms-playwright', 'setup-playwright action');
    assertIncludes(
      playwrightAction,
      'run: npx playwright install --with-deps chromium',
      'setup-playwright action'
    );
  });

  recordCheck('static-preflight-contract', () => {
    const job = getJobBlock(workflow, 'static-preflight');
    assertJobUsesAction(job, './.github/actions/setup-node-deps', 'static-preflight');
    assertIncludes(job, 'npm run audit:ci-workflow:check', 'static-preflight job');
    assertIncludes(job, 'npm run i18n:catalog:check', 'static-preflight job');
    assertIncludes(job, 'npm run verify:preflight', 'static-preflight job');
    const parsedJob = parsedWorkflow?.jobs.get('static-preflight');
    if (!parsedJob) throw new Error('parsed Static preflight job is missing');
    if (
      parsedJob.steps.some(
        (step) =>
          step.name === 'Verify canonical test suite ownership' || invokesOwnershipAudit(step.run)
      )
    ) {
      throw new Error('R01 must leave canonical ownership wiring out of Static preflight');
    }
  });

  recordCheck('static-release-surface-contract', () => {
    const job = getJobBlock(workflow, 'static-release-surface');
    assertJobUsesAction(job, './.github/actions/setup-node-deps', 'static-release-surface');
    assertIncludes(job, 'npm run build:fast', 'static-release-surface job');
    assertIncludes(job, 'npm run audit:release-surface:report', 'static-release-surface job');
  });

  recordCheck('static-generated-artifacts-contract', () => {
    const job = getJobBlock(workflow, 'static-generated-artifacts');
    assertJobUsesAction(job, './.github/actions/setup-node-deps', 'static-generated-artifacts');
    assertIncludes(job, 'npm run i18n:generate', 'static-generated-artifacts job');
    assertIncludes(
      job,
      'git diff --exit-code -- public/_locales',
      'static-generated-artifacts job'
    );
    assertIncludes(job, 'npm run manifest:generate', 'static-generated-artifacts job');
    assertIncludes(
      job,
      'git diff --exit-code -- public/manifest.json public/manifest.firefox.json',
      'static-generated-artifacts job'
    );
  });

  recordCheck('static-style-and-locale-contract', () => {
    const job = getJobBlock(workflow, 'static-style-and-locale');
    assertJobUsesAction(job, './.github/actions/setup-node-deps', 'static-style-and-locale');
    assertIncludes(job, 'npm run audit:locales:report', 'static-style-and-locale job');
    assertIncludes(job, 'npm run report:options-legacy', 'static-style-and-locale job');
    assertIncludes(job, 'npm run lint:options-css', 'static-style-and-locale job');
    assertIncludes(job, 'npm run lint:hardcoded', 'static-style-and-locale job');
    assertIncludes(job, 'npm run lint:warnings-guard', 'static-style-and-locale job');
  });

  recordCheck('static-reporting-audits-contract', () => {
    const job = getJobBlock(workflow, 'static-reporting-audits');
    assertJobUsesAction(job, './.github/actions/setup-node-deps', 'static-reporting-audits');
    assertIncludes(job, 'npm run audit:deps:report', 'static-reporting-audits job');
    assertIncludes(job, 'npm run audit:platform-services:report', 'static-reporting-audits job');
    assertIncludes(job, 'npm run audit:design-tokens:report', 'static-reporting-audits job');
    assertIncludes(job, 'continue-on-error: true', 'static-reporting-audits job');
  });

  recordCheck('coverage-contract', () => {
    const job = getJobBlock(workflow, 'coverage');
    assertJobUsesAction(job, './.github/actions/setup-node-deps', 'coverage');
    assertIncludes(job, 'npm run test:coverage', 'coverage job');
  });

  recordCheck('visual-matrix-contract', () => {
    const job = getJobBlock(workflow, 'visual');
    assertJobUsesAction(job, './.github/actions/setup-playwright', 'visual');
    assertIncludes(job, 'strategy:', 'visual job');
    assertIncludes(job, 'fail-fast: false', 'visual job');
    assertIncludes(job, 'project:', 'visual job');
    for (const project of REQUIRED_VISUAL_PROJECTS) {
      assertIncludes(job, project, 'visual job');
    }
    assertIncludes(job, 'npm run verify:runtime &&', 'visual job');
    assertIncludes(job, '--project=${{ matrix.project }}', 'visual job');
    assertIncludes(job, 'visual-reports-${{ matrix.project }}', 'visual job');
  });

  for (const [jobId, command] of REQUIRED_BROWSER_COMMANDS) {
    recordCheck(`${jobId}-contract`, () => {
      const job = getJobBlock(workflow, jobId);
      const setupAction =
        jobId === 'e2e-vitest'
          ? './.github/actions/setup-node-deps'
          : './.github/actions/setup-playwright';
      assertJobUsesAction(job, setupAction, jobId);
      assertIncludes(job, command, `job "${jobId}"`);
    });
  }

  for (const [jobId, contract] of Object.entries(R01_BROWSER_JOB_CONTRACTS)) {
    recordCheck(`${jobId}-parsed-contract`, () => {
      assertR01BrowserJob(parsedWorkflow?.jobs.get(jobId), contract);
    });
  }

  recordCheck('firefox-browser-install-uniqueness', () => {
    const firefoxInstallSteps = [...(parsedWorkflow?.jobs.values() ?? [])]
      .flatMap((job) => job.steps)
      .filter((step) => step.run?.includes('playwright install') && step.run.includes('firefox'));
    assertEqual(
      firefoxInstallSteps.map((step) => step.run),
      ['npx playwright install --with-deps firefox'],
      'workflow Firefox install commands'
    );
  });

  recordCheck('deferred-ownership-wiring-contract', () => {
    const parsedPackage = JSON.parse(packageJson);
    const scripts = parsedPackage.scripts ?? {};
    if (scripts.quality !== 'node scripts/quality-check.mjs') {
      throw new Error('quality script must remain delegated to scripts/quality-check.mjs');
    }
    if (invokesOwnershipAudit(scripts['verify:preflight'])) {
      throw new Error('verify:preflight must not wire canonical ownership in R01');
    }
    for (const [name, command] of Object.entries(scripts)) {
      if (
        name !== 'audit:test-suite-ownership:report' &&
        name !== 'audit:test-suite-ownership:check' &&
        invokesOwnershipAudit(command)
      ) {
        throw new Error(`package script "${name}" prematurely invokes canonical ownership`);
      }
    }
    if (invokesOwnershipAudit(qualityCheck)) {
      throw new Error('scripts/quality-check.mjs prematurely invokes canonical ownership');
    }
    assertNotIncludes(qualityCheck, 'test:e2e:browser', 'scripts/quality-check.mjs');
  });

  recordCheck('package-contract', () => {
    const job = getJobBlock(workflow, 'package');
    assertJobUsesAction(job, './.github/actions/setup-node-deps', 'package');
    assertIncludes(job, 'needs: [static-preflight]', 'package job');
    assertIncludes(job, 'npm run build:fast', 'package job');
    assertIncludes(job, 'npm run package:ci', 'package job');
  });

  recordCheck('retired-serial-jobs', () => {
    assertNotIncludes(workflow, '  static-gates:\n', 'workflow');
    assertNotIncludes(workflow, '  e2e:\n', 'workflow');
    assertNotIncludes(workflow, 'npm run visual:test', 'workflow');
    assertNotIncludes(
      workflow,
      `npm run test:e2e
          npm run test:e2e:browser
          npm run test:e2e:browser:reader-panel
          npm run test:e2e:browser:smoke`,
      'workflow'
    );
  });

  recordCheck('firefox-release-workflow-contract', () => {
    assertIncludes(firefoxReleaseWorkflow, 'name: Release Firefox AMO', 'Firefox release workflow');
    assertIncludes(firefoxReleaseWorkflow, 'workflow_dispatch:', 'Firefox release workflow');
    assertIncludes(firefoxReleaseWorkflow, "tags:\n      - 'v*'", 'Firefox release workflow');
    assertIncludes(
      firefoxReleaseWorkflow,
      'permissions:\n  contents: read',
      'Firefox release workflow'
    );
    assertIncludes(firefoxReleaseWorkflow, 'uses: actions/checkout@v6', 'Firefox release workflow');
    assertIncludes(
      firefoxReleaseWorkflow,
      'uses: ./.github/actions/setup-node-deps',
      'Firefox release workflow'
    );
    assertIncludes(firefoxReleaseWorkflow, 'FIREFOX_RELEASE_CHANNEL:', 'Firefox release workflow');
    assertIncludes(
      firefoxReleaseWorkflow,
      'FIREFOX_RELEASE_CHANNEL: listed',
      'Firefox release workflow'
    );
    assertIncludes(firefoxReleaseWorkflow, 'id: release_channel', 'Firefox release workflow');
    assertIncludes(firefoxReleaseWorkflow, 'GITHUB_EVENT_PATH', 'Firefox release workflow');
    assertIncludes(
      firefoxReleaseWorkflow,
      "printf 'FIREFOX_RELEASE_CHANNEL=%s\\n'",
      'Firefox release workflow'
    );
    assertIncludes(firefoxReleaseWorkflow, "printf 'channel=%s\\n'", 'Firefox release workflow');
    assertIncludes(
      firefoxReleaseWorkflow,
      '${safe_ref//[!A-Za-z0-9._-]/-}',
      'Firefox release workflow'
    );
    assertIncludes(firefoxReleaseWorkflow, "printf 'safe_ref=%s\\n'", 'Firefox release workflow');
    assertIncludes(
      firefoxReleaseWorkflow,
      'ZENDIO_GA_MEASUREMENT_ID: ${{ secrets.ZENDIO_GA_MEASUREMENT_ID }}',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'ZENDIO_GA_TRANSPORT_MODE: proxy',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'ZENDIO_GA_PROXY_ENDPOINT: ${{ secrets.ZENDIO_GA_PROXY_ENDPOINT }}',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'WEB_EXT_API_KEY: ${{ secrets.WEB_EXT_API_KEY }}',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'WEB_EXT_API_SECRET: ${{ secrets.WEB_EXT_API_SECRET }}',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'npm run analytics:validate:prod:required',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'npm run build:firefox:prod:ga:ci',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'node scripts/package-firefox.mjs "${sign_args[@]}"',
      'Firefox release workflow'
    );
    assertIncludes(firefoxReleaseWorkflow, '--approval-timeout 0', 'Firefox release workflow');
    assertIncludes(
      firefoxReleaseWorkflow,
      "find build/firefox-source -type f -name '*-source.zip'",
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'Expected exactly one Firefox AMO source archive',
      'Firefox release workflow'
    );
    assertIncludes(firefoxReleaseWorkflow, 'source_archive_path=%s\\n', 'Firefox release workflow');
    assertIncludes(
      firefoxReleaseWorkflow,
      'npm run audit:ga:client-secret',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'npm run audit:ga:release-surface -- "${archive_args[@]}"',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'uses: actions/upload-artifact@v7',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'name: firefox-amo-${{ steps.release_channel.outputs.channel }}-${{ steps.release_channel.outputs.safe_ref }}-${{ github.run_number }}',
      'Firefox release workflow'
    );
    assertIncludes(
      firefoxReleaseWorkflow,
      'build/firefox-source/**/*-source.zip',
      'Firefox release workflow'
    );
    assertIncludes(firefoxReleaseWorkflow, 'if-no-files-found: error', 'Firefox release workflow');
    assertNotIncludes(
      firefoxReleaseWorkflow,
      'node --env-file=.env.production.local',
      'Firefox release workflow'
    );
    assertNotIncludes(firefoxReleaseWorkflow, 'inputs.channel ||', 'Firefox release workflow');
    assertNotIncludes(firefoxReleaseWorkflow, 'github.ref_name }}', 'Firefox release workflow');
    assertNotIncludes(
      firefoxReleaseWorkflow,
      'npm run package:firefox\n',
      'Firefox release workflow'
    );
  });

  recordCheck('firefox-release-package-script-contract', () => {
    assertIncludes(
      packageJson,
      '"analytics:validate:prod:required": "node scripts/setup-error-analytics.js --require-env --require-zendio-env --require-proxy-transport"',
      'package scripts'
    );
    assertNotIncludes(
      packageJson,
      '"analytics:validate:prod:required": "node --env-file',
      'package scripts'
    );
  });

  return {
    ok: failures.length === 0,
    failures
  };
}
