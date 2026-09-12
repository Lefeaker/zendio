import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GITHUB_ACTION_PINS } from '../../../scripts/config/githubActionPins.mjs';

function pinnedUse(action: string, includeComment = false): string {
  const pin = GITHUB_ACTION_PINS.find((row) => row.action === action);
  if (!pin) throw new Error(`Missing GitHub Action pin: ${action}`);
  const reference = `${pin.action}@${pin.commit}`;
  return includeComment ? `${reference} # ${pin.alias}` : reference;
}

const checkoutUseWithComment = pinnedUse('actions/checkout', true);
const uploadArtifactUseWithComment = pinnedUse('actions/upload-artifact', true);

interface ParsedStep {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  continueOnError?: string;
  with?: Record<string, string>;
}

interface ParsedJob {
  env?: Record<string, string>;
  id: string;
  name?: string;
  runsOn?: string;
  timeoutMinutes?: string;
  needs?: string;
  if?: string;
  continueOnError?: string;
  steps: ParsedStep[];
}

interface CiContractModule {
  parseCiWorkflowJobs(workflow: string): {
    order: string[];
    jobs: Map<string, ParsedJob>;
    topLevelFields: string[];
  };
  checkCiWorkflowContract(options?: {
    workflow?: string;
    firefoxReleaseWorkflow?: string;
    nodeAction?: string;
    packageJson?: string;
    playwrightAction?: string;
    qualityCheck?: string;
  }): { ok: boolean; failures: string[] };
}

function read(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

function jobBlock(workflow: string, jobId: string): string {
  const marker = `  ${jobId}:\n`;
  const start = workflow.indexOf(marker);
  const rest = workflow.slice(start + marker.length);
  const next = rest.search(/\n {2}[A-Za-z0-9_-]+:\n/u);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + marker.length + next + 1);
}

async function loadContract(): Promise<CiContractModule> {
  const url = new URL('../../../tools/report-ci-workflow-contract.mjs', import.meta.url).href;
  return (await import(url)) as CiContractModule;
}

describe('bounded CI workflow contract', () => {
  it('accepts the committed topology and check CLI', async () => {
    const contract = await loadContract();
    expect(contract.checkCiWorkflowContract()).toEqual({ ok: true, failures: [] });

    const cli = spawnSync(process.execPath, ['tools/report-ci-workflow-contract.mjs', '--check'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    expect({
      status: cli.status,
      signal: cli.signal,
      stdout: cli.stdout,
      stderr: cli.stderr
    }).toEqual({ status: 0, signal: null, stdout: '', stderr: '' });
  });

  it('keeps command context at job scope and rejects missing or shadowed bindings', async () => {
    const contract = await loadContract();
    const workflow = read('.github/workflows/ci.yml');
    const context =
      "    env:\n      ZENDIO_JOB_CLASS: static-preflight-v1\n      ZENDIO_JOB_TIMEOUT_MINUTES: '60'\n";
    expect(contract.parseCiWorkflowJobs(workflow).jobs.get('static-preflight')?.env).toEqual({
      ZENDIO_JOB_CLASS: 'static-preflight-v1',
      ZENDIO_JOB_TIMEOUT_MINUTES: '60'
    });
    expect(contract.checkCiWorkflowContract({ workflow: workflow.replace(context, '') }).ok).toBe(
      false
    );
    const shadowed = workflow.replace(
      '      - name: Verify CI workflow topology',
      '      - env:\n          ZENDIO_JOB_CLASS: generic-v1\n        name: Verify CI workflow topology'
    );
    expect(contract.checkCiWorkflowContract({ workflow: shadowed }).ok).toBe(false);
  });

  it('locks the sixteen jobs, Ubuntu image, and timeout taxonomy', async () => {
    const contract = await loadContract();
    const parsed = contract.parseCiWorkflowJobs(read('.github/workflows/ci.yml'));
    const expected = [
      ['static-preflight', '60'],
      ['static-release-surface', '30'],
      ['static-generated-artifacts', '30'],
      ['static-style-and-locale', '30'],
      ['static-reporting-audits', '30'],
      ['coverage', '30'],
      ['visual', '60'],
      ['e2e-vitest', '30'],
      ['browser-yaml', '60'],
      ['browser-reader-panel', '60'],
      ['browser-smoke', '60'],
      ['browser-video', '60'],
      ['browser-firefox', '60'],
      ['browser-state', '60'],
      ['browser-architecture', '60'],
      ['package', '35']
    ];

    expect(parsed.order).toEqual(expected.map(([id]) => id));
    expect(
      expected.map(([id]) => [id, parsed.jobs.get(id)?.runsOn, parsed.jobs.get(id)?.timeoutMinutes])
    ).toEqual(expected.map(([id, timeout]) => [id, 'ubuntu-24.04', timeout]));
  });

  it('uses one identical builtin-only bootstrap before checkout in every job', async () => {
    const contract = await loadContract();
    const parsed = contract.parseCiWorkflowJobs(read('.github/workflows/ci.yml'));
    const bootstraps = parsed.order.map((id) => parsed.jobs.get(id)?.steps[0]?.run ?? '');

    expect(new Set(bootstraps).size).toBe(1);
    expect(bootstraps[0]).toContain('$(compgen -e)');
    expect(bootstraps[0]?.match(/\$\((?!\()/gu)).toHaveLength(1);
    expect(bootstraps[0]).toContain('zendio-ci-command-start-v1');
    for (const id of parsed.order) {
      const steps = parsed.jobs.get(id)?.steps ?? [];
      expect(steps[0]?.name, id).toBe('Bootstrap command boundary');
      expect(steps[1]?.uses, id).toBe(checkoutUseWithComment);
    }
  });

  it('owns dependency and browser installation without cache or shell interpolation', () => {
    const nodeAction = read('.github/actions/setup-node-deps/action.yml');
    const playwrightAction = read('.github/actions/setup-playwright/action.yml');

    expect(nodeAction).toContain('package-manager-cache: false');
    expect(nodeAction).toContain('github-ci-install-v1');
    expect(nodeAction).toContain('attempt-root:');
    expect(playwrightAction).toContain(
      'playwright-host-deps-platform-v1 -- chromium-with-host-deps'
    );
    expect(playwrightAction).toContain('playwright-browser-install-v1 -- chromium-with-host-deps');
    expect(playwrightAction).toContain('playwright-browsers-path:');
    expect(`${nodeAction}\n${playwrightAction}`).not.toMatch(
      /actions\/cache|^\s*cache:|run:\s+(?:npm|npx)\b|GITHUB_ENV|\$\{\{\s*inputs\./imu
    );
  });

  it('routes every repository run step through the fixed Node boundary', async () => {
    const contract = await loadContract();
    const parsed = contract.parseCiWorkflowJobs(read('.github/workflows/ci.yml'));

    for (const job of parsed.jobs.values()) {
      for (const step of job.steps.slice(1)) {
        if (step.run) expect(step.run, `${job.id}:${step.name ?? ''}`).toMatch(/^node /u);
      }
    }
    expect(read('.github/workflows/ci.yml')).not.toMatch(
      /actions\/cache|^\s*cache:|GITHUB_ENV|\bnpx\b|\bpnpx\b|\bnpm exec\b/imu
    );
  });

  it('locks both G00 browser jobs to one setup, four outputs, one route, and failure artifacts', async () => {
    const contract = await loadContract();
    const workflow = read('.github/workflows/ci.yml');
    const parsed = contract.parseCiWorkflowJobs(workflow);
    const jobs = [
      {
        id: 'browser-state',
        name: 'Browser state flow',
        command:
          'node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:state',
        artifact: 'browser-state-reports'
      },
      {
        id: 'browser-architecture',
        name: 'Browser architecture flow',
        command:
          'node scripts/run-bounded-command.mjs --profile npm-script-browser-v1 -- test:e2e:browser:architecture',
        artifact: 'browser-architecture-reports'
      }
    ];

    for (const expected of jobs) {
      const job = parsed.jobs.get(expected.id);
      const block = jobBlock(workflow, expected.id);
      expect(job).toMatchObject({
        name: expected.name,
        runsOn: 'ubuntu-24.04',
        timeoutMinutes: '60'
      });
      expect(job?.needs).toBeUndefined();
      expect(job?.if).toBeUndefined();
      expect(job?.continueOnError).toBeUndefined();
      expect(
        job?.steps.filter((step) => step.uses === './.github/actions/setup-playwright')
      ).toEqual([expect.objectContaining({ id: 'playwright' })]);
      expect(job?.steps.filter((step) => step.run === expected.command)).toHaveLength(1);
      expect(job?.steps.find((step) => step.run === expected.command)?.if).toBeUndefined();
      expect(job?.steps.find((step) => step.uses === uploadArtifactUseWithComment)).toMatchObject({
        if: 'failure()',
        with: {
          name: expected.artifact,
          path: 'test-results/',
          'if-no-files-found': 'ignore'
        }
      });
      for (const output of [
        'ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: ${{ steps.playwright.outputs.attempt-root }}',
        'PLAYWRIGHT_BROWSERS_PATH: ${{ steps.playwright.outputs.playwright-browsers-path }}',
        'NPM_CONFIG_USERCONFIG: ${{ steps.playwright.outputs.npm-userconfig }}',
        'NPM_CONFIG_GLOBALCONFIG: ${{ steps.playwright.outputs.npm-globalconfig }}'
      ]) {
        expect(
          block.match(new RegExp(output.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu'))
        ).toHaveLength(1);
      }
      expect(block).not.toMatch(
        /\b(?:needs|matrix|continue-on-error):|GITHUB_ENV|\bnpx\b|\bnpm exec\b/imu
      );
    }
  });

  it('wires one unmasked ownership check into Static preflight without browser execution', async () => {
    const contract = await loadContract();
    const workflow = read('.github/workflows/ci.yml');
    const job = contract.parseCiWorkflowJobs(workflow).jobs.get('static-preflight');
    const steps = job?.steps ?? [];
    const ownershipSteps = steps.filter(
      (step) =>
        step.name === 'Verify canonical test suite ownership' ||
        step.run?.includes('audit:test-suite-ownership')
    );

    expect(ownershipSteps).toEqual([
      {
        name: 'Verify canonical test suite ownership',
        env: '',
        run: 'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:test-suite-ownership:check'
      }
    ]);
    const topologyIndex = steps.findIndex((step) => step.name === 'Verify CI workflow topology');
    const ownershipIndex = steps.findIndex(
      (step) => step.name === 'Verify canonical test suite ownership'
    );
    const preflightIndex = steps.findIndex((step) => step.name === 'Verify preflight baseline');
    expect(topologyIndex).toBeGreaterThan(-1);
    expect(ownershipIndex).toBe(topologyIndex + 1);
    expect(preflightIndex).toBeGreaterThan(ownershipIndex);
    expect(jobBlock(workflow, 'static-preflight')).not.toMatch(
      /test:e2e:browser:(?:state|architecture)/u
    );
  });

  it('appends the five G01 gates and the final unmasked supply-chain gate', async () => {
    const contract = await loadContract();
    const workflow = read('.github/workflows/ci.yml');
    const parsed = contract.parseCiWorkflowJobs(workflow);
    const preflight = parsed.jobs.get('static-preflight');
    const steps = preflight?.steps ?? [];
    const expectedSuffix = [
      [
        'Verify UI production ownership',
        'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:ui-production-ownership:check'
      ],
      [
        'Build production bundle for CSS ownership',
        'node scripts/run-bounded-command.mjs --profile npm-script-build-v1 -- build:fast'
      ],
      [
        'Verify content CSS packs',
        'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:content-css-packs:check'
      ],
      [
        'Verify design token alignment',
        'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:design-tokens:check'
      ],
      [
        'Verify active document governance',
        'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:active-documents:check'
      ],
      [
        'Verify immutable GitHub Actions supply chain',
        'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:github-actions-supply-chain:check'
      ]
    ];
    const preflightIndex = steps.findIndex(
      (step) => step.run === 'node scripts/verify-preflight.mjs'
    );

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(steps.slice(preflightIndex + 1).map((step) => [step.name, step.run])).toEqual(
      expectedSuffix
    );
    for (const [name, run] of expectedSuffix) {
      expect(steps.filter((step) => step.name === name || step.run === run)).toEqual([
        expect.objectContaining({ name, run })
      ]);
      const step = steps.find((candidate) => candidate.run === run);
      expect(step?.if).toBeUndefined();
      expect(step?.continueOnError).toBeUndefined();
    }
    const runs = steps.flatMap((step) => (step.run ? [step.run] : []));
    expect(runs.some((run) => run.includes('audit:performance:report'))).toBe(false);
    expect(runs.some((run) => /\bquality\b/u.test(run))).toBe(false);

    const styleSteps = parsed.jobs
      .get('static-style-and-locale')
      ?.steps.filter(
        (step) => step.name === 'Lint Options CSS' || step.run?.includes('stylelint-v1')
      );
    expect(styleSteps).toEqual([
      {
        name: 'Lint Options CSS',
        env: '',
        run: 'node scripts/run-bounded-command.mjs --profile stylelint-v1 -- "src/options/**/*.css" "src/onboarding/**/*.css" "src/ui/**/*.css"'
      }
    ]);
  });

  it('fails closed on bootstrap, command, runner, timeout, cache, and interpolation mutations', async () => {
    const contract = await loadContract();
    const workflow = read('.github/workflows/ci.yml');
    const nodeAction = read('.github/actions/setup-node-deps/action.yml');
    const playwrightAction = read('.github/actions/setup-playwright/action.yml');
    const mutations = [
      { workflow: workflow.replace('runs-on: ubuntu-24.04', 'runs-on: ubuntu-latest') },
      { workflow: workflow.replace('timeout-minutes: 60', 'timeout-minutes: 59') },
      {
        workflow: workflow.replace(
          'node scripts/verify-preflight.mjs',
          'node scripts/verify-preflight.mjs && true'
        )
      },
      { workflow: workflow.replace('$(compgen -e)', '$(env)') },
      { nodeAction: `${nodeAction}\n    - uses: actions/cache@v4\n` },
      {
        playwrightAction: playwrightAction.replace(
          'chromium-with-host-deps',
          '${{ inputs.browser-profile }}'
        )
      },
      { workflow: workflow.replace('name: Browser state flow', 'name: Browser state aggregate') },
      {
        workflow: workflow.replace('test:e2e:browser:state', 'test:e2e:browser:architecture')
      },
      {
        workflow: workflow.replace(
          'ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: ${{ steps.playwright.outputs.attempt-root }}',
          'ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: /tmp/caller-selected'
        )
      },
      {
        workflow: workflow.replace(
          '  browser-state:\n    name: Browser state flow',
          '  browser-state:\n    name: Browser state flow\n    continue-on-error: true'
        )
      },
      {
        workflow: workflow.replace('name: browser-state-reports', 'name: browser-state-optional')
      },
      {
        workflow: workflow.replace(
          'name: Verify canonical test suite ownership',
          'name: Report canonical test suite ownership'
        )
      },
      {
        workflow: workflow.replace(
          'audit:test-suite-ownership:check',
          'audit:test-suite-ownership:report'
        )
      },
      {
        workflow: workflow.replace(
          '      - name: Verify canonical test suite ownership\n',
          '      - name: Verify canonical test suite ownership\n        if: false\n'
        )
      },
      {
        workflow: workflow.replace(
          'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:test-suite-ownership:check',
          'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:test-suite-ownership:check && true'
        )
      },
      {
        workflow: workflow.replace(
          'audit:ui-production-ownership:check',
          'audit:ui-production-ownership:report'
        )
      },
      {
        workflow: workflow
          .replace(
            'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:ui-production-ownership:check',
            '__G01_TEMP_COMMAND__'
          )
          .replace(
            'node scripts/run-bounded-command.mjs --profile npm-script-build-v1 -- build:fast',
            'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:ui-production-ownership:check'
          )
          .replace(
            '__G01_TEMP_COMMAND__',
            'node scripts/run-bounded-command.mjs --profile npm-script-build-v1 -- build:fast'
          )
      },
      {
        workflow: workflow.replace(
          '      - name: Verify design token alignment\n',
          '      - name: Verify design token alignment\n        continue-on-error: true\n'
        )
      },
      {
        workflow: workflow.replace(
          'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:active-documents:check',
          'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:performance:report'
        )
      },
      {
        workflow: workflow.replace(
          '      - name: Verify immutable GitHub Actions supply chain\n',
          '      - name: Verify immutable GitHub Actions supply chain\n        continue-on-error: true\n'
        )
      },
      {
        workflow: workflow.replace(
          'node scripts/run-bounded-command.mjs --profile stylelint-v1 -- "src/options/**/*.css" "src/onboarding/**/*.css" "src/ui/**/*.css"',
          'node scripts/run-bounded-command.mjs --profile stylelint-v1 -- "src/options/**/*.css" "src/ui/**/*.css"'
        )
      }
    ];

    for (const mutation of mutations) {
      const result = contract.checkCiWorkflowContract(mutation);
      expect(result.ok).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    }
  });

  it('wires the protected Firefox release auditor into the ordinary CI contract', async () => {
    const contract = await loadContract();
    const firefox = read('.github/workflows/release-firefox-amo.yml');

    expect(contract.checkCiWorkflowContract({ firefoxReleaseWorkflow: firefox })).toEqual({
      ok: true,
      failures: []
    });
    const mutated = firefox.replace('digest-mismatch: error', 'digest-mismatch: warn');
    const result = contract.checkCiWorkflowContract({ firefoxReleaseWorkflow: mutated });
    expect(result.ok).toBe(false);
    expect(result.failures.join('\n')).toContain('firefox-release-contract');
  });
});
