import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GITHUB_ACTION_PINS,
  GITHUB_ACTION_PIN_RESOLUTION_DATE,
  GITHUB_ACTION_PIN_VERSION
} from '../../../scripts/config/githubActionPins.mjs';
import type { GithubActionPin } from '../../../scripts/config/githubActionPins.mjs';

interface SupplyChainFinding {
  code: string;
  path: string;
  line: number;
  column: number;
  action?: string;
  reference?: string;
}

interface SupplyChainReport {
  version: string;
  pinVersion: string;
  pinResolutionDate: string;
  ok: boolean;
  summary: {
    yamlFiles: number;
    workflowFiles: number;
    actionFiles: number;
    externalUses: number;
    localUses: number;
    compositeActions: number;
    findings: number;
  };
  files: string[];
  findings: SupplyChainFinding[];
}

interface SupplyChainModule {
  GITHUB_ACTION_SUPPLY_CHAIN_REPORT_VERSION: string;
  scanGitHubActionsSupplyChain(options?: {
    root?: string;
    pins?: readonly Readonly<GithubActionPin>[];
  }): SupplyChainReport;
}

const moduleUrl = pathToFileURL(resolve('tools/report-github-actions-supply-chain.mjs')).href;
const supplyChainModule: SupplyChainModule = await import(moduleUrl);
const { GITHUB_ACTION_SUPPLY_CHAIN_REPORT_VERSION, scanGitHubActionsSupplyChain } =
  supplyChainModule;

const fixtureRoots: string[] = [];

afterEach(() => {
  while (fixtureRoots.length > 0) {
    const root = fixtureRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function pin(action: string): Readonly<GithubActionPin> {
  const match = GITHUB_ACTION_PINS.find((row) => row.action === action);
  if (!match) throw new Error(`Missing test pin: ${action}`);
  return match;
}

function pinnedUse(action: string): string {
  const row = pin(action);
  return `${row.action}@${row.commit} # ${row.alias}`;
}

function workflowWithSteps(steps: string[]): string {
  return [
    'name: fixture',
    'on: push',
    'jobs:',
    '  verify:',
    '    runs-on: ubuntu-24.04',
    '    steps:',
    ...steps.flatMap((step) => step.split('\n').map((line) => `      ${line}`)),
    ''
  ].join('\n');
}

function allPinnedWorkflow(extraSteps: string[] = []): string {
  return workflowWithSteps([
    `- uses: ${pinnedUse('actions/checkout')}`,
    `- uses: ${pinnedUse('actions/setup-node')}`,
    `- uses: ${pinnedUse('actions/upload-artifact')}`,
    `- uses: ${pinnedUse('actions/download-artifact')}`,
    `- uses: ${pinnedUse('actions/github-script')}`,
    ...extraSteps
  ]);
}

function writeFixtureFile(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function createFixture(
  files: Record<string, string>,
  options: { tracked?: string[]; ignored?: string[] } = {}
): string {
  const root = mkdtempSync(join(tmpdir(), 'zendio-github-actions-supply-chain-'));
  fixtureRoots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  if (options.ignored && options.ignored.length > 0) {
    writeFixtureFile(root, '.gitignore', `${options.ignored.join('\n')}\n`);
  }
  const tracked = options.tracked ?? Object.keys(files);
  if (tracked.length > 0) {
    execFileSync('git', ['add', '--', ...tracked], { cwd: root, stdio: 'ignore' });
  }
  return root;
}

function scan(root: string, pins: readonly Readonly<GithubActionPin>[] = GITHUB_ACTION_PINS) {
  return scanGitHubActionsSupplyChain({ root, pins });
}

function codes(report: SupplyChainReport): string[] {
  return report.findings.map((finding) => finding.code);
}

function simpleComposite(steps: string[] = ['- run: echo ok']): string {
  return [
    'name: fixture',
    'description: fixture',
    'runs:',
    '  using: composite',
    '  steps:',
    ...steps.map((step) => `    ${step}`),
    ''
  ].join('\n');
}

describe('GitHub Actions supply-chain pin configuration', () => {
  it('freezes the five audited rows and upstream capability contracts', () => {
    expect(GITHUB_ACTION_PIN_VERSION).toBe('github-action-pins-v1');
    expect(GITHUB_ACTION_PIN_RESOLUTION_DATE).toBe('2026-08-28');
    expect(GITHUB_ACTION_PINS).toEqual([
      expect.objectContaining({
        action: 'actions/checkout',
        alias: 'v6',
        commit: 'd23441a48e516b6c34aea4fa41551a30e30af803',
        actionManifestSha256: 'd59219cb79590abdb877deaa14e3b65a00c05318bf5a6f3b989b9162b5d08c35',
        runtime: { using: 'node24', main: 'dist/index.js', post: 'dist/index.js' },
        capabilities: { persistCredentialsDefault: true }
      }),
      expect.objectContaining({
        action: 'actions/setup-node',
        alias: 'v6',
        commit: '249970729cb0ef3589644e2896645e5dc5ba9c38',
        actionManifestSha256: 'ad45f1922115116fb4706651d0a9262332bc4e4f11eb2021e09789dd1af18085',
        runtime: {
          using: 'node24',
          main: 'dist/setup/index.js',
          post: 'dist/cache-save/index.js',
          postIf: 'success()'
        }
      }),
      expect.objectContaining({
        action: 'actions/upload-artifact',
        alias: 'v7',
        commit: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
        actionManifestSha256: 'c5979822866a72362e609844b6ebe77d4b7e759af68cc1c2c425dcf51481fab4',
        capabilities: { overwriteDefault: false, outputs: ['artifact-id', 'artifact-digest'] }
      }),
      expect.objectContaining({
        action: 'actions/download-artifact',
        alias: 'v8',
        commit: '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
        actionManifestSha256: 'e98559b7a31ba31be4709f20d22102dc2737fa630f69a339eb89981151e505fe',
        capabilities: { artifactIdsInput: true, digestMismatchDefault: 'error' }
      }),
      expect.objectContaining({
        action: 'actions/github-script',
        alias: 'v8',
        commit: 'ed597411d8f924073f98dfc5c65a23a2325f34cd',
        actionManifestSha256: '2155c7b84863afcfe81a73ab8eafcb2c2f304a995cbe282c31617aa847dff1d8',
        capabilities: { retriesDefault: 0 }
      })
    ]);
    expect(Object.isFrozen(GITHUB_ACTION_PINS)).toBe(true);
    for (const row of GITHUB_ACTION_PINS) {
      expect(Object.isFrozen(row)).toBe(true);
      expect(Object.isFrozen(row.runtime)).toBe(true);
      expect(Object.isFrozen(row.capabilities)).toBe(true);
    }
  });

  it('rejects duplicate and stale configuration rows', () => {
    const checkout = pin('actions/checkout');
    const duplicateRoot = createFixture({
      '.github/workflows/fixture.yml': workflowWithSteps([
        `- uses: ${pinnedUse('actions/checkout')}`
      ])
    });
    expect(codes(scan(duplicateRoot, [checkout, checkout]))).toEqual(
      expect.arrayContaining(['PIN_CONFIG_ACTION_DUPLICATE', 'PIN_CONFIG_ALIAS_DUPLICATE'])
    );

    const staleRoot = createFixture({
      '.github/workflows/fixture.yml': workflowWithSteps(['- run: echo ok'])
    });
    expect(codes(scan(staleRoot, [checkout]))).toContain('PIN_CONFIG_UNUSED');
  });
});

describe('structured Git-visible inventory', () => {
  it('accepts a deterministic five-pin workflow', () => {
    const root = createFixture({ '.github/workflows/fixture.yml': allPinnedWorkflow() });
    const first = scan(root);
    const second = scan(root);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version: GITHUB_ACTION_SUPPLY_CHAIN_REPORT_VERSION,
      pinVersion: GITHUB_ACTION_PIN_VERSION,
      pinResolutionDate: GITHUB_ACTION_PIN_RESOLUTION_DATE,
      ok: true,
      summary: {
        yamlFiles: 1,
        workflowFiles: 1,
        actionFiles: 0,
        externalUses: 5,
        localUses: 0,
        compositeActions: 0,
        findings: 0
      }
    });
  });

  it('includes tracked and untracked YAML names with spaces and newlines', () => {
    const root = createFixture(
      {
        '.github/workflows/tracked file.yml': workflowWithSteps(['- run: echo tracked']),
        '.github/workflows/untracked\nfile.yaml': workflowWithSteps(['- run: echo untracked'])
      },
      { tracked: ['.github/workflows/tracked file.yml'] }
    );
    const report = scan(root, []);
    expect(report.ok).toBe(true);
    expect(report.files).toEqual([
      '.github/workflows/tracked file.yml',
      '.github/workflows/untracked\nfile.yaml'
    ]);
  });

  it('excludes ignored YAML while retaining the visible owner', () => {
    const root = createFixture(
      {
        '.github/workflows/visible.yml': workflowWithSteps(['- run: echo visible']),
        '.github/workflows/ignored.yml': 'not: [valid'
      },
      {
        tracked: ['.github/workflows/visible.yml'],
        ignored: ['.github/workflows/ignored.yml']
      }
    );
    const report = scan(root, []);
    expect(report.ok).toBe(true);
    expect(report.files).toEqual(['.github/workflows/visible.yml']);
  });

  it('fails closed for a deleted tracked file and a Git-visible symlink', () => {
    const deletedRoot = createFixture({
      '.github/workflows/deleted.yml': workflowWithSteps(['- run: echo deleted'])
    });
    rmSync(join(deletedRoot, '.github/workflows/deleted.yml'));
    expect(codes(scan(deletedRoot, []))).toContain('GIT_VISIBLE_FILE_MISSING');

    const symlinkRoot = createFixture({}, { tracked: [] });
    writeFixtureFile(symlinkRoot, 'target.yml', workflowWithSteps(['- run: echo linked']));
    mkdirSync(join(symlinkRoot, '.github/workflows'), { recursive: true });
    symlinkSync('../../target.yml', join(symlinkRoot, '.github/workflows/link.yml'));
    execFileSync('git', ['add', '--', '.github/workflows/link.yml'], {
      cwd: symlinkRoot,
      stdio: 'ignore'
    });
    expect(codes(scan(symlinkRoot, []))).toContain('GIT_VISIBLE_FILE_SYMLINK');
  });
});

describe('external executable reference contract', () => {
  it('classifies mutable aliases, short commits, expressions, Docker uses, and malformed refs', () => {
    const cases: Array<[string, string]> = [
      ['actions/checkout@v6', 'EXTERNAL_REFERENCE_MUTABLE'],
      ['actions/checkout@d23441a', 'EXTERNAL_REFERENCE_MUTABLE'],
      ['actions/checkout@${{ github.sha }}', 'EXTERNAL_REFERENCE_EXPRESSION'],
      ['docker://alpine:3.20', 'DOCKER_REFERENCE_FORBIDDEN'],
      ['https://github.com/actions/checkout@v6', 'EXTERNAL_REFERENCE_INVALID'],
      ['user@host/repo@v1', 'EXTERNAL_REFERENCE_INVALID']
    ];
    for (const [reference, expectedCode] of cases) {
      const root = createFixture({
        '.github/workflows/fixture.yml': workflowWithSteps([`- uses: ${reference}`])
      });
      expect(codes(scan(root, [pin('actions/checkout')]))).toContain(expectedCode);
    }
  });

  it('rejects unlisted actions, an incorrect commit, and an unlisted subpath', () => {
    const checkout = pin('actions/checkout');
    const cases: Array<[string, string]> = [
      [`owner/action@${checkout.commit} # v6`, 'EXTERNAL_ACTION_UNPINNED'],
      [`actions/checkout@${'0'.repeat(40)} # v6`, 'EXTERNAL_PIN_MISMATCH'],
      [`actions/checkout/subpath@${checkout.commit} # v6`, 'EXTERNAL_ACTION_UNPINNED']
    ];
    for (const [line, expectedCode] of cases) {
      const root = createFixture({
        '.github/workflows/fixture.yml': workflowWithSteps([`- uses: ${line}`])
      });
      expect(codes(scan(root, [checkout]))).toContain(expectedCode);
    }
  });

  it('requires the exact same-line major-alias comment', () => {
    const checkout = pin('actions/checkout');
    const reference = `${checkout.action}@${checkout.commit}`;
    const cases: Array<[string, string]> = [
      [reference, 'EXTERNAL_ALIAS_COMMENT_MISSING'],
      [`${reference} # v5`, 'EXTERNAL_ALIAS_COMMENT_MISMATCH'],
      [`${reference} # v6 extra`, 'EXTERNAL_ALIAS_COMMENT_MISSING'],
      [`${reference}\n  # v6`, 'EXTERNAL_ALIAS_COMMENT_MISSING']
    ];
    for (const [line, expectedCode] of cases) {
      const root = createFixture({
        '.github/workflows/fixture.yml': workflowWithSteps([`- uses: ${line}`])
      });
      expect(codes(scan(root, [checkout]))).toContain(expectedCode);
    }
  });
});

describe('YAML fail-closed boundaries', () => {
  it('rejects duplicate keys, multiple documents, and custom tags', () => {
    const cases: Array<[string, string]> = [
      [
        ['name: fixture', 'name: duplicate', 'on: push', 'jobs: {}', ''].join('\n'),
        'YAML_PARSE_FAILED'
      ],
      [
        ['name: one', 'jobs: {}', '---', 'name: two', 'jobs: {}', ''].join('\n'),
        'YAML_DOCUMENT_COUNT_INVALID'
      ],
      [['name: fixture', 'jobs: !custom {}', ''].join('\n'), 'YAML_PARSE_FAILED']
    ];
    for (const [source, expectedCode] of cases) {
      const root = createFixture({ '.github/workflows/fixture.yml': source });
      expect(codes(scan(root, []))).toContain(expectedCode);
    }
  });

  it('detects executable merge keys and aliased uses', () => {
    const checkout = pin('actions/checkout');
    const mergeRoot = createFixture({
      '.github/workflows/fixture.yml': [
        'name: fixture',
        'on: push',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-24.04',
        '    steps:',
        `      - &base { uses: ${checkout.action}@${checkout.commit} }`,
        '      - <<: *base',
        ''
      ].join('\n')
    });
    expect(codes(scan(mergeRoot, [checkout]))).toContain('YAML_EXECUTABLE_MERGE_FORBIDDEN');

    const aliasRoot = createFixture({
      '.github/workflows/fixture.yml': [
        `x-use: &shared ${checkout.action}@${checkout.commit}`,
        'name: fixture',
        'on: push',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-24.04',
        '    steps:',
        '      - uses: *shared',
        ''
      ].join('\n')
    });
    expect(codes(scan(aliasRoot, [checkout]))).toContain('YAML_EXECUTABLE_ALIAS_FORBIDDEN');
  });

  it('rejects containers, services, and reusable workflows', () => {
    const root = createFixture({
      '.github/workflows/fixture.yml': [
        'name: fixture',
        'on: push',
        'jobs:',
        '  container-job:',
        '    runs-on: ubuntu-24.04',
        '    container: node:20',
        '    services:',
        '      redis:',
        '        image: redis:7',
        '    steps:',
        '      - run: echo no',
        '  reusable:',
        '    uses: owner/repo/.github/workflows/reusable.yml@v1',
        ''
      ].join('\n')
    });
    const reportCodes = codes(scan(root, []));
    expect(
      reportCodes.filter((code) => code === 'WORKFLOW_RUNTIME_SERVICE_FORBIDDEN')
    ).toHaveLength(2);
    expect(reportCodes).toContain('REUSABLE_WORKFLOW_FORBIDDEN');
  });
});

describe('local composite closure', () => {
  it('accepts two recursive Git-visible composite owners', () => {
    const root = createFixture({
      '.github/workflows/fixture.yml': workflowWithSteps([
        '- uses: ./.github/actions/setup-playwright'
      ]),
      '.github/actions/setup-playwright/action.yml': simpleComposite([
        '- uses: ./.github/actions/setup-node-deps',
        '- run: echo playwright'
      ]),
      '.github/actions/setup-node-deps/action.yml': simpleComposite(['- run: echo node'])
    });
    expect(scan(root, [])).toMatchObject({
      ok: true,
      summary: { localUses: 2, compositeActions: 2, findings: 0 }
    });
  });

  it('rejects traversal, missing, dual, hidden, and non-composite local owners', () => {
    const traversalRoot = createFixture({
      '.github/workflows/fixture.yml': workflowWithSteps(['- uses: ./.github/actions/a/../outside'])
    });
    expect(codes(scan(traversalRoot, []))).toContain('LOCAL_ACTION_TRAVERSAL');

    const missingRoot = createFixture({
      '.github/workflows/fixture.yml': workflowWithSteps(['- uses: ./.github/actions/missing'])
    });
    expect(codes(scan(missingRoot, []))).toContain('LOCAL_ACTION_MISSING');

    const dualRoot = createFixture({
      '.github/workflows/fixture.yml': workflowWithSteps(['- uses: ./.github/actions/dual']),
      '.github/actions/dual/action.yml': simpleComposite(),
      '.github/actions/dual/action.yaml': simpleComposite()
    });
    expect(codes(scan(dualRoot, []))).toContain('LOCAL_ACTION_MANIFEST_DUAL');

    const hiddenRoot = createFixture(
      {
        '.github/workflows/fixture.yml': workflowWithSteps(['- uses: ./.github/actions/hidden']),
        '.github/actions/hidden/action.yml': simpleComposite()
      },
      {
        tracked: ['.github/workflows/fixture.yml'],
        ignored: ['.github/actions/hidden/action.yml']
      }
    );
    expect(codes(scan(hiddenRoot, []))).toContain('LOCAL_ACTION_NOT_GIT_VISIBLE');

    const nodeRoot = createFixture({
      '.github/workflows/fixture.yml': workflowWithSteps(['- uses: ./.github/actions/node']),
      '.github/actions/node/action.yml': [
        'name: node',
        'runs:',
        '  using: node24',
        '  main: dist/index.js',
        ''
      ].join('\n')
    });
    expect(codes(scan(nodeRoot, []))).toEqual(
      expect.arrayContaining([
        'LOCAL_ACTION_COMPOSITE_REQUIRED',
        'LOCAL_ACTION_EXECUTION_FIELD_FORBIDDEN'
      ])
    );
  });

  it('rejects local-directory symlinks and recursion cycles', () => {
    const symlinkRoot = createFixture(
      {
        '.github/workflows/fixture.yml': workflowWithSteps(['- uses: ./.github/actions/link']),
        '.github/actions/target/action.yml': simpleComposite()
      },
      { tracked: ['.github/workflows/fixture.yml', '.github/actions/target/action.yml'] }
    );
    symlinkSync('target', join(symlinkRoot, '.github/actions/link'));
    expect(codes(scan(symlinkRoot, []))).toContain('LOCAL_ACTION_SYMLINK');

    const cycleRoot = createFixture({
      '.github/workflows/fixture.yml': workflowWithSteps(['- uses: ./.github/actions/a']),
      '.github/actions/a/action.yml': simpleComposite(['- uses: ./.github/actions/b']),
      '.github/actions/b/action.yml': simpleComposite(['- uses: ./.github/actions/a'])
    });
    expect(codes(scan(cycleRoot, []))).toContain('LOCAL_ACTION_RECURSION_CYCLE');
  });
});

describe('current repository expected-red boundary', () => {
  it('reports the finite five-file mutable-alias inventory without extra findings', () => {
    const report = scanGitHubActionsSupplyChain();
    expect(report.ok).toBe(false);
    expect(report.summary).toEqual({
      yamlFiles: 5,
      workflowFiles: 3,
      actionFiles: 2,
      externalUses: 38,
      localUses: 21,
      compositeActions: 2,
      findings: 38
    });
    expect(new Set(report.findings.map((finding) => finding.code))).toEqual(
      new Set(['EXTERNAL_REFERENCE_MUTABLE'])
    );
  });

  it('keeps report mode successful and check mode nonzero on the same deterministic JSON', () => {
    const report = spawnSync(
      process.execPath,
      ['tools/report-github-actions-supply-chain.mjs', '--report'],
      {
        cwd: process.cwd(),
        encoding: 'utf8'
      }
    );
    const check = spawnSync(
      process.execPath,
      ['tools/report-github-actions-supply-chain.mjs', '--check'],
      {
        cwd: process.cwd(),
        encoding: 'utf8'
      }
    );
    expect({ status: report.status, stderr: report.stderr }).toEqual({ status: 0, stderr: '' });
    expect({ status: check.status, stderr: check.stderr }).toEqual({ status: 1, stderr: '' });
    expect(JSON.parse(report.stdout)).toEqual(JSON.parse(check.stdout));
  });

  it('keeps the scanner source as a regular repository-owned file', () => {
    const stat = lstatSync(resolve('tools/report-github-actions-supply-chain.mjs'));
    expect(stat.isFile()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
  });
});
