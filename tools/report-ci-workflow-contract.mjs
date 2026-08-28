import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFirefoxAmoReleaseWorkflowContract } from './report-firefox-amo-release-workflow.mjs';
import { getJobBlock } from './ciWorkflowContract/model.mjs';
import { parseCiWorkflowJobs } from './ciWorkflowContract/yamlSubset.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WORKFLOW_PATH = resolve(ROOT, '.github/workflows/ci.yml');
const FIREFOX_RELEASE_WORKFLOW_PATH = resolve(ROOT, '.github/workflows/release-firefox-amo.yml');
const NODE_ACTION_PATH = resolve(ROOT, '.github/actions/setup-node-deps/action.yml');
const PLAYWRIGHT_ACTION_PATH = resolve(ROOT, '.github/actions/setup-playwright/action.yml');
const PACKAGE_JSON_PATH = resolve(ROOT, 'package.json');
const QUALITY_CHECK_PATH = resolve(ROOT, 'scripts/quality-check.mjs');

const JOB_ORDER = [
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
  'browser-state',
  'browser-architecture',
  'package'
];

const JOB_POLICY = Object.freeze({
  'static-preflight': ['static-preflight-v1', '60'],
  'static-release-surface': ['generic-v1', '30'],
  'static-generated-artifacts': ['generic-v1', '30'],
  'static-style-and-locale': ['generic-v1', '30'],
  'static-reporting-audits': ['generic-v1', '30'],
  coverage: ['generic-v1', '30'],
  visual: ['browser-v1', '60'],
  'e2e-vitest': ['generic-v1', '30'],
  'browser-yaml': ['browser-v1', '60'],
  'browser-reader-panel': ['browser-v1', '60'],
  'browser-smoke': ['browser-v1', '60'],
  'browser-video': ['browser-v1', '60'],
  'browser-firefox': ['browser-v1', '60'],
  'browser-state': ['browser-v1', '60'],
  'browser-architecture': ['browser-v1', '60'],
  package: ['package-extension-v1', '35']
});

const G00_BROWSER_JOB_CONTRACTS = Object.freeze({
  'browser-state': {
    displayName: 'Browser state flow',
    command:
      'node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:state',
    artifactName: 'browser-state-reports'
  },
  'browser-architecture': {
    displayName: 'Browser architecture flow',
    command:
      'node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:architecture',
    artifactName: 'browser-architecture-reports'
  }
});

const G01_STATIC_PREFLIGHT_SUFFIX = Object.freeze([
  {
    name: 'Verify UI production ownership',
    run: 'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:ui-production-ownership:check'
  },
  {
    name: 'Build production bundle for CSS ownership',
    run: 'node scripts/run-bounded-command.mjs --profile npm-script-build-v1 -- build:fast'
  },
  {
    name: 'Verify content CSS packs',
    run: 'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:content-css-packs:check'
  },
  {
    name: 'Verify design token alignment',
    run: 'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:design-tokens:check'
  },
  {
    name: 'Verify active document governance',
    run: 'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:active-documents:check'
  }
]);

const G01_STYLELINT_RUN =
  'node scripts/run-bounded-command.mjs --profile stylelint-v1 -- "src/options/**/*.css" "src/onboarding/**/*.css" "src/ui/**/*.css"';

const EXPECTED_RUNS = Object.freeze({
  'static-preflight': [
    'node scripts/run-bounded-command.mjs --profile npm-script-quick-v1 -- audit:ci-workflow:check',
    'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:test-suite-ownership:check',
    'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- i18n:catalog:check',
    'node scripts/verify-preflight.mjs',
    ...G01_STATIC_PREFLIGHT_SUFFIX.map(({ run }) => run)
  ],
  'static-release-surface': [
    'node scripts/run-bounded-command.mjs --profile npm-script-build-v1 -- build:fast',
    'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:release-surface:report'
  ],
  'static-generated-artifacts': [
    'node scripts/run-bounded-command.mjs --profile generated-artifact-check-v1 -- locales',
    'node scripts/run-bounded-command.mjs --profile generated-artifact-check-v1 -- manifests'
  ],
  'static-style-and-locale': [
    'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:locales:report',
    'node scripts/run-bounded-command.mjs --profile npm-script-quick-v1 -- report:options-legacy',
    G01_STYLELINT_RUN,
    'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- lint:hardcoded',
    'node scripts/run-bounded-command.mjs --profile npm-script-quick-v1 -- lint:warnings-guard'
  ],
  'static-reporting-audits': [
    'node scripts/run-bounded-command.mjs --profile dependency-cruiser-v1',
    'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:platform-services:report',
    'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:design-tokens:report'
  ],
  coverage: [
    'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.unit.config.ts --coverage',
    'node scripts/run-bounded-command.mjs --profile coverage-summary-v1'
  ],
  visual: [
    'node scripts/run-bounded-command.mjs --profile playwright-v1 -- test --config=playwright.config.ts --project=${{ matrix.project }}'
  ],
  'e2e-vitest': [
    'node scripts/run-bounded-command.mjs --profile vitest-v1 -- run --config vitest.e2e.config.ts'
  ],
  'browser-yaml': [
    'node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser'
  ],
  'browser-reader-panel': [
    'node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:reader-panel'
  ],
  'browser-smoke': [
    'node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:smoke'
  ],
  'browser-video': [
    'node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:video'
  ],
  'browser-firefox': [
    'node scripts/run-bounded-command.mjs --profile playwright-host-deps-platform-v1 -- firefox-with-host-deps',
    'node scripts/run-bounded-command.mjs --profile playwright-browser-install-v1 -- firefox-with-host-deps',
    'node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:firefox'
  ],
  'browser-state': [G00_BROWSER_JOB_CONTRACTS['browser-state'].command],
  'browser-architecture': [G00_BROWSER_JOB_CONTRACTS['browser-architecture'].command],
  package: [
    'node scripts/run-bounded-command.mjs --profile npm-script-build-v1 -- build:fast',
    'node scripts/run-bounded-command.mjs --profile npm-script-quick-v1 -- validate:i18n:budgets',
    'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- layout:report',
    'node scripts/run-bounded-command.mjs --profile npm-script-quick-v1 -- report:layout',
    'node scripts/run-bounded-command.mjs --profile npm-script-quick-v1 -- report:release-summary',
    'node scripts/run-bounded-command.mjs --profile npm-script-build-v1 -- package:ci'
  ]
});

function readRequired(path) {
  if (!existsSync(path)) throw new Error(`Required CI contract file is missing: ${path}`);
  return readFileSync(path, 'utf8');
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function g00BrowserJobContract(job, block, contract) {
  if (!same(job.fields, ['name', 'runs-on', 'timeout-minutes', 'steps'])) {
    throw new Error('top-level job fields changed');
  }
  if (job.name !== contract.displayName) throw new Error('display name changed');
  if (job.needs !== undefined || job.if !== undefined || job.continueOnError !== undefined) {
    throw new Error('job must remain unconditional and independent');
  }
  const setupSteps = job.steps.filter((step) => step.uses === './.github/actions/setup-playwright');
  if (setupSteps.length !== 1 || setupSteps[0].id !== 'playwright') {
    throw new Error('setup Playwright step changed');
  }
  const testSteps = job.steps.filter((step) => step.run === contract.command);
  if (
    testSteps.length !== 1 ||
    testSteps[0].if !== undefined ||
    testSteps[0].continueOnError !== undefined
  ) {
    throw new Error('canonical browser test step changed or became conditional');
  }
  const uploadSteps = job.steps.filter((step) => step.uses === 'actions/upload-artifact@v7');
  if (
    uploadSteps.length !== 1 ||
    uploadSteps[0].if !== 'failure()' ||
    uploadSteps[0].with?.name !== contract.artifactName ||
    uploadSteps[0].with?.path !== 'test-results/' ||
    uploadSteps[0].with?.['if-no-files-found'] !== 'ignore'
  ) {
    throw new Error('failure artifact contract changed');
  }
  for (const binding of [
    'ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: ${{ steps.playwright.outputs.attempt-root }}',
    'PLAYWRIGHT_BROWSERS_PATH: ${{ steps.playwright.outputs.playwright-browsers-path }}',
    'NPM_CONFIG_USERCONFIG: ${{ steps.playwright.outputs.npm-userconfig }}',
    'NPM_CONFIG_GLOBALCONFIG: ${{ steps.playwright.outputs.npm-globalconfig }}'
  ]) {
    if (count(block, new RegExp(binding.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu')) !== 1) {
      throw new Error(`missing or duplicate setup output binding: ${binding}`);
    }
  }
  if (/\b(?:needs|matrix|continue-on-error):|GITHUB_ENV|\bnpx\b|\bnpm exec\b/imu.test(block)) {
    throw new Error('browser job exposes masking, aggregation, or raw executable routes');
  }
}

function staticOwnershipStepContract(job) {
  const ownershipSteps = job.steps.filter(
    (step) =>
      step.name === 'Verify canonical test suite ownership' ||
      String(step.run ?? '').includes('audit:test-suite-ownership')
  );
  if (ownershipSteps.length !== 1) {
    throw new Error('Static preflight must contain exactly one ownership step');
  }
  const [step] = ownershipSteps;
  if (
    step.name !== 'Verify canonical test suite ownership' ||
    step.run !==
      'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:test-suite-ownership:check' ||
    step.if !== undefined ||
    step.continueOnError !== undefined
  ) {
    throw new Error('Static preflight ownership step changed or became conditional');
  }
}

function staticG01GateContract(job) {
  const preflightIndex = job.steps.findIndex(
    (step) => step.run === 'node scripts/verify-preflight.mjs'
  );
  if (preflightIndex < 0) throw new Error('Static preflight baseline step is missing');

  for (const [offset, expected] of G01_STATIC_PREFLIGHT_SUFFIX.entries()) {
    const matches = job.steps.filter(
      (step) => step.name === expected.name || step.run === expected.run
    );
    if (matches.length !== 1) throw new Error(`Static preflight ${expected.name} is not unique`);
    const [step] = matches;
    if (
      step.name !== expected.name ||
      step.run !== expected.run ||
      step.if !== undefined ||
      step.continueOnError !== undefined ||
      job.steps[preflightIndex + offset + 1] !== step
    ) {
      throw new Error(`Static preflight ${expected.name} changed, reordered, or became masked`);
    }
  }

  const runs = job.steps.flatMap((step) => (step.run ? [step.run] : []));
  if (runs.some((run) => run.includes('audit:performance:report') || /\bquality\b/u.test(run))) {
    throw new Error('Static preflight duplicates performance or invokes quality');
  }
}

function staticStylelintStepContract(job) {
  const matches = job.steps.filter(
    (step) => step.name === 'Lint Options CSS' || step.run === G01_STYLELINT_RUN
  );
  if (matches.length !== 1) throw new Error('Static style Stylelint step is not unique');
  const [step] = matches;
  if (
    step.name !== 'Lint Options CSS' ||
    step.run !== G01_STYLELINT_RUN ||
    step.if !== undefined ||
    step.continueOnError !== undefined
  ) {
    throw new Error('Static style Stylelint command changed or became masked');
  }
}

function bootstrapContract(source) {
  if (count(source, /\$\((?!\()/gu) !== 1 || !source.includes('$(compgen -e)')) {
    throw new Error('bootstrap must contain only the bounded compgen substitution');
  }
  for (const required of [
    'set -euo pipefail',
    'shopt -s nocasematch',
    'NODE_OPTIONS',
    'npm_config_*',
    '/proc/uptime',
    'set -o noclobber',
    'zendio-ci-command-start-v1',
    'umask 077'
  ]) {
    if (!source.includes(required)) throw new Error(`bootstrap is missing ${required}`);
  }
  if (/^\s*(?:node|npm|npx|git|mkdir|rm|curl|wget)\b/imu.test(source)) {
    throw new Error('bootstrap invokes an external command');
  }
}

export { parseCiWorkflowJobs };

export function checkCiWorkflowContract({
  workflow = readRequired(WORKFLOW_PATH),
  firefoxReleaseWorkflow = readRequired(FIREFOX_RELEASE_WORKFLOW_PATH),
  nodeAction = readRequired(NODE_ACTION_PATH),
  packageJson = readRequired(PACKAGE_JSON_PATH),
  playwrightAction = readRequired(PLAYWRIGHT_ACTION_PATH),
  qualityCheck = readRequired(QUALITY_CHECK_PATH)
} = {}) {
  const failures = [];
  const check = (label, operation) => {
    try {
      operation();
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  let parsed;
  check('workflow-parse', () => {
    parsed = parseCiWorkflowJobs(workflow);
    if (!same(parsed.order, JOB_ORDER)) throw new Error('job order changed');
    if (parsed.topLevelFields.includes('defaults'))
      throw new Error('workflow defaults are forbidden');
  });

  check('setup-node-deps', () => {
    if (count(nodeAction, /uses: actions\/setup-node@v6/gu) !== 1) {
      throw new Error('setup-node@v6 must run exactly once');
    }
    for (const required of [
      "node-version-file: '.nvmrc'",
      'package-manager-cache: false',
      'id: install',
      'node scripts/run-bounded-command.mjs --profile github-ci-install-v1',
      'attempt-root:',
      'npm-userconfig:',
      'npm-globalconfig:'
    ]) {
      if (!nodeAction.includes(required)) throw new Error(`missing ${required}`);
    }
    if (/actions\/cache|^\s*cache:|run:\s+(?:npm|npx)\b|GITHUB_ENV/imu.test(nodeAction)) {
      throw new Error('setup-node-deps exposes a cache or raw package-manager route');
    }
  });

  check('setup-playwright', () => {
    if (count(playwrightAction, /uses: \.\/\.github\/actions\/setup-node-deps/gu) !== 1) {
      throw new Error('setup-playwright must call setup-node-deps exactly once');
    }
    for (const required of [
      'playwright-host-deps-platform-v1 -- chromium-with-host-deps',
      'playwright-browser-install-v1 -- chromium-with-host-deps',
      'playwright-browsers-path:',
      'NPM_CONFIG_USERCONFIG:',
      'NPM_CONFIG_GLOBALCONFIG:',
      'PLAYWRIGHT_BROWSERS_PATH:'
    ]) {
      if (!playwrightAction.includes(required)) throw new Error(`missing ${required}`);
    }
    if (
      /actions\/cache|^\s*cache:|run:\s+(?:npm|npx)\b|GITHUB_ENV|\$\{\{\s*inputs\./imu.test(
        playwrightAction
      )
    ) {
      throw new Error(
        'setup-playwright exposes cache, raw package-manager, or caller interpolation'
      );
    }
  });

  check('package-manager-declaration', () => {
    const parsedPackage = JSON.parse(packageJson);
    if (parsedPackage.packageManager || parsedPackage.devEngines?.packageManager) {
      throw new Error('package-manager auto-cache declaration is forbidden');
    }
    if (parsedPackage.scripts?.quality !== 'node scripts/quality-check.mjs') {
      throw new Error('quality route changed');
    }
    if (!qualityCheck.includes("policyId: 'quality-v1'"))
      throw new Error('quality policy is missing');
  });

  for (const jobId of JOB_ORDER) {
    check(`job:${jobId}`, () => {
      const job = parsed?.jobs.get(jobId);
      if (!job) throw new Error('job is missing');
      const [jobClass, timeout] = JOB_POLICY[jobId];
      if (job.runsOn !== 'ubuntu-24.04' || job.timeoutMinutes !== timeout) {
        throw new Error('runner or timeout taxonomy changed');
      }
      const [bootstrap, checkout, setup] = job.steps;
      if (
        bootstrap?.name !== 'Bootstrap command boundary' ||
        checkout?.uses !== 'actions/checkout@v6'
      ) {
        throw new Error('bootstrap and checkout must be the first two steps');
      }
      bootstrapContract(bootstrap.run ?? '');
      const setupAction =
        jobId === 'browser-firefox' || (!jobId.startsWith('browser-') && jobId !== 'visual')
          ? './.github/actions/setup-node-deps'
          : './.github/actions/setup-playwright';
      if (setup?.uses !== setupAction) throw new Error('setup action changed');
      const block = getJobBlock(workflow, jobId);
      if (
        !block.includes(`ZENDIO_JOB_CLASS: ${jobClass}`) ||
        !block.includes(`ZENDIO_JOB_TIMEOUT_MINUTES: '${timeout}'`)
      ) {
        throw new Error('job class or timeout input changed');
      }
      const runs = job.steps.slice(1).flatMap((step) => (step.run ? [step.run] : []));
      if (!same(runs, EXPECTED_RUNS[jobId])) throw new Error('managed command sequence changed');
      for (const run of runs) {
        if (!run.startsWith('node ')) {
          throw new Error('raw or non-Node command route found');
        }
      }
      const g00Contract = G00_BROWSER_JOB_CONTRACTS[jobId];
      if (g00Contract) g00BrowserJobContract(job, block, g00Contract);
      if (jobId === 'static-preflight') {
        staticOwnershipStepContract(job);
        staticG01GateContract(job);
      }
      if (jobId === 'static-style-and-locale') staticStylelintStepContract(job);
    });
  }

  check('bootstrap-equality', () => {
    const bodies = JOB_ORDER.map((jobId) => parsed?.jobs.get(jobId)?.steps[0]?.run);
    if (new Set(bodies).size !== 1) throw new Error('bootstrap source differs between jobs');
  });

  check('workflow-closed-routes', () => {
    if (/actions\/cache|^\s*cache:|GITHUB_ENV|\bnpx\b|\bpnpx\b|\bnpm exec\b/imu.test(workflow)) {
      throw new Error('workflow contains a cache, GITHUB_ENV, or raw executable route');
    }
    if (!workflow.includes('needs: [static-preflight]'))
      throw new Error('package dependency changed');
    if (!workflow.includes('fail-fast: false')) throw new Error('visual matrix policy changed');
  });

  check('firefox-release-contract', () => {
    const result = checkFirefoxAmoReleaseWorkflowContract({ workflow: firefoxReleaseWorkflow });
    if (!result.ok) throw new Error(result.failures.join('; '));
  });

  return { ok: failures.length === 0, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkCiWorkflowContract();
  if (!result.ok) {
    console.error('CI workflow contract failed:');
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else if (!process.argv.includes('--check')) {
    console.log('CI workflow contract passed.');
  }
}
