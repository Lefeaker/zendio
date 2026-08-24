import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMMAND_LIMITS,
  DIRECT_ROOT_COORDINATOR_GRAMMARS,
  PROFILE_IDS,
  TASK_GRAPH_POLICIES,
  type CommandBoundaryProfileId,
  buildClosedCommandEnvironment,
  parseManagedCommandInvocationArgv,
  resolveCommandProfile
} from '../../../scripts/config/commandBoundaryProfiles.mjs';
import {
  readCanonicalCommandRequest,
  runBoundedCommand,
  startBoundedCommand
} from '../../../scripts/utils/boundedCommand.mjs';

const temporaryRoots: string[] = [];
const TEST_RELEASE_BROWSERS: ('chrome' | 'firefox')[] = ['chrome', 'firefox'];

type RequestValue = string | boolean | string[];

function canonicalJsonBytes(value: Record<string, RequestValue>): Buffer {
  const sorted = Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  );
  return Buffer.from(`${JSON.stringify(sorted, null, 2)}\n`);
}

function cleanEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    HOME: process.env.HOME ?? tmpdir(),
    TMPDIR: tmpdir(),
    ...extra
  };
}

function verifiedNpmLifecycleEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const npmProfile = resolveCommandProfile('npm-script-quick-v1', ['verify:runtime'], {
    environment: cleanEnvironment()
  });
  const nodePath = npmProfile.executable;
  const cliPath = npmProfile.argv[0];
  if (!nodePath || !cliPath) throw new Error('TEST_NPM_PROFILE_INVALID');
  return cleanEnvironment({
    INIT_CWD: resolve('.'),
    NODE: nodePath,
    PWD: resolve('.'),
    npm_command: 'run-script',
    npm_config_noproxy: '',
    npm_config_npm_version: '10.8.2',
    npm_execpath: cliPath,
    npm_lifecycle_event: 'lint:options-css',
    npm_lifecycle_script:
      'node scripts/run-bounded-command.mjs --profile stylelint-v1 -- "src/options/**/*.css"',
    npm_node_execpath: nodePath,
    npm_package_json: resolve('package.json'),
    npm_package_name: 'zendio',
    npm_package_version: '0.2.1',
    ...extra
  });
}

async function waitForActiveChild(
  handle: ReturnType<typeof startBoundedCommand>,
  previous: ReturnType<typeof startBoundedCommand>['child'] = null
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const child = handle.child;
    if (child && child !== previous) return child;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
  throw new Error('TEST_ACTIVE_CHILD_NOT_OBSERVED');
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'zendio-command-boundary-'));
  chmodSync(root, 0o700);
  temporaryRoots.push(root);
  return root;
}

function ciInstallFixture(jobClass = 'generic-v1', timeout = '30') {
  const runnerTemp = realpathSync(temporaryRoot());
  const output = join(runnerTemp, 'github-output');
  const startCentiseconds = '100000';
  const environment = cleanEnvironment({
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_JOB: 'unit-contract',
    GITHUB_OUTPUT: output,
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_RUN_ID: '123456',
    ImageOS: 'ubuntu24',
    ImageVersion: '20260818.1',
    RUNNER_ARCH: 'X64',
    RUNNER_OS: 'Linux',
    RUNNER_TEMP: runnerTemp,
    ZENDIO_JOB_CLASS: jobClass,
    ZENDIO_JOB_TIMEOUT_MINUTES: timeout
  });
  writeFileSync(output, '', { mode: 0o600 });
  chmodSync(output, 0o600);
  writeFileSync(
    join(runnerTemp, 'zendio-command-start-123456-2-unit-contract.receipt'),
    [
      'zendio-ci-command-start-v1',
      '123456',
      '2',
      'unit-contract',
      jobClass,
      timeout,
      'Linux',
      'X64',
      'ubuntu24',
      '20260818.1',
      startCentiseconds,
      ''
    ].join('\n'),
    { mode: 0o600 }
  );
  return {
    environment,
    output,
    runnerTemp,
    operations: { readUptimeCentiseconds: () => 100010 }
  };
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function releaseAttemptFixture(
  browser: 'chrome' | 'firefox',
  phase: 'prepare' | 'publish' | 'submit' = 'prepare'
) {
  const runnerTemp = realpathSync(temporaryRoot());
  const runId = '123456';
  const runAttempt = '1';
  const jobClass =
    phase === 'prepare'
      ? `${browser}-prepare-v1`
      : browser === 'chrome'
        ? 'chrome-publish-v1'
        : 'firefox-submit-v1';
  const rootName =
    jobClass === 'chrome-prepare-v1'
      ? `zendio-chrome-${runId}-${runAttempt}`
      : jobClass === 'firefox-prepare-v1'
        ? `zendio-firefox-${runId}-${runAttempt}`
        : jobClass === 'chrome-publish-v1'
          ? `zendio-chrome-publish-${runId}-${runAttempt}`
          : `zendio-firefox-submit-${runId}-${runAttempt}`;
  const attemptRoot = join(runnerTemp, rootName);
  mkdirSync(attemptRoot, { mode: 0o700 });
  chmodSync(attemptRoot, 0o700);
  const output = join(runnerTemp, 'github-output');
  writeFileSync(output, '', { mode: 0o600 });
  chmodSync(output, 0o600);
  return {
    attemptRoot,
    output,
    environment: cleanEnvironment({
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      GITHUB_JOB: `${browser}-${phase}`,
      GITHUB_OUTPUT: output,
      GITHUB_RUN_ATTEMPT: runAttempt,
      GITHUB_RUN_ID: runId,
      ImageOS: 'ubuntu24',
      ImageVersion: '20260818.1',
      RUNNER_ARCH: 'X64',
      RUNNER_OS: 'Linux',
      RUNNER_TEMP: runnerTemp,
      ZENDIO_JOB_CLASS: jobClass,
      ZENDIO_JOB_TIMEOUT_MINUTES:
        jobClass === 'chrome-prepare-v1'
          ? '75'
          : jobClass === 'firefox-prepare-v1'
            ? '120'
            : jobClass === 'chrome-publish-v1'
              ? '60'
              : '90',
      ZENDIO_RUNNER_ENVIRONMENT: 'github-hosted'
    })
  };
}

function installAttemptConfigs(attemptRoot: string) {
  const installRoot = join(attemptRoot, 'install');
  mkdirSync(installRoot, { mode: 0o700 });
  chmodSync(installRoot, 0o700);
  for (const name of ['npm-userconfig', 'npm-globalconfig']) {
    const path = join(installRoot, name);
    writeFileSync(path, '', { mode: 0o600 });
    chmodSync(path, 0o600);
  }
}

function gitValue(args: string[]): string {
  const result = spawnSync('/usr/bin/git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function protectedCiInstallFixture(browser: 'chrome' | 'firefox') {
  const runnerTemp = realpathSync(temporaryRoot());
  const output = join(runnerTemp, 'github-output');
  const runId = '987654';
  const runAttempt = '1';
  const job = browser === 'chrome' ? 'chrome-publish' : 'firefox-submit';
  const jobClass = browser === 'chrome' ? 'chrome-publish-v1' : 'firefox-submit-v1';
  const timeout = browser === 'chrome' ? '60' : '90';
  const startCentiseconds = '200000';
  writeFileSync(output, '', { mode: 0o600 });
  chmodSync(output, 0o600);
  writeFileSync(
    join(runnerTemp, `zendio-command-start-${runId}-${runAttempt}-${job}.receipt`),
    [
      'zendio-ci-command-start-v1',
      runId,
      runAttempt,
      job,
      jobClass,
      timeout,
      'Linux',
      'X64',
      'ubuntu24',
      '20260818.1',
      startCentiseconds,
      ''
    ].join('\n'),
    { mode: 0o600 }
  );
  return {
    runnerTemp,
    output,
    environment: cleanEnvironment({
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      GITHUB_JOB: job,
      GITHUB_OUTPUT: output,
      GITHUB_RUN_ATTEMPT: runAttempt,
      GITHUB_RUN_ID: runId,
      ImageOS: 'ubuntu24',
      ImageVersion: '20260818.1',
      RUNNER_ARCH: 'X64',
      RUNNER_OS: 'Linux',
      RUNNER_TEMP: runnerTemp,
      ZENDIO_EXPECTED_LOCK_SHA256: sha256(resolve('package-lock.json')),
      ZENDIO_EXPECTED_PACKAGE_SHA256: sha256(resolve('package.json')),
      ZENDIO_EXPECTED_RELEASE_SHA: gitValue(['rev-parse', 'HEAD']),
      ZENDIO_EXPECTED_RELEASE_TREE: gitValue(['rev-parse', 'HEAD^{tree}']),
      ZENDIO_JOB_CLASS: jobClass,
      ZENDIO_JOB_TIMEOUT_MINUTES: timeout,
      ZENDIO_RUNNER_ENVIRONMENT: 'github-hosted'
    }),
    operations: { readUptimeCentiseconds: () => 200010 }
  };
}

function prepareCiInstallFixture(browser: 'chrome' | 'firefox') {
  const runnerTemp = realpathSync(temporaryRoot());
  const output = join(runnerTemp, 'github-output');
  const runId = '876543';
  const runAttempt = '1';
  const job = `${browser}-prepare`;
  const jobClass = `${browser}-prepare-v1`;
  const timeout = browser === 'chrome' ? '75' : '120';
  const startCentiseconds = '300000';
  writeFileSync(output, '', { mode: 0o600 });
  chmodSync(output, 0o600);
  writeFileSync(
    join(runnerTemp, `zendio-command-start-${runId}-${runAttempt}-${job}.receipt`),
    [
      'zendio-ci-command-start-v1',
      runId,
      runAttempt,
      job,
      jobClass,
      timeout,
      'Linux',
      'X64',
      'ubuntu24',
      '20260818.1',
      startCentiseconds,
      ''
    ].join('\n'),
    { mode: 0o600 }
  );
  return {
    runnerTemp,
    environment: cleanEnvironment({
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      GITHUB_JOB: job,
      GITHUB_OUTPUT: output,
      GITHUB_RUN_ATTEMPT: runAttempt,
      GITHUB_RUN_ID: runId,
      ImageOS: 'ubuntu24',
      ImageVersion: '20260818.1',
      RUNNER_ARCH: 'X64',
      RUNNER_OS: 'Linux',
      RUNNER_TEMP: runnerTemp,
      ZENDIO_JOB_CLASS: jobClass,
      ZENDIO_JOB_TIMEOUT_MINUTES: timeout,
      ZENDIO_RUNNER_ENVIRONMENT: 'github-hosted'
    }),
    operations: { readUptimeCentiseconds: () => 300010 }
  };
}

function writeRequest(
  root: string,
  value: Record<string, RequestValue>,
  { canonical = true, mode = 0o600 }: { canonical?: boolean; mode?: number } = {}
): string {
  const request = join(root, 'command-request.json');
  const bytes = canonical
    ? canonicalJsonBytes(value)
    : Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  writeFileSync(request, bytes, { mode });
  chmodSync(request, mode);
  return request;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { force: true, recursive: true });
  }
});

describe('bounded command ownership', () => {
  it('deep-freezes the finite profile, coordinator, timing, and policy registries', () => {
    expect(PROFILE_IDS).toContain('vitest-v1');
    expect(PROFILE_IDS).toContain('fixture-v1');
    expect(PROFILE_IDS).toEqual(
      expect.arrayContaining([
        'github-ci-install-v1',
        'playwright-host-deps-platform-v1',
        'playwright-browser-install-v1'
      ])
    );
    expect(new Set(PROFILE_IDS).size).toBe(PROFILE_IDS.length);
    expect(Object.isFrozen(PROFILE_IDS)).toBe(true);
    expect(Object.isFrozen(COMMAND_LIMITS)).toBe(true);
    expect(Object.isFrozen(COMMAND_LIMITS.browser)).toBe(true);
    expect(Object.isFrozen(TASK_GRAPH_POLICIES)).toBe(true);
    expect(DIRECT_ROOT_COORDINATOR_GRAMMARS.map((row) => row.path)).toEqual(
      [...DIRECT_ROOT_COORDINATOR_GRAMMARS].map((row) => row.path).sort()
    );
    expect(Number(COMMAND_LIMITS.browser.activeMs) + 50_000).toBe(1_430_000);
    expect(
      Number(COMMAND_LIMITS.install.activeMs) +
        COMMAND_LIMITS.install.termMs +
        COMMAND_LIMITS.install.killMs
    ).toBe(640_000);
    expect(
      Number(COMMAND_LIMITS.browserInstall.activeMs) +
        COMMAND_LIMITS.browserInstall.termMs +
        COMMAND_LIMITS.browserInstall.killMs
    ).toBe(940_000);
    expect(COMMAND_LIMITS.platform.activeMs).toBeNull();
  });

  it('registers the complete R03 predecessor profile set with immutable reservations', () => {
    const required: CommandBoundaryProfileId[] = [
      'release-provenance-v1',
      'release-runtime-check-v1',
      'isolated-build-v1',
      'chrome-prepare-v1',
      'chrome-verify-v1',
      'chrome-dry-run-v1',
      'chrome-publish-v1',
      'firefox-prepare-v1',
      'firefox-verify-v1',
      'firefox-smoke-v1',
      'firefox-submit-v1',
      'release-job-outputs-v1',
      'release-result-field-v1',
      'release-state-init-v1',
      'release-state-check-v1',
      'local-install-v1',
      'npm-audit-context-v1',
      'npm-tree-read-v1'
    ];

    expect(PROFILE_IDS).toEqual(expect.arrayContaining(required));
    expect(Number(COMMAND_LIMITS.isolatedBuild.activeMs) + 10_000).toBe(640_000);
    expect(Number(COMMAND_LIMITS.chromePrepare.activeMs) + 10_000).toBe(730_000);
    expect(Number(COMMAND_LIMITS.chromeVerify.activeMs) + 10_000).toBe(310_000);
    expect(Number(COMMAND_LIMITS.chromePublish.activeMs) + 10_000).toBe(730_000);
    expect(Number(COMMAND_LIMITS.firefoxPrepare.activeMs) + 10_000).toBe(1_210_000);
    expect(Number(COMMAND_LIMITS.firefoxVerify.activeMs) + 10_000).toBe(490_000);
    expect(Number(COMMAND_LIMITS.firefoxSmoke.activeMs) + 10_000).toBe(450_000);
    expect(Number(COMMAND_LIMITS.firefoxSubmit.activeMs) + 10_000).toBe(2_710_000);
    expect(Number(COMMAND_LIMITS.stitch.activeMs) + 50_000).toBe(3_830_000);
  });

  it('accepts only the exact finite release grammars', () => {
    const root = '/private/tmp/zendio-release-contract';
    const cases: Array<[CommandBoundaryProfileId, string[]]> = [
      [
        'release-provenance-v1',
        [
          'scripts/utils/releaseCiProvenance.mjs',
          '--prepare-authorization',
          '--expected-sha',
          'a'.repeat(40),
          '--required-jobs-source',
          'scripts/config/releaseRequiredCiJobs.mjs',
          '--authorization-record',
          `${root}/authorization.json`
        ]
      ],
      [
        'release-provenance-v1',
        ['scripts/utils/releaseArtifactManifest.mjs', '--validate-upload-artifact-id', '1']
      ],
      [
        'release-provenance-v1',
        [
          'scripts/utils/releaseArtifactManifest.mjs',
          '--normalize-upload-artifact-digest',
          'b'.repeat(64)
        ]
      ],
      ['release-runtime-check-v1', ['--check', '--config-mode', 'standalone-synthetic']],
      [
        'isolated-build-v1',
        [
          '--run-isolated-build',
          '--config-mode',
          'standalone-synthetic',
          '--browser',
          'chrome',
          '--dist-dir',
          `${root}/dist-chrome`,
          '--temp-dir',
          `${root}/tmp-chrome`
        ]
      ],
      [
        'chrome-prepare-v1',
        [
          '--config-mode',
          'standalone-synthetic',
          '--attempt-root',
          root,
          '--dist-dir',
          `${root}/dist-chrome`,
          '--release-dir',
          `${root}/release/chrome`,
          '--result-json',
          `${root}/release/chrome-result.json`
        ]
      ],
      [
        'firefox-prepare-v1',
        [
          '--config-mode',
          'owner-public-vars',
          '--transport-mode',
          'local-private-v1',
          '--attempt-root',
          root,
          '--dist-dir',
          `${root}/dist-firefox`,
          '--release-dir',
          `${root}/release/firefox`,
          '--authorization-record',
          `${root}/authorization.json`,
          '--result-json',
          `${root}/release/firefox-result.json`
        ]
      ],
      [
        'chrome-verify-v1',
        ['--manifest', `${root}/manifest.json`, '--transport-mode', 'local-private-v1']
      ],
      [
        'firefox-verify-v1',
        ['--manifest', `${root}/manifest.json`, '--transport-mode', 'github-artifact-v1']
      ],
      [
        'firefox-smoke-v1',
        [
          '--manifest',
          `${root}/manifest.json`,
          '--transport-mode',
          'local-private-v1',
          '--result-json',
          `${root}/smoke.json`
        ]
      ],
      [
        'chrome-dry-run-v1',
        [
          '--dry-run',
          '--zip',
          `${root}/release.zip`,
          '--artifact-manifest',
          `${root}/manifest.json`,
          '--state-file',
          `${root}/dry-state.json`,
          '--transport-mode',
          'local-private-v1'
        ]
      ],
      [
        'chrome-publish-v1',
        [
          '--publish',
          '--artifact-manifest',
          `${root}/manifest.json`,
          '--state-file',
          `${root}/publish-state.json`,
          '--transport-mode',
          'github-artifact-v1'
        ]
      ],
      [
        'firefox-submit-v1',
        [
          '--artifact-manifest',
          `${root}/manifest.json`,
          '--transport-mode',
          'github-artifact-v1',
          '--submission-state-file',
          `${root}/submission-state.json`,
          '--saved-upload-uuid-path',
          `${root}/upload-uuid.json`,
          '--channel',
          'listed'
        ]
      ],
      ['release-job-outputs-v1', ['--browser', 'chrome', '--result-json', `${root}/result.json`]],
      [
        'release-result-field-v1',
        ['--browser', 'firefox', '--result-json', `${root}/result.json`, '--field', 'xpiPath']
      ],
      ['release-state-init-v1', ['--browser', 'chrome']],
      ['release-state-check-v1', ['--browser', 'firefox']],
      ['local-install-v1', []],
      [
        'npm-audit-context-v1',
        ['--verify-baseline-context', '--baseline-manifest', `${root}/audit.json`]
      ],
      ['npm-tree-read-v1', ['ls', 'yauzl', 'crc-32', 'dependency-cruiser', 'yaml', '--all']]
    ];

    for (const [profileId, args] of cases) {
      expect(() =>
        parseManagedCommandInvocationArgv([
          'node',
          'scripts/run-bounded-command.mjs',
          '--profile',
          profileId,
          ...(args.length > 0 ? ['--', ...args] : [])
        ])
      ).not.toThrow();
    }

    for (const [profileId, args] of cases.filter(([, values]) => values.length > 1)) {
      expect(() =>
        parseManagedCommandInvocationArgv([
          'node',
          'scripts/run-bounded-command.mjs',
          '--profile',
          profileId,
          '--',
          ...[...args].reverse()
        ])
      ).toThrow();
    }
  });

  it('uses one closed parser for profile and direct-root invocations', () => {
    expect(
      parseManagedCommandInvocationArgv([
        'node',
        'scripts/run-bounded-command.mjs',
        '--profile',
        'vitest-v1',
        '--',
        'run',
        '--config',
        'vitest.unit.config.ts'
      ])
    ).toEqual({
      kind: 'profile',
      profileId: 'vitest-v1',
      arguments: ['run', '--config', 'vitest.unit.config.ts'],
      separatorPresent: true
    });
    expect(
      parseManagedCommandInvocationArgv([
        'node',
        'scripts/run-bounded-command.mjs',
        '--profile',
        'playwright-host-deps-platform-v1',
        '--',
        'firefox-with-host-deps'
      ])
    ).toMatchObject({
      profileId: 'playwright-host-deps-platform-v1',
      arguments: ['firefox-with-host-deps']
    });
    expect(
      parseManagedCommandInvocationArgv(['node', 'scripts/run-test-shards.mjs', 'unit', 'tools'])
    ).toEqual({
      kind: 'coordinator',
      coordinatorId: 'scripts/run-test-shards.mjs',
      arguments: ['unit', 'tools']
    });

    for (const argv of [
      ['npx', 'vitest'],
      ['node', 'scripts/run-bounded-command.mjs', '--profile'],
      ['node', 'scripts/run-bounded-command.mjs', '--profile', 'vitest-v1', 'run'],
      ['node', 'scripts/run-bounded-command.mjs', '--profile', 'vitest-v1', '--'],
      ['node', 'scripts/run-test-shards.mjs', 'unit', 'video'],
      ['node', 'scripts/run-browser-test-shards.mjs', 'firefox'],
      [
        'node',
        'scripts/run-bounded-command.mjs',
        '--profile',
        'github-ci-install-v1',
        '--',
        'unexpected'
      ],
      [
        'node',
        'scripts/run-bounded-command.mjs',
        '--profile',
        'playwright-browser-install-v1',
        '--',
        'webkit-with-host-deps'
      ]
    ]) {
      expect(() => parseManagedCommandInvocationArgv(argv)).toThrow();
    }
  });

  it('reserves and binds the canonical GitHub CI install attempt before npm starts', () => {
    const fixture = ciInstallFixture();
    const profile = resolveCommandProfile('github-ci-install-v1', [], {
      environment: fixture.environment,
      operations: fixture.operations
    });
    const attemptRoot = join(fixture.runnerTemp, 'zendio-ci-node-123456-2-unit-contract');

    expect(profile.argv.slice(1)).toEqual([
      'ci',
      '--ignore-scripts',
      '--include=optional',
      '--no-audit',
      '--no-fund',
      `--userconfig=${attemptRoot}/install/npm-userconfig`,
      `--globalconfig=${attemptRoot}/install/npm-globalconfig`
    ]);
    expect(profile).toMatchObject({
      shell: false,
      tty: false,
      detached: process.platform !== 'win32',
      ciInstallOutputs: {
        path: fixture.output,
        lines: [
          `attempt-root=${attemptRoot}`,
          `npm-userconfig=${attemptRoot}/install/npm-userconfig`,
          `npm-globalconfig=${attemptRoot}/install/npm-globalconfig`
        ]
      }
    });
    expect(profile.env).toMatchObject({
      HOME: `${attemptRoot}/install`,
      NPM_CONFIG_USERCONFIG: `${attemptRoot}/install/npm-userconfig`,
      NPM_CONFIG_GLOBALCONFIG: `${attemptRoot}/install/npm-globalconfig`
    });
    expect(lstatSync(attemptRoot).mode & 0o777).toBe(0o700);
    expect(lstatSync(`${attemptRoot}/install`).mode & 0o777).toBe(0o700);
    expect(lstatSync(`${attemptRoot}/install/npm-userconfig`).mode & 0o777).toBe(0o600);
    expect(() =>
      resolveCommandProfile('github-ci-install-v1', [], {
        environment: fixture.environment,
        operations: fixture.operations
      })
    ).toThrow('CI_ATTEMPT_REUSED');
  });

  it('fails the CI install profile closed on stamp, budget, casing, output, and protected inputs', () => {
    const mutations = [
      (environment: NodeJS.ProcessEnv) => ({ ...environment, ZENDIO_JOB_TIMEOUT_MINUTES: '29' }),
      (environment: NodeJS.ProcessEnv) => ({ ...environment, imageos: environment.ImageOS }),
      (environment: NodeJS.ProcessEnv) => ({ ...environment, GITHUB_OUTPUT: '../output' }),
      (environment: NodeJS.ProcessEnv) => ({
        ...environment,
        ZENDIO_EXPECTED_RELEASE_SHA: '0'.repeat(40)
      })
    ];

    for (const mutate of mutations) {
      const fixture = ciInstallFixture();
      expect(() =>
        resolveCommandProfile('github-ci-install-v1', [], {
          environment: mutate(fixture.environment),
          operations: fixture.operations
        })
      ).toThrow();
      expect(existsSync(join(fixture.runnerTemp, 'zendio-ci-node-123456-2-unit-contract'))).toBe(
        false
      );
    }
  });

  it.each(TEST_RELEASE_BROWSERS)(
    'binds the exact unprivileged %s prepare install root without protected outputs',
    (browser) => {
      const fixture = prepareCiInstallFixture(browser);
      const profile = resolveCommandProfile('github-ci-install-v1', [], {
        environment: fixture.environment,
        operations: fixture.operations
      });
      const expectedRoot = join(fixture.runnerTemp, `zendio-${browser}-876543-1`);
      expect(profile.commandContext).toEqual({
        attemptRoot: expectedRoot,
        jobClass: `${browser}-prepare-v1`,
        protectedJob: false
      });
      expect(lstatSync(expectedRoot).mode & 0o777).toBe(0o700);
    }
  );

  it.each(TEST_RELEASE_BROWSERS)(
    'binds the exact protected %s install inputs and release root',
    (browser) => {
      const fixture = protectedCiInstallFixture(browser);
      const profile = resolveCommandProfile('github-ci-install-v1', [], {
        environment: fixture.environment,
        operations: fixture.operations
      });
      const expectedRoot = join(
        fixture.runnerTemp,
        browser === 'chrome' ? 'zendio-chrome-publish-987654-1' : 'zendio-firefox-submit-987654-1'
      );

      expect(profile.commandContext).toEqual({
        attemptRoot: expectedRoot,
        jobClass: browser === 'chrome' ? 'chrome-publish-v1' : 'firefox-submit-v1',
        protectedJob: true
      });
      expect(profile.env).not.toHaveProperty('ZENDIO_EXPECTED_RELEASE_SHA');
      expect(profile.env).not.toHaveProperty('ZENDIO_EXPECTED_RELEASE_TREE');
      expect(profile.env).not.toHaveProperty('ZENDIO_EXPECTED_PACKAGE_SHA256');
      expect(profile.env).not.toHaveProperty('ZENDIO_EXPECTED_LOCK_SHA256');
      expect(lstatSync(expectedRoot).mode & 0o777).toBe(0o700);

      const bad = protectedCiInstallFixture(browser);
      expect(() =>
        resolveCommandProfile('github-ci-install-v1', [], {
          environment: { ...bad.environment, ZENDIO_EXPECTED_RELEASE_TREE: '0'.repeat(40) },
          operations: bad.operations
        })
      ).toThrow('CI_PROTECTED_INPUT_INVALID');
    }
  );

  it('owns one empty local attempt root and refuses reuse or CI authority', () => {
    const root = realpathSync(temporaryRoot());
    const environment = cleanEnvironment({ ZENDIO_LOCAL_ATTEMPT_ROOT: root });
    const profile = resolveCommandProfile('local-install-v1', [], { environment });

    expect(profile.commandContext).toEqual({ attemptRoot: root, localInstall: true });
    expect(profile.argv.slice(1, 6)).toEqual([
      'ci',
      '--ignore-scripts',
      '--include=optional',
      '--no-audit',
      '--no-fund'
    ]);
    expect(lstatSync(join(root, 'install')).mode & 0o777).toBe(0o700);
    expect(lstatSync(join(root, 'install/npm-userconfig')).mode & 0o777).toBe(0o600);
    expect(lstatSync(join(root, 'install/npm-globalconfig')).mode & 0o777).toBe(0o600);
    expect(() => resolveCommandProfile('local-install-v1', [], { environment })).toThrow();

    const foreign = realpathSync(temporaryRoot());
    expect(() =>
      resolveCommandProfile('local-install-v1', [], {
        environment: cleanEnvironment({
          CI: 'true',
          ZENDIO_LOCAL_ATTEMPT_ROOT: foreign
        })
      })
    ).toThrow('LOCAL_ENVIRONMENT_INVALID');
  });

  it('keeps future fixed files dormant and blocks generic release-owner bypasses', () => {
    const root = realpathSync(temporaryRoot());
    installAttemptConfigs(root);
    const environment = cleanEnvironment({ ZENDIO_LOCAL_ATTEMPT_ROOT: root });

    expect(() =>
      resolveCommandProfile(
        'chrome-prepare-v1',
        [
          '--config-mode',
          'standalone-synthetic',
          '--attempt-root',
          root,
          '--dist-dir',
          join(root, 'dist-chrome'),
          '--release-dir',
          join(root, 'release'),
          '--result-json',
          join(root, 'result.json')
        ],
        { environment }
      )
    ).toThrow('SOURCE_NOT_TRACKED');

    for (const path of [
      'scripts/prepare-chrome-release.mjs',
      'scripts/submit-firefox-amo-release.mjs',
      'scripts/utils/releaseCiProvenance.mjs',
      'scripts/utils/releaseArtifactManifest.mjs',
      'scripts/package.mjs',
      'scripts/package-firefox.mjs'
    ]) {
      expect(() =>
        parseManagedCommandInvocationArgv([
          'node',
          'scripts/run-bounded-command.mjs',
          '--profile',
          'node-script-standard-v1',
          '--',
          path
        ])
      ).toThrow('NODE_SCRIPT_FIXED_OWNER_REQUIRED');
    }

    for (const name of ['audit:firefox-amo-release:report', 'audit:firefox-amo-release:check']) {
      expect(() =>
        parseManagedCommandInvocationArgv([
          'node',
          'scripts/run-bounded-command.mjs',
          '--profile',
          'npm-script-standard-v1',
          '--',
          name
        ])
      ).not.toThrow();
    }
  });

  it('keeps the actions token and Chrome/Firefox credentials exclusive to their fixed profiles', () => {
    const fixedFileOperation = () => resolve('tests/fixtures/bounded-command/child.mjs');
    const chrome = releaseAttemptFixture('chrome', 'publish');
    const chromeManifest = join(chrome.attemptRoot, 'manifest.json');
    const chromeState = join(chrome.attemptRoot, 'store-state/chrome/publish-state.json');
    const chromeEnvironment = {
      ...chrome.environment,
      CWS_CLIENT_ID: 'client',
      CWS_CLIENT_SECRET: 'secret',
      CWS_EXTENSION_ID: 'extension',
      CWS_PUBLISHER_ID: 'publisher',
      CWS_REFRESH_TOKEN: 'refresh',
      ZENDIO_EXPECTED_RELEASE_MANIFEST_SHA256: 'a'.repeat(64)
    };
    const chromeProfile = resolveCommandProfile(
      'chrome-publish-v1',
      [
        '--publish',
        '--artifact-manifest',
        chromeManifest,
        '--state-file',
        chromeState,
        '--transport-mode',
        'github-artifact-v1'
      ],
      {
        environment: chromeEnvironment,
        operations: { fixedTrackedFileOperation: fixedFileOperation }
      }
    );
    expect(
      Object.keys(chromeProfile.env)
        .filter((key) => key.startsWith('CWS_'))
        .sort()
    ).toEqual([
      'CWS_CLIENT_ID',
      'CWS_CLIENT_SECRET',
      'CWS_EXTENSION_ID',
      'CWS_PUBLISHER_ID',
      'CWS_REFRESH_TOKEN'
    ]);
    expect(chromeProfile.env).not.toHaveProperty('ZENDIO_EXPECTED_RELEASE_MANIFEST_SHA256');
    expect(chromeProfile.env).not.toHaveProperty('WEB_EXT_API_KEY');

    expect(() =>
      resolveCommandProfile(
        'chrome-verify-v1',
        ['--manifest', chromeManifest, '--transport-mode', 'github-artifact-v1'],
        {
          environment: chromeEnvironment,
          operations: { fixedTrackedFileOperation: fixedFileOperation }
        }
      )
    ).toThrow('STORE_CREDENTIAL_FORBIDDEN');

    const firefox = releaseAttemptFixture('firefox', 'submit');
    const firefoxProfile = resolveCommandProfile(
      'firefox-submit-v1',
      [
        '--artifact-manifest',
        join(firefox.attemptRoot, 'manifest.json'),
        '--transport-mode',
        'github-artifact-v1',
        '--submission-state-file',
        join(firefox.attemptRoot, 'store-state/firefox/submission-state.json'),
        '--saved-upload-uuid-path',
        join(firefox.attemptRoot, 'store-state/firefox/web-ext-upload/upload-uuid.json'),
        '--channel',
        'listed'
      ],
      {
        environment: {
          ...firefox.environment,
          WEB_EXT_API_KEY: 'key',
          WEB_EXT_API_SECRET: 'secret',
          ZENDIO_EXPECTED_RELEASE_MANIFEST_SHA256: 'b'.repeat(64)
        },
        operations: { fixedTrackedFileOperation: fixedFileOperation }
      }
    );
    expect(firefoxProfile.env).toMatchObject({
      WEB_EXT_API_KEY: 'key',
      WEB_EXT_API_SECRET: 'secret'
    });
    expect(firefoxProfile.env).not.toHaveProperty('CWS_CLIENT_ID');

    const prepare = releaseAttemptFixture('chrome', 'prepare');
    const provenance = resolveCommandProfile(
      'release-provenance-v1',
      [
        'scripts/utils/releaseCiProvenance.mjs',
        '--prepare-authorization',
        '--expected-sha',
        'c'.repeat(40),
        '--required-jobs-source',
        'scripts/config/releaseRequiredCiJobs.mjs',
        '--authorization-record',
        join(prepare.attemptRoot, 'authorization.json')
      ],
      {
        environment: { ...prepare.environment, GITHUB_TOKEN: 'actions-token' },
        operations: { fixedTrackedFileOperation: fixedFileOperation }
      }
    );
    expect(provenance.env).toMatchObject({ GITHUB_TOKEN: 'actions-token' });
    expect(provenance.env).not.toHaveProperty('CWS_CLIENT_SECRET');
    expect(() =>
      resolveCommandProfile(
        'release-provenance-v1',
        ['scripts/utils/releaseArtifactManifest.mjs', '--validate-upload-artifact-id', '1'],
        {
          environment: { ...prepare.environment, GITHUB_TOKEN: 'actions-token' },
          operations: { fixedTrackedFileOperation: fixedFileOperation }
        }
      )
    ).toThrow('RELEASE_TOKEN_FORBIDDEN');
  });

  it('owns the seven release action-output keys without caller-selected output names', async () => {
    const fixture = releaseAttemptFixture('chrome', 'prepare');
    const manifest = join(fixture.attemptRoot, 'manifest.json');
    const zip = join(fixture.attemptRoot, 'release.zip');
    const resultPath = join(fixture.attemptRoot, 'result.json');
    writeFileSync(manifest, 'manifest-bytes', { mode: 0o600 });
    writeFileSync(zip, 'zip-bytes', { mode: 0o600 });
    writeFileSync(resultPath, canonicalJsonBytes({ manifestPath: manifest, zipPath: zip }), {
      mode: 0o600
    });

    const metadata = await runBoundedCommand(
      {
        profileId: 'release-job-outputs-v1',
        arguments: ['--browser', 'chrome', '--result-json', resultPath]
      },
      { environment: fixture.environment }
    );
    expect(metadata.ok).toBe(true);
    expect(
      readFileSync(fixture.output, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('=')[0])
    ).toEqual([
      'release_sha',
      'release_tree',
      'package_sha256',
      'lock_sha256',
      'release_manifest_sha256'
    ]);
    const selected = await runBoundedCommand(
      {
        profileId: 'release-result-field-v1',
        arguments: ['--browser', 'chrome', '--result-json', resultPath, '--field', 'zipPath']
      },
      { environment: fixture.environment }
    );
    expect(selected).toMatchObject({ ok: true, terminalReason: 'success' });
    expect(selected.output.stdout.text).toBe(zip);

    const actionCases: [string, string, string][] = [
      ['--validate-upload-artifact-id', '123', 'artifact_id=123\n'],
      [
        '--normalize-upload-artifact-digest',
        'a'.repeat(64),
        `artifact_digest=sha256:${'a'.repeat(64)}\n`
      ]
    ];
    for (const [mode, raw, expected] of actionCases) {
      const actionFixture = releaseAttemptFixture('chrome', 'prepare');
      const args = ['scripts/utils/releaseArtifactManifest.mjs', mode, raw];
      writeFileSync(actionFixture.output, expected, { flag: 'a' });
      const result = await runBoundedCommand(
        { profileId: 'release-provenance-v1', arguments: args },
        {
          environment: actionFixture.environment,
          resolveProfile(profileId, profileArgs) {
            const resolved = resolveCommandProfile('release-provenance-v1', profileArgs, {
              environment: actionFixture.environment,
              operations: {
                fixedTrackedFileOperation: () => resolve('tests/fixtures/bounded-command/child.mjs')
              }
            });
            return {
              ...resolved,
              argv: [resolve('tests/fixtures/bounded-command/child.mjs'), 'success']
            };
          }
        }
      );
      expect(result.ok).toBe(true);
      expect(readFileSync(actionFixture.output, 'utf8')).toBe(expected);
    }
  });

  it('publishes verification receipts, initializes isolated store state, and blocks cross-store use', async () => {
    const fixture = releaseAttemptFixture('chrome', 'publish');
    const manifest = join(fixture.attemptRoot, 'download/manifest.json');
    mkdirSync(join(fixture.attemptRoot, 'download'), { mode: 0o700 });
    writeFileSync(manifest, 'verified-manifest', { mode: 0o600 });
    const expectedManifestSha256 = sha256(manifest);
    const verifyEnvironment = {
      ...fixture.environment,
      ZENDIO_EXPECTED_RELEASE_MANIFEST_SHA256: expectedManifestSha256
    };
    const leaf = resolveCommandProfile('fixture-v1', ['success'], {
      environment: cleanEnvironment()
    });
    const verification = await runBoundedCommand(
      {
        profileId: 'chrome-verify-v1',
        arguments: ['--manifest', manifest, '--transport-mode', 'github-artifact-v1']
      },
      {
        environment: verifyEnvironment,
        resolveProfile: () => ({
          ...leaf,
          profileId: 'chrome-verify-v1',
          env: verifyEnvironment,
          commandContext: {
            attemptRoot: fixture.attemptRoot,
            browser: 'chrome',
            transport: 'github-artifact-v1',
            manifestPath: manifest,
            expectedManifestSha256
          }
        })
      }
    );
    expect(verification.ok).toBe(true);

    const initialized = await runBoundedCommand(
      { profileId: 'release-state-init-v1', arguments: ['--browser', 'chrome'] },
      { environment: fixture.environment }
    );
    const statePath = join(fixture.attemptRoot, 'store-state/chrome/publish-state.json');
    expect(initialized.ok).toBe(true);
    expect(existsSync(statePath)).toBe(true);

    const checked = await runBoundedCommand(
      { profileId: 'release-state-check-v1', arguments: ['--browser', 'chrome'] },
      { environment: fixture.environment }
    );
    expect(checked).toMatchObject({ ok: true, terminalReason: 'success' });
    expect(checked.output.stdout.text).toContain('"browser":"chrome"');

    const storeLeaf = {
      ...leaf,
      profileId: 'chrome-publish-v1',
      commandContext: {
        attemptRoot: fixture.attemptRoot,
        browser: 'chrome',
        statePath
      }
    };
    await expect(
      startBoundedCommand(
        { profileId: 'chrome-publish-v1', arguments: [] },
        { resolveProfile: () => storeLeaf }
      ).completion
    ).resolves.toMatchObject({ ok: true });

    expect(() =>
      startBoundedCommand(
        { profileId: 'firefox-submit-v1', arguments: [] },
        {
          resolveProfile: () => ({
            ...leaf,
            profileId: 'firefox-submit-v1',
            commandContext: {
              attemptRoot: fixture.attemptRoot,
              browser: 'firefox',
              statePath: join(fixture.attemptRoot, 'store-state/firefox/submission-state.json')
            }
          })
        }
      )
    ).toThrow();

    const failedFixture = releaseAttemptFixture('chrome', 'publish');
    const failedManifest = join(failedFixture.attemptRoot, 'manifest.json');
    writeFileSync(failedManifest, 'failed-manifest', { mode: 0o600 });
    const failedLeaf = resolveCommandProfile('fixture-v1', ['exit', '7'], {
      environment: cleanEnvironment()
    });
    const failed = await runBoundedCommand(
      { profileId: 'chrome-verify-v1', arguments: [] },
      {
        environment: failedFixture.environment,
        resolveProfile: () => ({
          ...failedLeaf,
          profileId: 'chrome-verify-v1',
          commandContext: {
            attemptRoot: failedFixture.attemptRoot,
            browser: 'chrome',
            transport: 'github-artifact-v1',
            manifestPath: failedManifest,
            expectedManifestSha256: sha256(failedManifest)
          }
        })
      }
    );
    expect(failed.ok).toBe(false);
    expect(
      existsSync(join(failedFixture.attemptRoot, 'receipts/chrome-artifact-verification.json'))
    ).toBe(false);

    const racedFixture = releaseAttemptFixture('chrome', 'publish');
    const racedManifest = join(racedFixture.attemptRoot, 'manifest.json');
    writeFileSync(racedManifest, 'raced-manifest', { mode: 0o600 });
    const racedDigest = sha256(racedManifest);
    const racedVerification = await runBoundedCommand(
      { profileId: 'chrome-verify-v1', arguments: [] },
      {
        environment: racedFixture.environment,
        resolveProfile: () => ({
          ...leaf,
          profileId: 'chrome-verify-v1',
          env: racedFixture.environment,
          commandContext: {
            attemptRoot: racedFixture.attemptRoot,
            browser: 'chrome',
            transport: 'github-artifact-v1',
            manifestPath: racedManifest,
            expectedManifestSha256: racedDigest
          }
        })
      }
    );
    expect(racedVerification.ok).toBe(true);
    const foreign = realpathSync(temporaryRoot());
    symlinkSync(foreign, join(racedFixture.attemptRoot, 'store-state'));
    const raced = await runBoundedCommand(
      { profileId: 'release-state-init-v1', arguments: ['--browser', 'chrome'] },
      { environment: racedFixture.environment }
    );
    expect(raced).toMatchObject({ ok: false, terminalReason: 'RELEASE_STATE_ROOT_PREEXISTS' });
  });

  it('keeps privileged host dependencies separate from the bounded browser install phase', () => {
    const environment = cleanEnvironment({ PLAYWRIGHT_BROWSERS_PATH: '/private/browsers' });
    const host = resolveCommandProfile(
      'playwright-host-deps-platform-v1',
      ['chromium-with-host-deps'],
      { environment }
    );
    const browser = resolveCommandProfile(
      'playwright-browser-install-v1',
      ['firefox-with-host-deps'],
      { environment }
    );

    expect(host.argv.slice(-2)).toEqual(['install-deps', 'chromium']);
    expect(host).toMatchObject({ platformOwned: true, detached: false });
    expect(host.limits.activeMs).toBeNull();
    expect(browser.argv.slice(-2)).toEqual(['install', 'firefox']);
    expect(browser).toMatchObject({
      platformOwned: false,
      detached: process.platform !== 'win32'
    });
    expect(browser.limits).toBe(COMMAND_LIMITS.browserInstall);
    expect(host.executable).toBe(process.execPath);
    expect(browser.executable).toBe(process.execPath);
  });

  it('binds the five governed package bins to the accepted lock identities', () => {
    const environment = cleanEnvironment();
    const cases: Array<[CommandBoundaryProfileId, string[]]> = [
      ['vitest-v1', ['run']],
      ['prettier-v1', ['--check', 'package.json']],
      ['stylelint-v1', ['--print-config', 'src/options/stitch/styles/runtime/responsive.css']],
      ['lint-staged-hook-v1', []],
      ['husky-provision-v1', []]
    ];
    for (const [profileId, args] of cases) {
      const profile = resolveCommandProfile(profileId, args, { environment });
      expect(profile.executable).toBe(process.execPath);
      expect(profile.argv[0]).toMatch(/^\/.*node_modules\//u);
      expect(profile.shell).toBe(false);
      expect(profile.tty).toBe(false);
      expect(profile.cwd).toBe(resolve('.'));
    }
  });

  it('constructs a closed environment and rejects hostile ambient authority', () => {
    expect(buildClosedCommandEnvironment(cleanEnvironment({ SECRET_VALUE: 'hidden' }))).toEqual({
      HOME: process.env.HOME ?? tmpdir(),
      TMPDIR: tmpdir(),
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC',
      PATH: `${resolve(process.execPath, '..')}:/usr/bin:/bin`
    });
  });

  it('strips the exact empty npm lifecycle no-proxy placeholder without admitting proxy authority', () => {
    expect(buildClosedCommandEnvironment(verifiedNpmLifecycleEnvironment())).toEqual({
      HOME: process.env.HOME ?? tmpdir(),
      TMPDIR: tmpdir(),
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC',
      PATH: `${resolve(process.execPath, '..')}:/usr/bin:/bin`
    });
    expect(() =>
      buildClosedCommandEnvironment(
        verifiedNpmLifecycleEnvironment({ npm_config_noproxy: 'localhost' })
      )
    ).toThrow('ENVIRONMENT_FORBIDDEN');
    expect(() =>
      buildClosedCommandEnvironment(verifiedNpmLifecycleEnvironment({ NPM_CONFIG_NOPROXY: '' }))
    ).toThrow('ENVIRONMENT_FORBIDDEN');
    expect(() =>
      buildClosedCommandEnvironment(cleanEnvironment({ npm_config_noproxy: '' }))
    ).toThrow('ENVIRONMENT_FORBIDDEN');
  });

  it.each([
    ['HTTP_PROXY', ''],
    ['HTTP_PROXY', 'http://127.0.0.1:8080'],
    ['HTTPS_PROXY', ''],
    ['HTTPS_PROXY', 'http://127.0.0.1:8080'],
    ['npm_config_http_proxy', ''],
    ['npm_config_https_proxy', ''],
    ['npm_config_proxy', ''],
    ['CUSTOM_PROXY_ROUTE', '']
  ])('rejects direct or npm-lifecycle proxy authority %s', (key, value) => {
    expect(() =>
      buildClosedCommandEnvironment(verifiedNpmLifecycleEnvironment({ [key]: value }))
    ).toThrow('ENVIRONMENT_FORBIDDEN');
  });

  it.each([
    'NODE_OPTIONS',
    'HUSKY',
    'HTTP_PROXY',
    'NODE_EXTRA_CA_CERTS',
    'CUSTOM_LOADER_PATH',
    'QUALITY_CONCURRENCY',
    'TEST_SHARD_CONCURRENCY',
    'BROWSER_TEST_CONCURRENCY'
  ])('rejects hostile environment key %s', (key) => {
    expect(() => buildClosedCommandEnvironment(cleanEnvironment({ [key]: '' }))).toThrow(
      'ENVIRONMENT_FORBIDDEN'
    );
  });

  it('accepts only canonical private request bytes with the closed two-field schema', () => {
    const root = temporaryRoot();
    writeRequest(root, { arguments: ['success', 'request-ok'], profileId: 'fixture-v1' });
    expect(
      readCanonicalCommandRequest(cleanEnvironment({ ZENDIO_COMMAND_ATTEMPT_ROOT: root }))
    ).toMatchObject({
      profileId: 'fixture-v1',
      arguments: ['success', 'request-ok'],
      root: realpathSync(root)
    });
  });

  it('rejects duplicate, unknown, noncanonical, oversized, wrong-mode, linked, and symlink requests', () => {
    const cases: Array<(root: string) => void> = [
      (root) =>
        writeFileSync(
          join(root, 'command-request.json'),
          '{"arguments":[],"profileId":"fixture-v1","profileId":"fixture-v1"}\n',
          { mode: 0o600 }
        ),
      (root) =>
        writeRequest(root, { arguments: ['success'], extra: true, profileId: 'fixture-v1' }),
      (root) =>
        writeRequest(
          root,
          { profileId: 'fixture-v1', arguments: ['success'] },
          { canonical: false }
        ),
      (root) =>
        writeFileSync(join(root, 'command-request.json'), Buffer.alloc(70 * 1024, 0x20), {
          mode: 0o600
        }),
      (root) =>
        writeRequest(root, { arguments: ['success'], profileId: 'fixture-v1' }, { mode: 0o644 }),
      (root) => {
        const request = writeRequest(root, { arguments: ['success'], profileId: 'fixture-v1' });
        linkSync(request, join(root, 'alias.json'));
      },
      (root) => {
        const target = join(root, 'target.json');
        writeFileSync(
          target,
          canonicalJsonBytes({ arguments: ['success'], profileId: 'fixture-v1' }),
          { mode: 0o600 }
        );
        symlinkSync(target, join(root, 'command-request.json'));
      }
    ];

    for (const prepare of cases) {
      const root = temporaryRoot();
      prepare(root);
      expect(() =>
        readCanonicalCommandRequest(cleanEnvironment({ ZENDIO_COMMAND_ATTEMPT_ROOT: root }))
      ).toThrow();
    }
  });

  it('keeps shell metacharacters literal and rejects response/traversal paths', async () => {
    const root = temporaryRoot();
    const marker = join(root, 'should-not-exist');
    const token = `$(touch ${marker})`;
    const result = await runBoundedCommand(
      { profileId: 'fixture-v1', arguments: ['success', token] },
      { environment: cleanEnvironment() }
    );
    expect(result.ok).toBe(true);
    expect(result.output.stdout.text).toBe(token);
    expect(() =>
      resolveCommandProfile('vitest-v1', ['run', '@args'], { environment: cleanEnvironment() })
    ).toThrow();
    expect(() =>
      resolveCommandProfile('node-script-standard-v1', ['../escape.mjs'], {
        environment: cleanEnvironment()
      })
    ).toThrow();
  });

  it('isolates FD3/4/5 and closes parent FD25 without allocating a TTY', async () => {
    const root = temporaryRoot();
    const descriptors: number[] = [];
    try {
      while ((descriptors.at(-1) ?? -1) < 64) {
        descriptors.push(openSync(join(root, `fd-${descriptors.length}`), 'w'));
      }
      expect(() => fstatSync(25)).not.toThrow();
      const result = await runBoundedCommand(
        { profileId: 'fixture-v1', arguments: ['descriptors'] },
        { environment: cleanEnvironment() }
      );
      expect(result.ok).toBe(true);
      const open = result.output.stdout.text
        .match(/^stdout:([^;]+)/u)?.[1]
        .split(',')
        .map(Number);
      expect(open).toEqual(expect.arrayContaining([0, 1, 2, 3, 4, 5]));
      expect(open).not.toContain(25);
      expect(result.output.stdout.text).toContain('tty:false,false,false,false,false,false');
      expect(result.output.stderr.text).toBe('stderr');
      expect(result.output.fd4.text).toBe('fd4:fd3-input');
      expect(result.output.fd5.text).toBe('fd5');
    } finally {
      for (const fd of descriptors) closeSync(fd);
    }
  });

  it('preserves exact nonzero exit and signal outcomes', async () => {
    const failed = await runBoundedCommand(
      { profileId: 'fixture-v1', arguments: ['exit', '7'] },
      { environment: cleanEnvironment() }
    );
    const signalled = await runBoundedCommand(
      { profileId: 'fixture-v1', arguments: ['signal', 'SIGTERM'] },
      { environment: cleanEnvironment() }
    );
    expect(failed).toMatchObject({
      ok: false,
      terminalReason: 'nonzero',
      exitCode: 7,
      signal: null
    });
    expect(signalled).toMatchObject({
      ok: false,
      terminalReason: 'signal',
      exitCode: null,
      signal: 'SIGTERM'
    });
    expect(Object.isFrozen(failed)).toBe(true);
    expect(Object.isFrozen(failed.output)).toBe(true);
  });

  it('owns timeout, TERM-ignore escalation, held-pipe drain, and output overflow', async () => {
    const environment = cleanEnvironment();
    const timeout = await runBoundedCommand(
      { profileId: 'fixture-v1', arguments: ['delay', '2000'] },
      { environment }
    );
    const ignored = await runBoundedCommand(
      { profileId: 'fixture-v1', arguments: ['ignore-term', '5000'] },
      { environment }
    );
    const held = await runBoundedCommand(
      { profileId: 'fixture-v1', arguments: ['hold-pipe', '5000'] },
      { environment }
    );
    const overflow = await runBoundedCommand(
      { profileId: 'fixture-v1', arguments: ['overflow', 'o', '70000'] },
      { environment }
    );
    expect(timeout).toMatchObject({
      ok: false,
      terminalReason: 'timeout',
      closeObserved: true,
      pipeDrainObserved: true
    });
    expect(ignored.escalation.map((entry) => entry.signal)).toEqual(['SIGTERM', 'SIGKILL']);
    expect(held).toMatchObject({ ok: false, closeObserved: true, pipeDrainObserved: true });
    expect(overflow).toMatchObject({ ok: false, terminalReason: 'output-overflow' });
    expect(overflow.output.stdout).toMatchObject({ bytes: 70000, overflow: true });
  });

  it('delegates cancellation to the active runtime guard and waits for real close and drain', async () => {
    const environment = cleanEnvironment();
    const guardSpec = resolveCommandProfile('fixture-v1', ['ignore-term', '5000'], {
      environment
    });
    const leafSpec = resolveCommandProfile('fixture-v1', ['success', 'leaf-must-not-start'], {
      environment
    });
    const handle = startBoundedCommand(
      { profileId: 'vitest-v1', arguments: ['run'] },
      {
        environment,
        resolveProfile(profileId) {
          return {
            ...(profileId === 'vitest-v1' ? leafSpec : guardSpec),
            profileId
          };
        }
      }
    );

    const guardChild = await waitForActiveChild(handle);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    expect(handle.cancel('cancelled')).toBe(true);
    const result = await handle.completion;

    expect(guardChild.pid).toBeGreaterThan(1);
    expect(handle.child).toBeNull();
    expect(result).toMatchObject({
      ok: false,
      terminalReason: 'cancelled',
      cancelled: true,
      signal: 'SIGKILL',
      closeObserved: true,
      pipeDrainObserved: true
    });
    expect(result.escalation.map((entry) => entry.signal)).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it.each(['vitest-v1', 'playwright-v1'])(
    'delegates cancellation to the active %s leaf without allowing late success',
    async (profileId) => {
      const environment = cleanEnvironment();
      const guardSpec = resolveCommandProfile('fixture-v1', ['delay', '100'], {
        environment
      });
      const leafSpec = resolveCommandProfile('fixture-v1', ['ignore-term', '5000'], {
        environment
      });
      const handle = startBoundedCommand(
        {
          profileId,
          arguments: profileId === 'vitest-v1' ? ['run'] : ['test']
        },
        {
          environment,
          resolveProfile(resolvedProfileId) {
            return {
              ...(resolvedProfileId === 'node-script-standard-v1' ? guardSpec : leafSpec),
              profileId: resolvedProfileId
            };
          }
        }
      );

      const guardChild = await waitForActiveChild(handle);
      const leafChild = await waitForActiveChild(handle, guardChild);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      expect(handle.cancel('root-deadline')).toBe(true);
      const result = await handle.completion;

      expect(leafChild.pid).not.toBe(guardChild.pid);
      expect(handle.child).toBeNull();
      expect(result).toMatchObject({
        ok: false,
        terminalReason: 'root-deadline',
        cancelled: true,
        closeObserved: true,
        pipeDrainObserved: true
      });
      expect(['SIGTERM', 'SIGKILL']).toContain(result.signal);
      expect(result.escalation[0]).toMatchObject({ signal: 'SIGTERM', delivered: true });
    }
  );

  it('latches cancellation between real sequence phases and prevents later admission', async () => {
    const environment = cleanEnvironment();
    const phaseSpec = resolveCommandProfile('fixture-v1', ['delay', '100'], {
      environment
    });
    const compositeSpec = {
      ...phaseSpec,
      profileId: 'stitch-secondary-v1',
      composite: 'stitch-secondary-v1'
    };
    const resolvedProfiles: string[] = [];
    const handle = startBoundedCommand(
      { profileId: 'stitch-secondary-v1', arguments: [] },
      {
        environment,
        resolveProfile(profileId) {
          resolvedProfiles.push(profileId);
          return profileId === 'stitch-secondary-v1' ? compositeSpec : { ...phaseSpec, profileId };
        }
      }
    );

    const firstPhaseChild = await waitForActiveChild(handle);
    firstPhaseChild.prependOnceListener('close', () => handle.cancel('parent-signal'));
    const result = await handle.completion;

    expect(resolvedProfiles).toEqual(['stitch-secondary-v1', 'node-script-standard-v1']);
    expect(handle.child).toBeNull();
    expect(result).toMatchObject({
      ok: false,
      terminalReason: 'parent-signal',
      cancelled: true,
      closeObserved: true,
      pipeDrainObserved: true
    });
    expect(result.output.stdout.text).toBe('late-success');
  });

  it('reports a synchronous spawn failure without leaking signal listeners', async () => {
    const before = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM')
    };
    const base = resolveCommandProfile('fixture-v1', ['success'], {
      environment: cleanEnvironment()
    });
    const result = await runBoundedCommand(
      { profileId: 'fixture-v1', arguments: ['success'] },
      {
        environment: cleanEnvironment(),
        resolveProfile: () => ({ ...base, executable: '/definitely/missing/zendio-command' })
      }
    );
    expect(result).toMatchObject({ ok: false, terminalReason: 'spawn-error' });
    expect(process.listenerCount('SIGINT')).toBe(before.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(before.SIGTERM);
  });

  it('runs the literal external helper from one canonical request file', () => {
    const root = temporaryRoot();
    writeRequest(root, { arguments: ['success', 'external-ok'], profileId: 'fixture-v1' });
    const result = spawnSync(process.execPath, ['scripts/run-bounded-command.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: cleanEnvironment({ ZENDIO_COMMAND_ATTEMPT_ROOT: root })
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('external-ok');
    expect(result.stderr).toBe('');
  });

  it('publishes CI install outputs only after the bounded child succeeds', async () => {
    const root = temporaryRoot();
    const output = join(root, 'github-output');
    writeFileSync(output, '', { mode: 0o600 });
    chmodSync(output, 0o600);
    const base = resolveCommandProfile('fixture-v1', ['success', 'installed'], {
      environment: cleanEnvironment()
    });
    const result = await runBoundedCommand(
      { profileId: 'github-ci-install-v1', arguments: [] },
      {
        environment: cleanEnvironment(),
        resolveProfile: () => ({
          ...base,
          profileId: 'github-ci-install-v1',
          ciInstallOutputs: {
            path: output,
            lines: ['attempt-root=/private/attempt', 'npm-userconfig=/private/userconfig']
          }
        })
      }
    );

    expect(result.ok).toBe(true);
    expect(readFileSync(output, 'utf8')).toBe(
      'attempt-root=/private/attempt\nnpm-userconfig=/private/userconfig\n'
    );
  });

  it('keeps the tracked hook target on the invariant boundary route', () => {
    expect(readFileSync(resolve('.husky/pre-commit'), 'utf8')).toBe(
      '#!/usr/bin/env sh\nnode scripts/run-bounded-command.mjs --profile lint-staged-hook-v1\n'
    );
  });
});
