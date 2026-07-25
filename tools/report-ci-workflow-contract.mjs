import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WORKFLOW_PATH = resolve(ROOT, '.github/workflows/ci.yml');
const FIREFOX_RELEASE_WORKFLOW_PATH = resolve(ROOT, '.github/workflows/release-firefox-amo.yml');
const NODE_ACTION_PATH = resolve(ROOT, '.github/actions/setup-node-deps/action.yml');
const PLAYWRIGHT_ACTION_PATH = resolve(ROOT, '.github/actions/setup-playwright/action.yml');
const PACKAGE_JSON_PATH = resolve(ROOT, 'package.json');
const QUALITY_CHECK_PATH = resolve(ROOT, 'scripts/quality-check.mjs');

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

function readRequired(path) {
  if (!existsSync(path)) {
    throw new Error(`Required CI contract file is missing: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

export function parseCiWorkflowJobs(workflow) {
  const lines = workflow.replaceAll('\r\n', '\n').split('\n');
  const jobsIndex = lines.findIndex((line) => line === 'jobs:');
  if (jobsIndex < 0) {
    throw new Error('CI workflow has no top-level jobs mapping.');
  }
  const topLevelFields = lines.map((line) => parseYamlField(line, 0)?.key).filter(Boolean);

  const jobs = new Map();
  const order = [];
  let currentJob;
  let currentStep;
  let inSteps = false;
  let inWith = false;

  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !line.startsWith(' ')) {
      break;
    }

    const jobMatch = parseYamlField(line, 2);
    if (jobMatch) {
      const id = jobMatch.key;
      if (jobMatch.rawValue !== '') {
        throw new Error(`CI workflow job "${id}" must be a mapping.`);
      }
      if (jobs.has(id)) {
        throw new Error(`CI workflow contains duplicate job "${id}".`);
      }
      currentJob = { id, fields: [], steps: [] };
      jobs.set(id, currentJob);
      order.push(id);
      currentStep = undefined;
      inSteps = false;
      inWith = false;
      continue;
    }
    if (!currentJob) continue;

    const jobField = parseYamlField(line, 4);
    if (jobField) {
      const { key, rawValue } = jobField;
      currentJob.fields.push(key);
      if (key === 'steps') {
        inSteps = true;
      } else if (
        ['name', 'runs-on', 'timeout-minutes', 'needs', 'if', 'continue-on-error'].includes(key)
      ) {
        currentJob[toCamelCase(key)] = parseYamlScalar(rawValue);
      }
      currentStep = undefined;
      inWith = false;
      continue;
    }
    if (!inSteps) continue;

    const stepStart = parseYamlField(line, 6, true);
    if (stepStart) {
      const { key, rawValue } = stepStart;
      currentStep = {};
      currentJob.steps.push(currentStep);
      currentStep[toCamelCase(key)] = parseYamlScalar(rawValue);
      inWith = false;
      continue;
    }
    if (!currentStep) continue;

    const stepField = parseYamlField(line, 8);
    if (stepField) {
      const { key, rawValue } = stepField;
      if (key === 'with') {
        currentStep.with = {};
        inWith = true;
        continue;
      }
      inWith = false;
      if (rawValue === '|') {
        const block = readYamlBlock(lines, index, 8);
        currentStep[toCamelCase(key)] = block.value;
        index = block.nextIndex - 1;
      } else {
        currentStep[toCamelCase(key)] = parseYamlScalar(rawValue);
      }
      continue;
    }

    if (inWith) {
      const withField = parseYamlField(line, 10);
      if (withField) {
        const { key, rawValue } = withField;
        if (rawValue === '|') {
          const block = readYamlBlock(lines, index, 10);
          currentStep.with[key] = block.value;
          index = block.nextIndex - 1;
        } else {
          currentStep.with[key] = parseYamlScalar(rawValue);
        }
      }
    }
  }

  return { order, jobs, topLevelFields };
}

function parseYamlField(line, indentation, sequence = false) {
  const prefix = `${' '.repeat(indentation)}${sequence ? '- ' : ''}`;
  if (!line.startsWith(prefix)) return undefined;
  const rest = line.slice(prefix.length);
  let key;
  let remainder;
  if (rest.startsWith('"')) {
    const match = /^("(?:\\.|[^"\\])*"):(.*)$/u.exec(rest);
    if (!match) return undefined;
    key = decodeYamlDoubleQuotedKey(match[1]);
    if (key === undefined) return undefined;
    remainder = match[2];
  } else if (rest.startsWith("'")) {
    const match = /^('(?:''|[^'])*'):(.*)$/u.exec(rest);
    if (!match) return undefined;
    key = match[1].slice(1, -1).replaceAll("''", "'");
    remainder = match[2];
  } else {
    const match = /^([A-Za-z0-9_-]+):(.*)$/u.exec(rest);
    if (!match) return undefined;
    key = match[1];
    remainder = match[2];
  }
  if (typeof key !== 'string' || !/^\s*(?:\S[\s\S]*)?$/u.test(remainder)) return undefined;
  return { key, rawValue: remainder.trimStart() };
}

function decodeYamlDoubleQuotedKey(value) {
  const simpleEscapes = new Map([
    ['0', '\u0000'],
    ['a', '\u0007'],
    ['b', '\b'],
    ['t', '\t'],
    ['n', '\n'],
    ['v', '\u000b'],
    ['f', '\f'],
    ['r', '\r'],
    ['e', '\u001b'],
    [' ', ' '],
    ['"', '"'],
    ['/', '/'],
    ['\\', '\\'],
    ['N', '\u0085'],
    ['_', '\u00a0'],
    ['L', '\u2028'],
    ['P', '\u2029']
  ]);
  let decoded = '';

  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index];
    if (character !== '\\') {
      decoded += character;
      continue;
    }

    const escape = value[index + 1];
    if (simpleEscapes.has(escape)) {
      decoded += simpleEscapes.get(escape);
      index += 1;
      continue;
    }

    const width = escape === 'x' ? 2 : escape === 'u' ? 4 : escape === 'U' ? 8 : 0;
    const digits = value.slice(index + 2, index + 2 + width);
    if (width === 0 || digits.length !== width || !/^[0-9a-f]+$/iu.test(digits)) {
      return undefined;
    }
    const codePoint = Number.parseInt(digits, 16);
    if (codePoint > 0x10ffff) return undefined;
    decoded += String.fromCodePoint(codePoint);
    index += width + 1;
  }

  return decoded;
}

function readYamlBlock(lines, parentIndex, parentIndent) {
  const blockLines = [];
  let nextIndex = parentIndex + 1;
  for (; nextIndex < lines.length; nextIndex += 1) {
    const line = lines[nextIndex];
    if (line.length === 0) {
      blockLines.push('');
      continue;
    }
    const indentation = line.match(/^ */u)?.[0].length ?? 0;
    if (indentation <= parentIndent) break;
    blockLines.push(line);
  }
  while (blockLines.at(-1) === '') blockLines.pop();
  const nonEmpty = blockLines.filter((line) => line.trim().length > 0);
  const commonIndent =
    nonEmpty.length === 0
      ? parentIndent + 2
      : Math.min(...nonEmpty.map((line) => line.match(/^ */u)?.[0].length ?? 0));
  return {
    value: blockLines.map((line) => line.slice(Math.min(commonIndent, line.length))).join('\n'),
    nextIndex
  };
}

function parseYamlScalar(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

function assertEqual(actual, expected, label) {
  if (stableSerialize(actual) !== stableSerialize(expected)) {
    throw new Error(
      `${label} differs: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertR01BrowserJob(job, contract) {
  if (!job) throw new Error('job is missing');
  assertEqual(
    job.fields,
    ['name', 'runs-on', 'timeout-minutes', 'steps'],
    `job "${job.id}" top-level fields`
  );
  assertEqual(job.name, contract.displayName, `job "${job.id}" display name`);
  assertEqual(job.runsOn, 'ubuntu-latest', `job "${job.id}" runner`);
  const timeout = Number(job.timeoutMinutes);
  if (!Number.isInteger(timeout) || timeout < 20) {
    throw new Error(`job "${job.id}" timeout must be an integer of at least 20 minutes`);
  }
  if (job.needs !== undefined) {
    throw new Error(`job "${job.id}" must remain independent and have no needs dependency`);
  }
  if (job.if !== undefined || job.continueOnError !== undefined) {
    throw new Error(`job "${job.id}" must not be conditional or use continue-on-error`);
  }
  assertEqual(job.steps, contract.steps, `job "${job.id}" ordered step contract`);
  if (job.steps.some((step) => step.continueOnError !== undefined)) {
    throw new Error(`job "${job.id}" must not use continue-on-error`);
  }
  for (const step of job.steps) {
    if (step.if !== undefined && step.if !== 'failure()') {
      throw new Error(`job "${job.id}" has an unsupported conditional step: ${step.name}`);
    }
    if (step.if === 'failure()' && !step.name.startsWith('Upload browser ')) {
      throw new Error(`job "${job.id}" masks a non-artifact step behind failure()`);
    }
  }
}

function invokesOwnershipAudit(value) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/\\\r?\n/gu, '')
    .replace(/["']/gu, '')
    .replace(/\\([a-z0-9_./:-])/gu, '$1');
  const reportMarker = normalized.indexOf('report-test-suite-owner');
  const reportFilePatterns = normalized
    .split(/[\s`;&|(){}<>,=]+/u)
    .flatMap((word) => word.split('/'));
  return (
    normalized.includes('audit:test-suite-ownership') ||
    normalized.includes('report-test-suite-ownership.mjs') ||
    normalized.includes('testsuiteownership.mjs') ||
    reportFilePatterns.some((pattern) =>
      shellGlobCanMatchLiteral(pattern, 'report-test-suite-ownership.mjs')
    ) ||
    (reportMarker >= 0 && normalized.slice(reportMarker, reportMarker + 96).includes('.mjs'))
  );
}

function shellGlobCanMatchLiteral(pattern, literal) {
  const fixedCharacterCount = [...pattern].filter(
    (character) => !['?', '*', '[', ']', '!', '\\'].includes(character)
  ).length;
  if (fixedCharacterCount < 8) return false;

  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      source += '.*';
    } else if (character === '?') {
      source += '.';
    } else if (character === '\\' && index + 1 < pattern.length) {
      index += 1;
      source += escapeRegExp(pattern[index]);
    } else if (character === '[') {
      const closingIndex = pattern.indexOf(']', index + 1);
      if (closingIndex < 0) {
        source += '\\[';
      } else {
        const body = pattern.slice(index + 1, closingIndex);
        source += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`;
        index = closingIndex;
      }
    } else {
      source += escapeRegExp(character);
    }
  }

  try {
    return new RegExp(`${source}$`, 'u').test(literal);
  } catch {
    return false;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
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
  firefoxReleaseWorkflow = readRequired(FIREFOX_RELEASE_WORKFLOW_PATH),
  nodeAction = readRequired(NODE_ACTION_PATH),
  packageJson = readRequired(PACKAGE_JSON_PATH),
  playwrightAction = readRequired(PLAYWRIGHT_ACTION_PATH),
  qualityCheck = readRequired(QUALITY_CHECK_PATH)
} = {}) {
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
