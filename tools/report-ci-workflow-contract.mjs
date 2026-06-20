import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const WORKFLOW_PATH = resolve(ROOT, '.github/workflows/ci.yml');
const NODE_ACTION_PATH = resolve(ROOT, '.github/actions/setup-node-deps/action.yml');
const PLAYWRIGHT_ACTION_PATH = resolve(ROOT, '.github/actions/setup-playwright/action.yml');

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
  'package'
];

const REQUIRED_VISUAL_PROJECTS = ['chromium-desktop', 'chromium-tablet', 'chromium-mobile'];

const REQUIRED_BROWSER_COMMANDS = new Map([
  ['e2e-vitest', 'npm run test:e2e'],
  ['browser-yaml', 'npm run test:e2e:browser'],
  ['browser-reader-panel', 'npm run test:e2e:browser:reader-panel'],
  ['browser-smoke', 'npm run test:e2e:browser:smoke']
]);

function readRequired(path) {
  if (!existsSync(path)) {
    throw new Error(`Required CI contract file is missing: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

function getJobBlock(workflow, jobId) {
  const marker = `  ${jobId}:\n`;
  const start = workflow.indexOf(marker);
  if (start === -1) {
    throw new Error(`CI workflow is missing job "${jobId}".`);
  }
  const rest = workflow.slice(start + marker.length);
  const nextJob = rest.search(/\n  [a-zA-Z0-9_-]+:\n/);
  return nextJob === -1
    ? workflow.slice(start)
    : workflow.slice(start, start + marker.length + nextJob + 1);
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing expected content: ${needle}`);
  }
}

function assertNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label} still contains retired content: ${needle}`);
  }
}

function assertJobUsesAction(jobBlock, actionPath, jobId) {
  assertIncludes(jobBlock, `uses: ${actionPath}`, `job "${jobId}"`);
}

export function checkCiWorkflowContract({
  workflow = readRequired(WORKFLOW_PATH),
  nodeAction = readRequired(NODE_ACTION_PATH),
  playwrightAction = readRequired(PLAYWRIGHT_ACTION_PATH)
} = {}) {
  const failures = [];

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

  return {
    ok: failures.length === 0,
    failures
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = checkCiWorkflowContract();
  if (!result.ok) {
    console.error('CI workflow contract failed:');
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else if (!process.argv.includes('--check')) {
    console.log('CI workflow contract passed.');
  }
}
