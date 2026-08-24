import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface ParsedStep {
  name?: string;
  uses?: string;
  run?: string;
}

interface ParsedJob {
  id: string;
  runsOn?: string;
  timeoutMinutes?: string;
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

  it('locks the fourteen jobs, Ubuntu image, and timeout taxonomy', async () => {
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
      expect(steps[1]?.uses, id).toBe('actions/checkout@v6');
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
      }
    ];

    for (const mutation of mutations) {
      const result = contract.checkCiWorkflowContract(mutation);
      expect(result.ok).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    }
  });

  it('preserves the Firefox release workflow inputs while auditing ordinary CI', () => {
    const firefox = read('.github/workflows/release-firefox-amo.yml');

    expect(firefox).toContain('name: Release Firefox AMO');
    expect(firefox).toContain('uses: actions/checkout@v6');
    expect(firefox).toContain('uses: ./.github/actions/setup-node-deps');
    expect(firefox).toContain('WEB_EXT_API_KEY: ${{ secrets.WEB_EXT_API_KEY }}');
    expect(firefox).toContain('WEB_EXT_API_SECRET: ${{ secrets.WEB_EXT_API_SECRET }}');
  });
});
