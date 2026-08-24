import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
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
  runBoundedCommand
} from '../../../scripts/utils/boundedCommand.mjs';

const temporaryRoots: string[] = [];

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
