import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CI_CONTRACT_PUBLIC_EXPORTS,
  CI_WORKFLOW_CHARACTERIZATION
} from './fixtures/ciWorkflowCharacterization';

function readCiWorkflow(): string {
  return readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
}

function readFirefoxReleaseWorkflow(): string {
  return readFileSync(resolve('.github/workflows/release-firefox-amo.yml'), 'utf8');
}

function readPackageJson(): string {
  return readFileSync(resolve('package.json'), 'utf8');
}

function readWorkflowSupportFile(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

describe('CI workflow wiring', () => {
  it('preserves the public facade, semantic model, diagnostics, and check CLI tuple', async () => {
    const contract = await loadCiContractModule();
    expect(Object.keys(contract).sort()).toEqual(CI_CONTRACT_PUBLIC_EXPORTS);

    const workflow = readCiWorkflow();
    const parsed = contract.parseCiWorkflowJobs(workflow);
    const normalized = {
      order: parsed.order,
      jobs: parsed.order.map((id) => [id, parsed.jobs.get(id)]),
      topLevelFields: parsed.topLevelFields
    };
    expect(createHash('sha256').update(JSON.stringify(normalized)).digest('hex')).toBe(
      CI_WORKFLOW_CHARACTERIZATION.parsedSemanticSha256
    );
    expect(contract.checkCiWorkflowContract()).toEqual(CI_WORKFLOW_CHARACTERIZATION.validResult);

    const mutation = CI_WORKFLOW_CHARACTERIZATION.timeoutMutation;
    const mutatedWorkflow = workflow.replace(mutation.from, mutation.to);
    expect(mutatedWorkflow).not.toBe(workflow);
    expect(contract.checkCiWorkflowContract({ workflow: mutatedWorkflow }).failures).toEqual(
      mutation.failures
    );

    const cli = spawnSync('node', ['tools/report-ci-workflow-contract.mjs', '--check'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    expect({
      status: cli.status,
      signal: cli.signal,
      stdout: cli.stdout,
      stderr: cli.stderr
    }).toEqual(CI_WORKFLOW_CHARACTERIZATION.checkCli);
  });

  it('cancels superseded runs for the same workflow ref or PR', () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain('concurrency:');
    expect(workflow).toContain(
      'group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}'
    );
    expect(workflow).toContain('cancel-in-progress: true');
  });

  it('splits independent checks into parallel jobs before packaging', () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain('static-preflight:');
    expect(workflow).toContain('static-release-surface:');
    expect(workflow).toContain('static-generated-artifacts:');
    expect(workflow).toContain('static-style-and-locale:');
    expect(workflow).toContain('static-reporting-audits:');
    expect(workflow).toContain('coverage:');
    expect(workflow).toContain('visual:');
    expect(workflow).toContain('e2e-vitest:');
    expect(workflow).toContain('browser-yaml:');
    expect(workflow).toContain('browser-reader-panel:');
    expect(workflow).toContain('browser-smoke:');
    expect(workflow).toContain('browser-video:');
    expect(workflow).toContain('browser-firefox:');
    expect(workflow).toContain('package:');
    expect(workflow).toContain('needs: [static-preflight]');
    expect(workflow).not.toContain('static-gates:');
    expect(workflow).not.toContain('  e2e:\n');
  });

  it('uses fast production builds after static gates have already run', () => {
    const workflow = readCiWorkflow();

    expect(workflow).not.toMatch(/run:\s*npm run build\s*(?:\n|$)/);
    expect(workflow).toContain('run: npm run build:fast');
    expect(workflow).toContain('npm run package:ci');
  });

  it('uses Node 24-compatible official actions', () => {
    const workflow = readCiWorkflow();
    const setupNodeAction = readWorkflowSupportFile('.github/actions/setup-node-deps/action.yml');

    expect(workflow).toContain('uses: actions/checkout@v6');
    expect(setupNodeAction).toContain('uses: actions/setup-node@v6');
    expect(workflow).toContain('uses: actions/upload-artifact@v7');
    expect(workflow).toContain('uses: actions/github-script@v8');
    expect(workflow).not.toMatch(/actions\/checkout@v[1-5]\b/);
    expect(setupNodeAction).not.toMatch(/actions\/setup-node@v[1-5]\b/);
    expect(workflow).not.toMatch(/actions\/upload-artifact@v[1-6]\b/);
    expect(workflow).not.toMatch(/actions\/github-script@v[1-7]\b/);
  });

  it('parses and locks the exact Video and Firefox browser job structure', async () => {
    const { parseCiWorkflowJobs, checkCiWorkflowContract } = await loadCiContractModule();
    const parsed = parseCiWorkflowJobs(readCiWorkflow());

    expect(parsed.order).toEqual([
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
    ]);
    expect(parsed.jobs.get('browser-video')).toEqual({
      id: 'browser-video',
      fields: ['name', 'runs-on', 'timeout-minutes', 'steps'],
      name: 'Browser video flow',
      runsOn: 'ubuntu-latest',
      timeoutMinutes: '20',
      steps: [
        { name: 'Checkout repository', uses: 'actions/checkout@v6' },
        { name: 'Setup Playwright', uses: './.github/actions/setup-playwright' },
        { name: 'Run browser video tests', run: 'npm run test:e2e:browser:video' },
        {
          name: 'Upload browser video reports',
          if: 'failure()',
          uses: 'actions/upload-artifact@v7',
          with: {
            name: 'browser-video-reports',
            path: 'test-results/',
            'if-no-files-found': 'ignore'
          }
        }
      ]
    });
    expect(parsed.jobs.get('browser-firefox')?.steps.map((step) => step.run ?? step.uses)).toEqual([
      'actions/checkout@v6',
      './.github/actions/setup-playwright',
      'npx playwright install --with-deps firefox',
      'npm run test:e2e:browser:firefox',
      'actions/upload-artifact@v7'
    ]);
    expect(checkCiWorkflowContract()).toEqual({ ok: true, failures: [] });
  });

  it('fails closed on browser command, timeout, ordering, masking, and artifact mutations', async () => {
    const { checkCiWorkflowContract } = await loadCiContractModule();
    const workflow = readCiWorkflow();
    const mutations = [
      workflow.replace(
        'run: npm run test:e2e:browser:video',
        'run: npm run test:e2e:browser:video && true'
      ),
      workflow.replace(
        '  browser-video:\n    name: Browser video flow\n    runs-on: ubuntu-latest\n    timeout-minutes: 20',
        '  browser-video:\n    name: Browser video flow\n    runs-on: ubuntu-latest\n    timeout-minutes: 19'
      ),
      workflow.replace(
        '  browser-video:\n    name: Browser video flow\n    runs-on: ubuntu-latest',
        '  browser-video:\n    name: Browser video flow\n    runs-on: ubuntu-latest\n    if: always()'
      ),
      workflow.replace(
        '  browser-video:\n    name: Browser video flow\n    runs-on: ubuntu-latest\n    timeout-minutes: 20\n\n    steps:',
        '  browser-video:\n    name: Browser video flow\n    runs-on: ubuntu-latest\n    timeout-minutes: 20\n    defaults:\n      run:\n        shell: bash {0} || true\n\n    steps:'
      ),
      workflow.replace(
        'run: npx playwright install --with-deps firefox',
        'run: npx playwright install --with-deps firefox || true'
      ),
      workflow.replace(
        '      - name: Run browser video tests\n        run: npm run test:e2e:browser:video',
        '      - name: Run browser video tests\n        continue-on-error: true\n        run: npm run test:e2e:browser:video'
      ),
      workflow.replace(
        '      - name: Run browser video tests\n        run: npm run test:e2e:browser:video',
        '      - name: Run browser video tests\n        "continue-on-error": true\n        run: npm run test:e2e:browser:video'
      ),
      workflow.replace(
        '      - name: Install Firefox browser\n        run: npx playwright install --with-deps firefox\n\n      - name: Run browser Firefox tests\n        run: npm run test:e2e:browser:firefox',
        '      - name: Run browser Firefox tests\n        run: npm run test:e2e:browser:firefox\n\n      - name: Install Firefox browser\n        run: npx playwright install --with-deps firefox'
      ),
      workflow.replace('name: browser-video-reports', 'name: browser-generic-reports')
    ];

    for (const mutatedWorkflow of mutations) {
      const result = checkCiWorkflowContract({ workflow: mutatedWorkflow });
      expect(result.ok).toBe(false);
      expect(result.failures.some((failure) => failure.includes('browser-'))).toBe(true);
    }

    const workflowDefaults = workflow.replace(
      '\njobs:\n',
      '\ndefaults:\n  run:\n    shell: bash {0} || true\n\njobs:\n'
    );
    const workflowDefaultsResult = checkCiWorkflowContract({ workflow: workflowDefaults });
    expect(workflowDefaultsResult.ok).toBe(false);
    expect(workflowDefaultsResult.failures).toContainEqual(
      expect.stringContaining('workflow-level run defaults')
    );
    const quotedWorkflowDefaults = workflow.replace(
      '\njobs:\n',
      '\n"defaults":\n  run:\n    shell: bash {0} || true\n\njobs:\n'
    );
    expect(checkCiWorkflowContract({ workflow: quotedWorkflowDefaults }).ok).toBe(false);
    for (const escapedDefaultsKey of [
      '"de\\x66aults"',
      '"de\\u0066aults"',
      '"de\\U00000066aults"'
    ]) {
      const escapedWorkflowDefaults = workflow.replace(
        '\njobs:\n',
        `\n${escapedDefaultsKey}:\n  run:\n    shell: bash {0} || true\n\njobs:\n`
      );
      expect(checkCiWorkflowContract({ workflow: escapedWorkflowDefaults }).ok).toBe(false);
    }
    const quotedExtraJob = workflow.replace(
      '\n  package:\n',
      '\n  "ownership-extra":\n    runs-on: ubuntu-latest\n    steps: []\n\n  package:\n'
    );
    expect(checkCiWorkflowContract({ workflow: quotedExtraJob }).ok).toBe(false);
  });

  it('rejects premature ownership wiring in Static, verify:preflight, or quality', async () => {
    const { checkCiWorkflowContract } = await loadCiContractModule();
    const workflow = readCiWorkflow();
    const packageJson = JSON.parse(readPackageJson()) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts['verify:preflight'] += ' && npm run audit:test-suite-ownership:check';

    const staticWiring = workflow.replace(
      '      - name: Verify preflight baseline\n        run: npm run verify:preflight',
      [
        '      - name: Verify canonical test suite ownership',
        '        run: npm run audit:test-suite-ownership:check',
        '',
        '      - name: Verify preflight baseline',
        '        run: npm run verify:preflight'
      ].join('\n')
    );
    const directStaticWiring = workflow.replace(
      '      - name: Verify preflight baseline\n        run: npm run verify:preflight',
      [
        '      - name: Direct ownership audit',
        '        run: node tools/report-test-suite-ownership.mjs --check',
        '',
        '      - name: Verify preflight baseline',
        '        run: npm run verify:preflight'
      ].join('\n')
    );
    const obfuscatedStaticWirings = [
      'report-test-suite-owner""ship.mjs',
      'report-test-suite-owner\\ship.mjs',
      'report-test-suite-owner?hip.mjs',
      'repor?-test-suite-ownership.mjs',
      'report-test-suite-own?rship.mjs',
      'report-test-suite-ownership.mj?'
    ].map((reportFile) =>
      workflow.replace(
        '      - name: Verify preflight baseline\n        run: npm run verify:preflight',
        [
          '      - name: Obfuscated ownership audit',
          `        run: node tools/${reportFile} --check`,
          '',
          '      - name: Verify preflight baseline',
          '        run: npm run verify:preflight'
        ].join('\n')
      )
    );
    const directPackageJson = JSON.parse(readPackageJson()) as {
      scripts: Record<string, string>;
    };
    directPackageJson.scripts['verify:preflight'] +=
      ' && node tools/report-test-suite-ownership.mjs --check';

    expect(checkCiWorkflowContract({ workflow: staticWiring }).ok).toBe(false);
    expect(checkCiWorkflowContract({ workflow: directStaticWiring }).ok).toBe(false);
    for (const obfuscatedStaticWiring of obfuscatedStaticWirings) {
      expect(checkCiWorkflowContract({ workflow: obfuscatedStaticWiring }).ok).toBe(false);
    }
    expect(checkCiWorkflowContract({ packageJson: JSON.stringify(packageJson) }).ok).toBe(false);
    expect(checkCiWorkflowContract({ packageJson: JSON.stringify(directPackageJson) }).ok).toBe(
      false
    );
    expect(
      checkCiWorkflowContract({
        qualityCheck: 'tasks.push("npm run audit:test-suite-ownership:check");\n'
      }).ok
    ).toBe(false);
    expect(
      checkCiWorkflowContract({
        qualityCheck: 'await import("../tools/report-test-suite-ownership.mjs");\n'
      }).ok
    ).toBe(false);
  });

  it('keeps Firefox AMO publishing on the GA production release path', () => {
    const workflow = readFirefoxReleaseWorkflow();
    const packageJson = readPackageJson();

    expect(workflow).toContain('name: Release Firefox AMO');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("tags:\n      - 'v*'");
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('uses: actions/checkout@v6');
    expect(workflow).toContain('uses: ./.github/actions/setup-node-deps');
    expect(workflow).toContain('WEB_EXT_API_KEY: ${{ secrets.WEB_EXT_API_KEY }}');
    expect(workflow).toContain('WEB_EXT_API_SECRET: ${{ secrets.WEB_EXT_API_SECRET }}');
    expect(workflow).toContain('FIREFOX_RELEASE_CHANNEL: listed');
    expect(workflow).toContain('id: release_channel');
    expect(workflow).toContain('GITHUB_EVENT_PATH');
    expect(workflow).toContain('FIREFOX_RELEASE_CHANNEL=%s\\n');
    expect(workflow).toContain('channel=%s\\n');
    expect(workflow).toContain('${safe_ref//[!A-Za-z0-9._-]/-}');
    expect(workflow).toContain('safe_ref=%s\\n');
    expect(workflow).toContain('ZENDIO_GA_MEASUREMENT_ID: ${{ secrets.ZENDIO_GA_MEASUREMENT_ID }}');
    expect(workflow).toContain('ZENDIO_GA_TRANSPORT_MODE: proxy');
    expect(workflow).toContain('ZENDIO_GA_PROXY_ENDPOINT: ${{ secrets.ZENDIO_GA_PROXY_ENDPOINT }}');
    expect(workflow).toContain('npm run analytics:validate:prod:required');
    expect(workflow).toContain('npm run build:firefox:prod:ga:ci');
    expect(workflow).toContain('node scripts/package-firefox.mjs "${sign_args[@]}"');
    expect(workflow).toContain('--approval-timeout 0');
    expect(workflow).toContain("find build/firefox-source -type f -name '*-source.zip'");
    expect(workflow).toContain('Expected exactly one Firefox AMO source archive');
    expect(workflow).toContain('source_archive_path=%s\\n');
    expect(workflow).toContain('npm run audit:ga:client-secret');
    expect(workflow).toContain('npm run audit:ga:release-surface -- "${archive_args[@]}"');
    expect(workflow).toContain('uses: actions/upload-artifact@v7');
    expect(workflow).toContain(
      'name: firefox-amo-${{ steps.release_channel.outputs.channel }}-${{ steps.release_channel.outputs.safe_ref }}-${{ github.run_number }}'
    );
    expect(workflow).toContain('build/firefox-source/**/*-source.zip');
    expect(workflow).toContain('if-no-files-found: error');
    expect(workflow).not.toContain('inputs.channel ||');
    expect(workflow).not.toContain('github.ref_name }}');
    expect(workflow).not.toContain('npm run package:firefox\n');
    expect(workflow).not.toContain('node --env-file=.env.production.local');
    expect(packageJson).toContain(
      '"analytics:validate:prod:required": "node scripts/setup-error-analytics.js --require-env --require-zendio-env --require-proxy-transport"'
    );
    expect(packageJson).not.toContain('"analytics:validate:prod:required": "node --env-file');
  });
});

interface ParsedCiStep {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  continueOnError?: string;
  with?: Record<string, string>;
}

interface ParsedCiJob {
  id: string;
  fields: string[];
  name?: string;
  runsOn?: string;
  timeoutMinutes?: string;
  steps: ParsedCiStep[];
}

async function loadCiContractModule(): Promise<{
  parseCiWorkflowJobs: (workflow: string) => {
    order: string[];
    jobs: Map<string, ParsedCiJob>;
    topLevelFields: string[];
  };
  checkCiWorkflowContract: (options?: {
    workflow?: string;
    firefoxReleaseWorkflow?: string;
    nodeAction?: string;
    packageJson?: string;
    playwrightAction?: string;
    qualityCheck?: string;
  }) => { ok: boolean; failures: string[] };
}> {
  const moduleUrl = new URL('../../../tools/report-ci-workflow-contract.mjs', import.meta.url).href;
  return (await import(moduleUrl)) as {
    parseCiWorkflowJobs: (workflow: string) => {
      order: string[];
      jobs: Map<string, ParsedCiJob>;
      topLevelFields: string[];
    };
    checkCiWorkflowContract: (options?: {
      workflow?: string;
      firefoxReleaseWorkflow?: string;
      nodeAction?: string;
      packageJson?: string;
      playwrightAction?: string;
      qualityCheck?: string;
    }) => { ok: boolean; failures: string[] };
  };
}
