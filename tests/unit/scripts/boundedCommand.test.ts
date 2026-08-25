import { spawn, spawnSync, type SpawnOptions } from 'node:child_process';
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
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildZipFixture } from '../../utils/zipFixtureBuilder';
import {
  COMMAND_LIMITS,
  DIRECT_ROOT_COORDINATOR_GRAMMARS,
  PROFILE_IDS,
  R03_CI_JOB_SEQUENCE_RESERVATIONS,
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
import {
  canonicalArtifactJson,
  createFirefoxReleaseArtifactManifest,
  verifyFirefoxReleaseArtifactManifest
} from '../../../scripts/utils/firefoxReleaseArtifactManifest.mjs';
import {
  FIREFOX_AMO_API_BASE_URL,
  FIREFOX_SUBMISSION_LIMITS,
  submitVerifiedFirefoxXpi
} from '../../../scripts/utils/firefoxExactXpiSubmit.mjs';
import {
  STANDALONE_SYNTHETIC_CONFIG,
  validateReleasePublicBuildConfig
} from '../../../scripts/utils/releasePublicBuildConfig.mjs';

const temporaryRoots: string[] = [];
const TEST_RELEASE_BROWSERS: ('chrome' | 'firefox')[] = ['chrome', 'firefox'];

type RequestValue = string | boolean | string[] | null;
type FirefoxMutation = 'upload' | 'version-submit' | 'source-patch';
const UUID_FAILURE_MODES: ('mismatch' | 'malformed' | 'timeout' | 'pre-publication')[] = [
  'mismatch',
  'malformed',
  'timeout',
  'pre-publication'
];
const UUID_OPTIONAL_EVIDENCE: ('absent' | 'present')[] = ['absent', 'present'];
const FIREFOX_CHANNELS: ('listed' | 'unlisted')[] = ['listed', 'unlisted'];
const UUID_RACES: ('appearance' | 'disappearance' | 'replacement' | 'byte-drift')[] = [
  'appearance',
  'disappearance',
  'replacement',
  'byte-drift'
];

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

function firefoxPlaywrightPhaseFixture() {
  const fixture = releaseAttemptFixture('firefox', 'prepare');
  installAttemptConfigs(fixture.attemptRoot);
  const userconfig = join(fixture.attemptRoot, 'install/npm-userconfig');
  const globalconfig = join(fixture.attemptRoot, 'install/npm-globalconfig');
  const browsersPath = join(fixture.attemptRoot, 'playwright-browsers');
  return {
    ...fixture,
    browsersPath,
    userconfig,
    globalconfig,
    phaseEnvironment: {
      ...fixture.environment,
      NPM_CONFIG_USERCONFIG: userconfig,
      NPM_CONFIG_GLOBALCONFIG: globalconfig,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
      ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: fixture.attemptRoot
    }
  };
}

function rewriteCanonicalOwnedJson(
  path: string,
  mutate: (value: Record<string, RequestValue>) => void
) {
  const value: Record<string, RequestValue> = JSON.parse(readFileSync(path, 'utf8'));
  mutate(value);
  const sorted = Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  );
  writeFileSync(path, `${JSON.stringify(sorted)}\n`);
  chmodSync(path, 0o600);
}

function bindingAuthorityFields(path: string): string {
  return readFileSync(path, 'utf8').replace(
    /"state(?:Device|Inode|Mode|Size|Sha256)":"[^"]*",?/gu,
    ''
  );
}

function publishFirefoxUuidEvidence(
  statePath: string,
  channel: 'listed' | 'unlisted' = 'listed',
  uploadUuid = 'upload-uuid'
): { path: string; sha256: string } {
  const path = join(dirname(statePath), 'web-ext-upload/upload-uuid.json');
  const bytes = canonicalJsonBytes({ channel, uploadUuid, xpiCrcHash: 'e'.repeat(64) });
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  chmodSync(path, 0o600);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function writeStoreTerminalState(
  statePath: string,
  terminal: {
    outcome: 'pre-mutation-failure' | 'unknown-submission-state' | 'success';
    started?: 'upload' | 'publish' | 'version-submit' | 'source-patch';
    completed?: 'upload' | 'publish' | 'version-submit' | 'source-patch';
    uuidEvidence?: 'present' | 'absent';
    channel?: 'listed' | 'unlisted';
    signedXpiSha256?: string | null;
  }
) {
  let uploadUuidSha256: string | null = null;
  if (statePath.endsWith('/submission-state.json')) {
    const channel = terminal.channel ?? 'listed';
    const laterPrefix = ['version-submit', 'source-patch'].includes(terminal.started ?? '');
    const defaultPresent =
      laterPrefix || terminal.outcome === 'success' || terminal.completed !== undefined;
    if ((terminal.uuidEvidence ?? (defaultPresent ? 'present' : 'absent')) === 'present') {
      uploadUuidSha256 = publishFirefoxUuidEvidence(statePath, channel).sha256;
    }
  }
  rewriteCanonicalOwnedJson(statePath, (value) => {
    value.outcome = terminal.outcome;
    value.mutationInvoked = terminal.outcome !== 'pre-mutation-failure';
    value.retrySafe = terminal.outcome === 'pre-mutation-failure';
    value.errorCode =
      terminal.outcome === 'pre-mutation-failure'
        ? 'PRE_MUTATION_FAILURE'
        : terminal.outcome === 'success'
          ? null
          : 'UNKNOWN_SUBMISSION_STATE';
    value.recovery =
      terminal.outcome === 'pre-mutation-failure'
        ? 'retry'
        : terminal.outcome === 'success'
          ? 'none'
          : 'reconcile';
    if (value.browser === 'firefox') value.channel = terminal.channel ?? 'listed';
    if (terminal.outcome !== 'pre-mutation-failure') {
      if (value.browser === 'chrome') {
        value.itemId = 'fixture-item';
        value.publisherIdFingerprint = 'a'.repeat(64);
        value.packageVersion = '1.0.0';
        value.archiveSha256 = 'b'.repeat(64);
        value.terminalResult = terminal.outcome === 'success' ? 'PENDING_REVIEW' : null;
      } else {
        value.geckoId = 'fixture@example.test';
        value.xpiSha256 = 'c'.repeat(64);
        value.sourceArchiveSha256 = 'd'.repeat(64);
        value.uploadUuidSha256 = uploadUuidSha256;
        value.signedXpiSha256 = terminal.signedXpiSha256 ?? null;
        value.terminalResult = terminal.outcome === 'success' ? value.channel : null;
      }
    }
    delete value.lastStartedOperation;
    delete value.lastCompletedOperation;
    if (terminal.started) value.lastStartedOperation = terminal.started;
    if (terminal.completed) value.lastCompletedOperation = terminal.completed;
    value.stage = terminal.started
      ? terminal.started === terminal.completed
        ? `${terminal.started}-completed`
        : `${terminal.started}-started`
      : 'preflight';
  });
}

async function initializedStoreFixture(browser: 'chrome' | 'firefox') {
  const fixture = releaseAttemptFixture(browser, browser === 'chrome' ? 'publish' : 'submit');
  installAttemptConfigs(fixture.attemptRoot);
  const manifest = join(fixture.attemptRoot, 'manifest.json');
  writeFileSync(manifest, `${browser}-bound-manifest`, { mode: 0o600 });
  const expectedManifestSha256 = sha256(manifest);
  const leaf = resolveCommandProfile('fixture-v1', ['success'], {
    environment: cleanEnvironment()
  });
  const verification = await runBoundedCommand(
    { profileId: `${browser}-verify-v1`, arguments: [] },
    {
      environment: fixture.environment,
      resolveProfile: () => ({
        ...leaf,
        profileId: `${browser}-verify-v1`,
        env: fixture.environment,
        commandContext: {
          attemptRoot: fixture.attemptRoot,
          browser,
          transport: 'github-artifact-v1',
          manifestPath: manifest,
          expectedManifestSha256
        }
      })
    }
  );
  if (!verification.ok) throw new Error('TEST_VERIFICATION_FAILED');
  const initialized = await runBoundedCommand(
    { profileId: 'release-state-init-v1', arguments: ['--browser', browser] },
    { environment: fixture.environment }
  );
  if (!initialized.ok) throw new Error('TEST_STATE_INIT_FAILED');
  const stateRoot = join(fixture.attemptRoot, 'store-state', browser);
  return {
    browser,
    fixture,
    manifest,
    expectedManifestSha256,
    statePath: join(
      stateRoot,
      browser === 'chrome' ? 'publish-state.json' : 'submission-state.json'
    ),
    bindingPath: join(fixture.attemptRoot, 'receipts', `${browser}-state-binding.json`),
    uuidPath: join(stateRoot, 'web-ext-upload/upload-uuid.json')
  };
}

async function createFirefoxSubmissionBinding(attemptRoot: string) {
  const releaseDir = join(attemptRoot, 'adapter-release');
  const distDir = join(attemptRoot, 'adapter-dist');
  const sourceDir = join(attemptRoot, 'adapter-source');
  for (const path of [releaseDir, distDir, sourceDir]) mkdirSync(path, { mode: 0o700 });
  const publicConfig = validateReleasePublicBuildConfig({
    configMode: 'standalone-synthetic',
    environment: {
      ZENDIO_GA_MEASUREMENT_ID: STANDALONE_SYNTHETIC_CONFIG.measurementId,
      ZENDIO_GA_TRANSPORT_MODE: STANDALONE_SYNTHETIC_CONFIG.transportMode,
      ZENDIO_GA_PROXY_ENDPOINT: STANDALONE_SYNTHETIC_CONFIG.proxyEndpoint
    }
  });
  const version = publicConfig.policy.sentry.release;
  const extensionManifest = `${JSON.stringify({
    name: 'fixture',
    version,
    browser_specific_settings: { gecko: { id: 'fixture@example.test' } }
  })}\n`;
  writeFileSync(join(distDir, 'manifest.json'), extensionManifest);
  writeFileSync(join(sourceDir, 'README.md'), '# source\n');
  const xpiPath = join(releaseDir, 'fixture.xpi');
  const sourceArchivePath = join(releaseDir, 'fixture-source.zip');
  writeFileSync(xpiPath, buildZipFixture([{ path: 'manifest.json', content: extensionManifest }]));
  writeFileSync(sourceArchivePath, buildZipFixture([{ path: 'README.md', content: '# source\n' }]));
  chmodSync(xpiPath, 0o600);
  chmodSync(sourceArchivePath, 0o600);
  const manifest = await createFirefoxReleaseArtifactManifest({
    releaseDir,
    distDir,
    xpiPath,
    sourceArchivePath,
    git: { head: 'a'.repeat(40), tree: 'b'.repeat(40) },
    packageMetadata: { version, manifestVersion: version, geckoId: 'fixture@example.test' },
    toolchain: {
      node: 'v20.20.2',
      npm: '10.8.2',
      webExt: '10.4.0',
      lockSha256: publicConfig.esbuild.lockSha256,
      esbuild: publicConfig.esbuild
    },
    gaConfig: {
      raw: publicConfig.rawValues,
      fingerprints: publicConfig.rawFingerprints,
      aggregateSha256: publicConfig.fingerprint
    },
    buildEnvironment: {
      policy: publicConfig.policy.id,
      policyDigest: publicConfig.policyDigest,
      defaults: publicConfig.policy,
      configMode: 'standalone-synthetic'
    }
  });
  const manifestPath = join(releaseDir, 'manifest.json');
  writeFileSync(manifestPath, canonicalArtifactJson(manifest), { mode: 0o600 });
  chmodSync(manifestPath, 0o600);
  return {
    binding: await verifyFirefoxReleaseArtifactManifest({
      manifestPath,
      transportMode: 'local-private-v1',
      expectedAttemptRoot: attemptRoot
    }),
    sourceArchivePath,
    xpiPath
  };
}

function storeLeafSpec(
  initialized: Awaited<ReturnType<typeof initializedStoreFixture>>,
  childSuccess: boolean
) {
  const leaf = resolveCommandProfile('fixture-v1', childSuccess ? ['success'] : ['exit', '7'], {
    environment: cleanEnvironment()
  });
  return {
    ...leaf,
    profileId: initialized.browser === 'chrome' ? 'chrome-publish-v1' : 'firefox-submit-v1',
    env: initialized.fixture.environment,
    argv:
      initialized.browser === 'firefox'
        ? [...leaf.argv, '--saved-upload-uuid-path', initialized.uuidPath]
        : leaf.argv,
    commandContext: {
      attemptRoot: initialized.fixture.attemptRoot,
      browser: initialized.browser,
      statePath: initialized.statePath,
      manifestPath: initialized.manifest,
      expectedManifestSha256: initialized.expectedManifestSha256
    }
  };
}

function pendingFirefoxStoreLeafSpec(
  initialized: Awaited<ReturnType<typeof initializedStoreFixture>>,
  delayMs = '700'
) {
  const leaf = resolveCommandProfile('fixture-v1', ['delay', delayMs], {
    environment: cleanEnvironment()
  });
  return {
    ...leaf,
    profileId: 'firefox-submit-v1',
    env: initialized.fixture.environment,
    argv: [...leaf.argv, '--saved-upload-uuid-path', initialized.uuidPath],
    commandContext: {
      attemptRoot: initialized.fixture.attemptRoot,
      browser: 'firefox',
      statePath: initialized.statePath,
      manifestPath: initialized.manifest,
      expectedManifestSha256: initialized.expectedManifestSha256
    }
  };
}

function spawnAfter(action: () => void, afterClose?: () => void): typeof spawn {
  const operation = (command: string, args: readonly string[], options: SpawnOptions) => {
    action();
    const child = spawn(command, args, options);
    if (afterClose) child.once('close', afterClose);
    return child;
  };
  return operation as typeof spawn;
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
    expect(
      Object.fromEntries(
        Object.entries(R03_CI_JOB_SEQUENCE_RESERVATIONS).map(([jobClass, rows]) => [
          jobClass,
          {
            owners: rows.map((row) => row.owner),
            totalMs: rows.reduce((total, row) => total + row.fullMs, 0),
            frozen: Object.isFrozen(rows) && rows.every((row) => Object.isFrozen(row))
          }
        ])
      )
    ).toEqual({
      'chrome-prepare-v1': {
        owners: [
          'github-ci-install-v1',
          'release-runtime-check-v1',
          'release-provenance-v1:prepare',
          'isolated-build-v1',
          'chrome-prepare-v1',
          'release-job-outputs-v1',
          'platform:upload-artifact-v1',
          'release-provenance-v1:artifact-id',
          'release-provenance-v1:artifact-digest',
          'runner-finalization-v1'
        ],
        totalMs: 2_960_000,
        frozen: true
      },
      'firefox-prepare-v1': {
        owners: [
          'github-ci-install-v1',
          'release-runtime-check-v1',
          'release-provenance-v1:prepare',
          'platform:playwright-host-deps-v1',
          'playwright-browser-install-v1',
          'isolated-build-v1',
          'firefox-prepare-v1',
          'release-job-outputs-v1',
          'firefox-verify-v1',
          'firefox-smoke-v1',
          'platform:upload-artifact-v1',
          'release-provenance-v1:artifact-id',
          'release-provenance-v1:artifact-digest',
          'runner-finalization-v1'
        ],
        totalMs: 5_320_000,
        frozen: true
      },
      'chrome-publish-v1': {
        owners: [
          'github-ci-install-v1',
          'platform:download-artifact-v1',
          'chrome-verify-v1',
          'release-provenance-v1:reauthorize',
          'release-state-init-v1',
          'chrome-publish-v1',
          'release-state-check-v1',
          'platform:upload-state-v1',
          'runner-finalization-v1'
        ],
        totalMs: 2_130_000,
        frozen: true
      },
      'firefox-submit-v1': {
        owners: [
          'github-ci-install-v1',
          'platform:download-artifact-v1',
          'firefox-verify-v1',
          'release-provenance-v1:reauthorize',
          'release-state-init-v1',
          'firefox-submit-v1',
          'release-state-check-v1',
          'platform:upload-state-v1',
          'runner-finalization-v1'
        ],
        totalMs: 4_290_000,
        frozen: true
      }
    });
    expect(Object.isFrozen(R03_CI_JOB_SEQUENCE_RESERVATIONS)).toBe(true);
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

  it('reserves each full ordered release-job sequence at the stamp boundary before install', () => {
    const cases = [
      {
        jobClass: 'chrome-prepare-v1',
        timeoutMinutes: 75,
        startCentiseconds: 300_000,
        create: () => prepareCiInstallFixture('chrome')
      },
      {
        jobClass: 'firefox-prepare-v1',
        timeoutMinutes: 120,
        startCentiseconds: 300_000,
        create: () => prepareCiInstallFixture('firefox')
      },
      {
        jobClass: 'chrome-publish-v1',
        timeoutMinutes: 60,
        startCentiseconds: 200_000,
        create: () => protectedCiInstallFixture('chrome')
      },
      {
        jobClass: 'firefox-submit-v1',
        timeoutMinutes: 90,
        startCentiseconds: 200_000,
        create: () => protectedCiInstallFixture('firefox')
      }
    ];

    for (const row of cases) {
      const reservedCentiseconds = R03_CI_JOB_SEQUENCE_RESERVATIONS[row.jobClass].reduce(
        (total, reservation) => total + reservation.fullMs / 10,
        0
      );
      const boundaryUptime =
        row.startCentiseconds + row.timeoutMinutes * 60 * 100 - reservedCentiseconds;
      const passing = row.create();
      expect(() =>
        resolveCommandProfile('github-ci-install-v1', [], {
          environment: passing.environment,
          operations: { ...passing.operations, readUptimeCentiseconds: () => boundaryUptime }
        })
      ).not.toThrow();

      const failing = row.create();
      expect(() =>
        resolveCommandProfile('github-ci-install-v1', [], {
          environment: failing.environment,
          operations: { ...failing.operations, readUptimeCentiseconds: () => boundaryUptime + 1 }
        })
      ).toThrow('CI_JOB_BUDGET_INVALID');
      expect(
        readdirSync(failing.runnerTemp).some(
          (name) => name.startsWith('zendio-') && !name.startsWith('zendio-command-start-')
        )
      ).toBe(false);
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
      expect(profile.commandContext).toMatchObject({
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

      expect(profile.commandContext).toMatchObject({
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

  it('recovers local post-install authority only from the exact empty owner npm configs', () => {
    const root = realpathSync(temporaryRoot());
    installAttemptConfigs(root);
    const environment = cleanEnvironment({
      NPM_CONFIG_USERCONFIG: join(root, 'install/npm-userconfig'),
      NPM_CONFIG_GLOBALCONFIG: join(root, 'install/npm-globalconfig')
    });
    delete environment.ZENDIO_LOCAL_ATTEMPT_ROOT;
    const profile = resolveCommandProfile('npm-tree-read-v1', ['ls', '--all'], { environment });
    expect(profile.commandContext).toEqual({ attemptRoot: root });
    expect(profile.env).toMatchObject({
      NPM_CONFIG_USERCONFIG: join(root, 'install/npm-userconfig'),
      NPM_CONFIG_GLOBALCONFIG: join(root, 'install/npm-globalconfig')
    });
    expect(() =>
      resolveCommandProfile('npm-tree-read-v1', ['ls', '--all'], {
        environment: { ...environment, npm_config_registry: 'https://example.invalid/' }
      })
    ).toThrow('NPM_CONFIG_AUTHORITY_INVALID');
    expect(() =>
      resolveCommandProfile('npm-tree-read-v1', ['ls', '--all'], {
        environment: {
          ...environment,
          NPM_CONFIG_USERCONFIG: environment.NPM_CONFIG_GLOBALCONFIG,
          NPM_CONFIG_GLOBALCONFIG: environment.NPM_CONFIG_USERCONFIG
        }
      })
    ).toThrow('NPM_CONFIG_AUTHORITY_INVALID');
  });

  it('blocks every root .env-prefixed entry before creating a CI attempt or invoking npm', () => {
    const fixture = ciInstallFixture('generic-v1', '30');
    const attemptRoot = join(
      fixture.runnerTemp,
      `zendio-ci-node-${fixture.environment.GITHUB_RUN_ID}-${fixture.environment.GITHUB_RUN_ATTEMPT}-${fixture.environment.GITHUB_JOB}`
    );
    expect(() =>
      resolveCommandProfile('github-ci-install-v1', [], {
        environment: fixture.environment,
        operations: { ...fixture.operations, readDirectoryOperation: () => ['.env.dangling'] }
      })
    ).toThrow('CI_ENV_FILE_FORBIDDEN');
    expect(existsSync(attemptRoot)).toBe(false);
  });

  it('routes active R03 fixed files through owned profiles and blocks generic bypasses', () => {
    const root = realpathSync(temporaryRoot());
    installAttemptConfigs(root);
    const environment = cleanEnvironment({ ZENDIO_LOCAL_ATTEMPT_ROOT: root });

    const prepareArguments = [
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
    ];
    const prepareProfile = resolveCommandProfile('chrome-prepare-v1', prepareArguments, {
      environment
    });
    expect(prepareProfile.executable).toBe(process.execPath);
    expect(prepareProfile.argv).toEqual([
      resolve('scripts/prepare-chrome-release.mjs'),
      ...prepareArguments
    ]);
    expect(() =>
      parseManagedCommandInvocationArgv([
        'node',
        'scripts/run-bounded-command.mjs',
        '--profile',
        'chrome-prepare-v1',
        '--',
        ...prepareArguments
      ])
    ).not.toThrow();

    for (const path of [
      'scripts/prepare-chrome-release.mjs',
      'scripts/submit-firefox-amo-release.mjs',
      'scripts/utils/releaseCiProvenance.mjs',
      'scripts/utils/releaseArtifactManifest.mjs',
      'scripts/package.mjs',
      'scripts/package-firefox.mjs',
      'tools/report-chrome-webstore-release-workflow.mjs',
      'tools/report-firefox-amo-release-workflow.mjs'
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

    for (const name of [
      'audit:chrome-webstore-release:check',
      'audit:firefox-amo-release:report',
      'audit:firefox-amo-release:check'
    ]) {
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

  it('admits only exact contained release-audit forwarded argument grammars', () => {
    const root = realpathSync(temporaryRoot());
    installAttemptConfigs(root);
    const dist = join(root, 'dist');
    const archive = join(root, 'release.zip');
    const environment = cleanEnvironment({ ZENDIO_LOCAL_ATTEMPT_ROOT: root });
    const names = [
      'audit:release-surface:report',
      'audit:ga:client-secret',
      'audit:ga:release-surface'
    ];
    for (const name of names) {
      for (const forwarded of [
        ['--dist', dist],
        ['--dist', dist, '--archive', archive]
      ]) {
        expect(() =>
          resolveCommandProfile('npm-script-standard-v1', [name, '--', ...forwarded], {
            environment
          })
        ).not.toThrow();
      }
    }

    for (const args of [
      ['audit:release-surface:report', '--', '--archive', archive, '--dist', dist],
      ['audit:ga:client-secret', '--', '--dist', dist, '--archive', archive, '--extra'],
      ['audit:ga:release-surface', '--', '--dist', 'dist'],
      ['audit:ga:docs', '--', '--dist', dist],
      ['audit:release-surface:report', '--', '--dist', dist, '--archive', dist]
    ]) {
      expect(() =>
        resolveCommandProfile('npm-script-standard-v1', args, { environment })
      ).toThrow();
    }
    expect(() =>
      resolveCommandProfile(
        'npm-script-standard-v1',
        ['audit:ga:client-secret', '--', '--dist', join(realpathSync(temporaryRoot()), 'dist')],
        { environment }
      )
    ).toThrow('RELEASE_PATH_OUTSIDE_ATTEMPT');
  });

  it('propagates and revalidates the post-install npm-config authority for every R03 local leaf', () => {
    const root = realpathSync(temporaryRoot());
    installAttemptConfigs(root);
    const configs = {
      userconfig: join(root, 'install/npm-userconfig'),
      globalconfig: join(root, 'install/npm-globalconfig')
    };
    const environment = cleanEnvironment({
      NPM_CONFIG_USERCONFIG: configs.userconfig,
      NPM_CONFIG_GLOBALCONFIG: configs.globalconfig
    });
    const rows: Array<[CommandBoundaryProfileId, string[]]> = [
      [
        'npm-audit-context-v1',
        ['--verify-baseline-context', '--baseline-manifest', join(root, 'audit.json')]
      ],
      ['npm-script-quick-v1', ['audit:ci-workflow:check']],
      ['npm-script-standard-v1', ['typecheck:strict']],
      ['npm-script-standard-v1', ['lint', '--', '--quiet']],
      ['npm-script-build-v1', ['build:fast']],
      [
        'vitest-v1',
        ['run', '--config', 'vitest.unit.config.ts', 'tests/unit/scripts/boundedCommand.test.ts']
      ],
      ['stylelint-v1', ['src/options/**/*.css']],
      ['node-script-standard-v1', ['scripts/verify-runtime.mjs']]
    ];
    for (const [profileId, args] of rows) {
      const spec = resolveCommandProfile(profileId, args, { environment });
      expect(spec.env).toMatchObject({
        NPM_CONFIG_USERCONFIG: configs.userconfig,
        NPM_CONFIG_GLOBALCONFIG: configs.globalconfig
      });
      expect(spec.commandContext).toMatchObject({
        attemptConfigAuthority: true,
        attemptRoot: root,
        userconfig: configs.userconfig,
        globalconfig: configs.globalconfig
      });
    }

    for (const mutation of [
      { NPM_CONFIG_USERCONFIG: configs.globalconfig },
      { npm_config_userconfig: configs.userconfig },
      { npm_config_registry: 'https://registry.invalid' },
      { NPM_CONFIG_GLOBALCONFIG: undefined }
    ]) {
      expect(() =>
        resolveCommandProfile('npm-script-quick-v1', ['audit:ci-workflow:check'], {
          environment: { ...environment, ...mutation }
        })
      ).toThrow('NPM_CONFIG_AUTHORITY_INVALID');
    }

    const spec = resolveCommandProfile('npm-script-quick-v1', ['audit:ci-workflow:check'], {
      environment
    });
    writeFileSync(configs.userconfig, 'late-poison');
    expect(() =>
      startBoundedCommand(
        { profileId: 'npm-script-quick-v1', arguments: ['audit:ci-workflow:check'] },
        { resolveProfile: () => spec }
      )
    ).toThrow('NPM_CONFIG_IDENTITY_INVALID');
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
      env: fixture.environment,
      commandContext: {
        attemptRoot: fixture.attemptRoot,
        browser: 'chrome',
        statePath,
        manifestPath: manifest,
        expectedManifestSha256
      }
    };
    await expect(
      startBoundedCommand(
        { profileId: 'chrome-publish-v1', arguments: [] },
        {
          resolveProfile: () => storeLeaf,
          spawnOperation: spawnAfter(() => {
            writeStoreTerminalState(statePath, {
              outcome: 'success',
              started: 'publish',
              completed: 'publish'
            });
          })
        }
      ).completion
    ).resolves.toMatchObject({ ok: true });
    await expect(
      runBoundedCommand(
        { profileId: 'release-state-check-v1', arguments: ['--browser', 'chrome'] },
        { environment: fixture.environment }
      )
    ).resolves.toMatchObject({ ok: true });
    for (const commandContext of [
      { ...storeLeaf.commandContext, manifestPath: join(fixture.attemptRoot, 'other.json') },
      { ...storeLeaf.commandContext, expectedManifestSha256: '0'.repeat(64) }
    ]) {
      expect(() =>
        startBoundedCommand(
          { profileId: 'chrome-publish-v1', arguments: [] },
          { resolveProfile: () => ({ ...storeLeaf, commandContext }) }
        )
      ).toThrow();
    }
    writeFileSync(manifest, 'tampered-after-state-init');
    expect(() =>
      startBoundedCommand(
        { profileId: 'chrome-publish-v1', arguments: [] },
        { resolveProfile: () => storeLeaf }
      )
    ).toThrow('ARTIFACT_RECEIPT_MANIFEST_INVALID');

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

  it('rejects verifier swap/restore, parent symlinks, stale identity, and rebound state tampering', async () => {
    const leaf = resolveCommandProfile('fixture-v1', ['delay', '80'], {
      environment: cleanEnvironment()
    });
    const swapped = releaseAttemptFixture('chrome', 'publish');
    const swappedParent = join(swapped.attemptRoot, 'download');
    mkdirSync(swappedParent, { mode: 0o700 });
    const swappedManifest = join(swappedParent, 'manifest.json');
    const replacement = join(swappedParent, 'replacement.json');
    const held = join(swappedParent, 'held.json');
    writeFileSync(swappedManifest, 'stable-manifest', { mode: 0o600 });
    writeFileSync(replacement, 'stable-manifest', { mode: 0o600 });
    const swappedDigest = sha256(swappedManifest);
    const pending = runBoundedCommand(
      { profileId: 'chrome-verify-v1', arguments: [] },
      {
        environment: swapped.environment,
        resolveProfile: () => ({
          ...leaf,
          profileId: 'chrome-verify-v1',
          env: swapped.environment,
          commandContext: {
            attemptRoot: swapped.attemptRoot,
            browser: 'chrome',
            transport: 'github-artifact-v1',
            manifestPath: swappedManifest,
            expectedManifestSha256: swappedDigest
          }
        })
      }
    );
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    renameSync(swappedManifest, held);
    renameSync(replacement, swappedManifest);
    renameSync(swappedManifest, replacement);
    renameSync(held, swappedManifest);
    await expect(pending).resolves.toMatchObject({
      ok: false,
      terminalReason: 'RELEASE_MANIFEST_CHANGED'
    });

    const linked = releaseAttemptFixture('chrome', 'publish');
    const foreign = realpathSync(temporaryRoot());
    const foreignManifest = join(foreign, 'manifest.json');
    writeFileSync(foreignManifest, 'linked-manifest', { mode: 0o600 });
    symlinkSync(foreign, join(linked.attemptRoot, 'download'));
    await expect(
      runBoundedCommand(
        { profileId: 'chrome-verify-v1', arguments: [] },
        {
          environment: linked.environment,
          resolveProfile: () => ({
            ...leaf,
            profileId: 'chrome-verify-v1',
            env: linked.environment,
            commandContext: {
              attemptRoot: linked.attemptRoot,
              browser: 'chrome',
              transport: 'github-artifact-v1',
              manifestPath: join(linked.attemptRoot, 'download/manifest.json'),
              expectedManifestSha256: sha256(foreignManifest)
            }
          })
        }
      )
    ).rejects.toThrow('RELEASE_PATH_PARENT_INVALID');

    async function initializedFixture() {
      const fixture = releaseAttemptFixture('chrome', 'publish');
      const manifest = join(fixture.attemptRoot, 'manifest.json');
      writeFileSync(manifest, 'bound-manifest', { mode: 0o600 });
      const expectedManifestSha256 = sha256(manifest);
      const verification = await runBoundedCommand(
        { profileId: 'chrome-verify-v1', arguments: [] },
        {
          environment: fixture.environment,
          resolveProfile: () => ({
            ...resolveCommandProfile('fixture-v1', ['success'], {
              environment: cleanEnvironment()
            }),
            profileId: 'chrome-verify-v1',
            env: fixture.environment,
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
      if (!verification.ok) throw new Error('TEST_VERIFICATION_FAILED');
      const initialized = await runBoundedCommand(
        { profileId: 'release-state-init-v1', arguments: ['--browser', 'chrome'] },
        { environment: fixture.environment }
      );
      if (!initialized.ok) throw new Error('TEST_STATE_INIT_FAILED');
      return { fixture, manifest };
    }

    const stale = await initializedFixture();
    rewriteCanonicalOwnedJson(
      join(stale.fixture.attemptRoot, 'receipts/chrome-artifact-verification.json'),
      (value) => {
        value.releaseSha = '0'.repeat(40);
      }
    );
    await expect(
      runBoundedCommand(
        { profileId: 'release-state-check-v1', arguments: ['--browser', 'chrome'] },
        { environment: stale.fixture.environment }
      )
    ).resolves.toMatchObject({ ok: false, terminalReason: 'ARTIFACT_RECEIPT_INVALID' });

    const tampered = await initializedFixture();
    const statePath = join(tampered.fixture.attemptRoot, 'store-state/chrome/publish-state.json');
    const bindingPath = join(tampered.fixture.attemptRoot, 'receipts/chrome-state-binding.json');
    rewriteCanonicalOwnedJson(statePath, (value) => {
      value.stage = 'tampered';
    });
    rewriteCanonicalOwnedJson(bindingPath, (value) => {
      value.stateSha256 = sha256(statePath);
      value.stateSize = String(lstatSync(statePath).size);
    });
    await expect(
      runBoundedCommand(
        { profileId: 'release-state-check-v1', arguments: ['--browser', 'chrome'] },
        { environment: tampered.fixture.environment }
      )
    ).resolves.toMatchObject({ ok: false, terminalReason: 'RELEASE_STATE_TERMINAL_INVALID' });
  });

  it('reseals every legal Chrome and Firefox terminal action prefix before completion is visible', async () => {
    const terminalCases: Array<{
      browser: 'chrome' | 'firefox';
      childSuccess: boolean;
      terminal: Parameters<typeof writeStoreTerminalState>[1];
    }> = [
      {
        browser: 'chrome',
        childSuccess: false,
        terminal: { outcome: 'pre-mutation-failure' }
      },
      {
        browser: 'chrome',
        childSuccess: false,
        terminal: { outcome: 'unknown-submission-state', started: 'upload' }
      },
      {
        browser: 'chrome',
        childSuccess: false,
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload'
        }
      },
      {
        browser: 'chrome',
        childSuccess: false,
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'publish',
          completed: 'upload'
        }
      },
      {
        browser: 'chrome',
        childSuccess: false,
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'publish',
          completed: 'publish'
        }
      },
      {
        browser: 'chrome',
        childSuccess: true,
        terminal: { outcome: 'success', started: 'publish', completed: 'publish' }
      },
      {
        browser: 'firefox',
        childSuccess: false,
        terminal: { outcome: 'pre-mutation-failure' }
      },
      {
        browser: 'firefox',
        childSuccess: false,
        terminal: { outcome: 'unknown-submission-state', started: 'upload' }
      },
      {
        browser: 'firefox',
        childSuccess: false,
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload'
        }
      },
      {
        browser: 'firefox',
        childSuccess: false,
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'version-submit',
          completed: 'upload'
        }
      },
      {
        browser: 'firefox',
        childSuccess: false,
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'version-submit',
          completed: 'version-submit'
        }
      },
      {
        browser: 'firefox',
        childSuccess: false,
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'source-patch',
          completed: 'version-submit'
        }
      },
      {
        browser: 'firefox',
        childSuccess: false,
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'source-patch',
          completed: 'source-patch'
        }
      },
      {
        browser: 'firefox',
        childSuccess: true,
        terminal: {
          outcome: 'success',
          started: 'source-patch',
          completed: 'source-patch'
        }
      }
    ];

    for (const row of terminalCases) {
      const initialized = await initializedStoreFixture(row.browser);
      const beforeBinding = bindingAuthorityFields(initialized.bindingPath);
      const spec = storeLeafSpec(initialized, row.childSuccess);
      const result = await startBoundedCommand(
        { profileId: spec.profileId, arguments: [] },
        {
          resolveProfile: () => spec,
          spawnOperation: spawnAfter(() => {
            writeStoreTerminalState(initialized.statePath, row.terminal);
          })
        }
      ).completion;
      expect(result, JSON.stringify(row)).toMatchObject({ ok: row.childSuccess });
      const bindingBeforeCheck = readFileSync(initialized.bindingPath);
      const checked = await runBoundedCommand(
        { profileId: 'release-state-check-v1', arguments: ['--browser', row.browser] },
        { environment: initialized.fixture.environment }
      );
      expect(checked.ok).toBe(true);
      expect(readFileSync(initialized.bindingPath)).toEqual(bindingBeforeCheck);
      const afterBinding = readFileSync(initialized.bindingPath, 'utf8');
      expect(bindingAuthorityFields(initialized.bindingPath)).toBe(beforeBinding);
      expect(afterBinding).toContain(`"stateSha256":"${sha256(initialized.statePath)}"`);
    }
  });

  it('enforces closed browser-specific store identity and exact listed/unlisted terminal evidence', async () => {
    const invalidRows: Array<{
      browser: 'chrome' | 'firefox';
      mutate: (value: Record<string, RequestValue>) => void;
    }> = [
      { browser: 'chrome', mutate: (value) => delete value.archiveSha256 },
      { browser: 'chrome', mutate: (value) => (value.WEB_EXT_API_SECRET = 'forbidden') },
      { browser: 'firefox', mutate: (value) => (value.itemId = 'cross-browser') },
      { browser: 'firefox', mutate: (value) => (value.terminalResult = 'unlisted') }
    ];
    for (const row of invalidRows) {
      const initialized = await initializedStoreFixture(row.browser);
      const spec = storeLeafSpec(initialized, true);
      const result = await startBoundedCommand(
        { profileId: spec.profileId, arguments: [] },
        {
          resolveProfile: () => spec,
          spawnOperation: spawnAfter(() => {
            writeStoreTerminalState(initialized.statePath, {
              outcome: 'success',
              started: row.browser === 'chrome' ? 'publish' : 'source-patch',
              completed: row.browser === 'chrome' ? 'publish' : 'source-patch'
            });
            rewriteCanonicalOwnedJson(initialized.statePath, row.mutate);
          })
        }
      ).completion;
      expect(result.ok, row.browser).toBe(false);
    }

    const unlisted = await initializedStoreFixture('firefox');
    const unlistedSpec = storeLeafSpec(unlisted, true);
    const unlistedResult = await startBoundedCommand(
      { profileId: unlistedSpec.profileId, arguments: [] },
      {
        resolveProfile: () => unlistedSpec,
        spawnOperation: spawnAfter(() => {
          writeStoreTerminalState(unlisted.statePath, {
            outcome: 'success',
            started: 'source-patch',
            completed: 'source-patch',
            channel: 'unlisted',
            signedXpiSha256: 'f'.repeat(64)
          });
        })
      }
    ).completion;
    expect(unlistedResult.ok).toBe(true);
    expect(JSON.parse(readFileSync(unlisted.statePath, 'utf8'))).toMatchObject({
      channel: 'unlisted',
      terminalResult: 'unlisted',
      signedXpiSha256: 'f'.repeat(64)
    });
  });

  it.each(UUID_FAILURE_MODES)(
    'accepts real adapter upload-completed unknown evidence after UUID %s failure',
    async (failureMode) => {
      const initialized = await initializedStoreFixture('firefox');
      const artifact = await createFirefoxSubmissionBinding(initialized.fixture.attemptRoot);
      const spec = pendingFirefoxStoreLeafSpec(initialized);
      const handle = startBoundedCommand(
        { profileId: 'firefox-submit-v1', arguments: [] },
        { resolveProfile: () => spec }
      );
      const events: string[] = [];
      const metadata = Object.freeze({ channel: 'listed', id: artifact.binding.geckoId });
      const mutationJournal = {
        beforeMutation: vi.fn((operation: FirefoxMutation): Promise<void> => {
          events.push(`before:${operation}`);
          rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
            value.channel = 'listed';
            value.geckoId = artifact.binding.geckoId;
            value.xpiSha256 = sha256(artifact.xpiPath);
            value.sourceArchiveSha256 = sha256(artifact.sourceArchivePath);
            value.lastStartedOperation = operation;
            value.stage = `${operation}-started`;
          });
          return Promise.resolve();
        }),
        afterMutation: vi.fn((operation: FirefoxMutation): Promise<void> => {
          events.push(`after:${operation}`);
          rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
            value.lastCompletedOperation = operation;
            value.stage = `${operation}-completed`;
          });
          return Promise.resolve();
        }),
        mutationInvoked: vi.fn((operation: FirefoxMutation): Promise<void> => {
          events.push(`invoked:${operation}`);
          rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
            value.outcome = 'unknown-submission-state';
            value.mutationInvoked = true;
            value.retrySafe = false;
            value.errorCode = 'UNKNOWN_SUBMISSION_STATE';
            value.recovery = 'reconcile';
          });
          return Promise.resolve();
        })
      };
      const uuidParent = dirname(initialized.uuidPath);
      const fetchMock = vi.fn((url: URL, init?: RequestInit): Promise<Response> => {
        const method = init?.method ?? 'GET';
        if (method === 'POST' && url.pathname.endsWith('/addons/upload/')) {
          events.push('request:upload');
          return Promise.resolve(
            new Response(JSON.stringify({ uuid: 'upload-uuid' }), { status: 200 })
          );
        }
        if (method === 'GET' && url.pathname.endsWith('/addons/upload/upload-uuid/')) {
          events.push('request:validation');
          if (failureMode === 'pre-publication') chmodSync(uuidParent, 0o500);
          if (failureMode === 'malformed')
            return Promise.resolve(new Response('{', { status: 200 }));
          return Promise.resolve(
            new Response(
              JSON.stringify({
                processed: failureMode !== 'timeout',
                valid: failureMode !== 'timeout',
                uuid: failureMode === 'mismatch' ? 'different-uuid' : 'upload-uuid',
                validation: { errors: 0 }
              }),
              { status: 200 }
            )
          );
        }
        throw new Error(`unexpected:${method}:${url.href}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      if (failureMode === 'timeout') vi.useFakeTimers();
      const submission = submitVerifiedFirefoxXpi({
        binding: artifact.binding,
        transportMode: 'local-private-v1',
        channel: 'listed',
        id: artifact.binding.geckoId,
        amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
        submissionSource: artifact.sourceArchivePath,
        savedUploadUuidPath: initialized.uuidPath,
        downloadDir: join(dirname(initialized.statePath), 'downloads'),
        credentials: { apiKey: 'key', apiSecret: 'secret' },
        mutationJournal
      });
      const rejection = expect(submission).rejects.toMatchObject({
        code: 'unknown-submission-state',
        retrySafe: false
      });
      if (failureMode === 'timeout') {
        await vi.waitFor(() => expect(events).toContain('request:validation'));
        await vi.advanceTimersByTimeAsync(FIREFOX_SUBMISSION_LIMITS.validationTotalMs);
      }
      await rejection;
      if (failureMode === 'timeout') vi.useRealTimers();
      chmodSync(uuidParent, 0o700);
      expect(events.slice(0, 5)).toEqual([
        'before:upload',
        'request:upload',
        'invoked:upload',
        'after:upload',
        'request:validation'
      ]);
      expect(events.filter((event) => event === 'request:validation')).toHaveLength(
        failureMode === 'timeout' ? FIREFOX_SUBMISSION_LIMITS.validationAttempts : 1
      );
      expect(events.filter((event) => event.startsWith('before:'))).toEqual(['before:upload']);
      expect(metadata).toEqual({ channel: 'listed', id: artifact.binding.geckoId });
      expect(existsSync(initialized.uuidPath)).toBe(false);
      expect(handle.cancel('cancelled')).toBe(true);
      await expect(handle.completion).resolves.toMatchObject({
        ok: false,
        terminalReason: 'cancelled'
      });
      await expect(
        runBoundedCommand(
          { profileId: 'release-state-check-v1', arguments: ['--browser', 'firefox'] },
          { environment: initialized.fixture.environment }
        )
      ).resolves.toMatchObject({ ok: true, terminalReason: 'success' });
    }
  );

  it.each(UUID_OPTIONAL_EVIDENCE)(
    'accepts upload-completed unknown state with %s correlated UUID evidence',
    async (uuidEvidence) => {
      const initialized = await initializedStoreFixture('firefox');
      const spec = storeLeafSpec(initialized, false);
      const result = await startBoundedCommand(
        { profileId: spec.profileId, arguments: [] },
        {
          resolveProfile: () => spec,
          spawnOperation: spawnAfter(() => {
            writeStoreTerminalState(initialized.statePath, {
              outcome: 'unknown-submission-state',
              started: 'upload',
              completed: 'upload',
              uuidEvidence
            });
          })
        }
      ).completion;
      expect(result).toMatchObject({ ok: false, terminalReason: 'nonzero' });
      expect(existsSync(initialized.uuidPath)).toBe(uuidEvidence === 'present');
      await expect(
        runBoundedCommand(
          { profileId: 'release-state-check-v1', arguments: ['--browser', 'firefox'] },
          { environment: initialized.fixture.environment }
        )
      ).resolves.toMatchObject({ ok: true });
    }
  );

  it.each(FIREFOX_CHANNELS)(
    'reseals real adapter %s success only with matching durable UUID and terminal evidence',
    async (channel) => {
      const initialized = await initializedStoreFixture('firefox');
      const artifact = await createFirefoxSubmissionBinding(initialized.fixture.attemptRoot);
      const spec = pendingFirefoxStoreLeafSpec(initialized, '500');
      const handle = startBoundedCommand(
        { profileId: 'firefox-submit-v1', arguments: [] },
        { resolveProfile: () => spec }
      );
      const events: string[] = [];
      const mutationJournal = {
        beforeMutation: vi.fn((operation: FirefoxMutation): Promise<void> => {
          events.push(`before:${operation}`);
          rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
            value.channel = channel;
            value.geckoId = artifact.binding.geckoId;
            value.xpiSha256 = sha256(artifact.xpiPath);
            value.sourceArchiveSha256 = sha256(artifact.sourceArchivePath);
            if (operation !== 'upload') value.uploadUuidSha256 = sha256(initialized.uuidPath);
            value.lastStartedOperation = operation;
            value.stage = `${operation}-started`;
          });
          return Promise.resolve();
        }),
        afterMutation: vi.fn((operation: FirefoxMutation): Promise<void> => {
          events.push(`after:${operation}`);
          rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
            value.lastCompletedOperation = operation;
            value.stage = `${operation}-completed`;
          });
          return Promise.resolve();
        }),
        mutationInvoked: vi.fn((operation: FirefoxMutation): Promise<void> => {
          events.push(`invoked:${operation}`);
          rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
            value.outcome = 'unknown-submission-state';
            value.mutationInvoked = true;
            value.retrySafe = false;
            value.errorCode = 'UNKNOWN_SUBMISSION_STATE';
            value.recovery = 'reconcile';
          });
          return Promise.resolve();
        })
      };
      const signedBytes = readFileSync(artifact.xpiPath);
      const signedDigest = createHash('sha256').update(signedBytes).digest('hex');
      const fetchMock = vi.fn((url: URL, init?: RequestInit): Promise<Response> => {
        const method = init?.method ?? 'GET';
        if (method === 'POST' && url.pathname.endsWith('/addons/upload/')) {
          events.push('request:upload');
          return Promise.resolve(
            new Response(JSON.stringify({ uuid: 'upload-uuid' }), { status: 200 })
          );
        }
        if (method === 'GET' && url.pathname.endsWith('/addons/upload/upload-uuid/')) {
          events.push('request:validation');
          return Promise.resolve(
            new Response(
              JSON.stringify({
                processed: true,
                valid: true,
                uuid: 'upload-uuid',
                validation: { errors: 0 }
              }),
              { status: 200 }
            )
          );
        }
        if (method === 'PUT') {
          events.push('request:version-submit');
          return Promise.resolve(
            new Response(
              JSON.stringify({ version: { id: 42, edit_url: 'https://example.test/edit' } }),
              { status: 200 }
            )
          );
        }
        if (method === 'PATCH') {
          events.push('request:source-patch');
          return Promise.resolve(new Response('{}', { status: 200 }));
        }
        if (method === 'GET' && url.pathname.endsWith('/versions/42/')) {
          events.push('request:approval');
          return Promise.resolve(
            new Response(
              JSON.stringify({
                file: {
                  status: 'public',
                  url: 'https://addons.mozilla.org/api/v5/file/7/signed.xpi'
                }
              }),
              { status: 200 }
            )
          );
        }
        if (method === 'GET' && url.pathname === '/api/v5/file/7/signed.xpi') {
          events.push('request:signed-xpi');
          return Promise.resolve(new Response(signedBytes, { status: 200 }));
        }
        throw new Error(`unexpected:${method}:${url.href}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        submitVerifiedFirefoxXpi({
          binding: artifact.binding,
          transportMode: 'local-private-v1',
          channel,
          id: artifact.binding.geckoId,
          amoBaseUrl: FIREFOX_AMO_API_BASE_URL,
          submissionSource: artifact.sourceArchivePath,
          savedUploadUuidPath: initialized.uuidPath,
          downloadDir: join(dirname(initialized.statePath), 'downloads'),
          credentials: { apiKey: 'key', apiSecret: 'secret' },
          mutationJournal
        })
      ).resolves.toEqual(
        channel === 'listed'
          ? { id: artifact.binding.geckoId }
          : {
              id: artifact.binding.geckoId,
              downloadedFiles: ['signed.xpi'],
              signedXpiSha256: signedDigest
            }
      );
      rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
        value.outcome = 'success';
        value.errorCode = null;
        value.recovery = 'none';
        value.terminalResult = channel;
        value.signedXpiSha256 = channel === 'unlisted' ? signedDigest : null;
      });
      await expect(handle.completion).resolves.toMatchObject({
        ok: true,
        terminalReason: 'success'
      });
      expect(events.slice(0, 13)).toEqual([
        'before:upload',
        'request:upload',
        'invoked:upload',
        'after:upload',
        'request:validation',
        'before:version-submit',
        'request:version-submit',
        'invoked:version-submit',
        'after:version-submit',
        'before:source-patch',
        'request:source-patch',
        'invoked:source-patch',
        'after:source-patch'
      ]);
      await expect(
        runBoundedCommand(
          { profileId: 'release-state-check-v1', arguments: ['--browser', 'firefox'] },
          { environment: initialized.fixture.environment }
        )
      ).resolves.toMatchObject({ ok: true });
    }
  );

  it('rejects every UUID state/file correlation mismatch and any later prefix without evidence', async () => {
    const rows: Array<{
      name: string;
      terminal: Parameters<typeof writeStoreTerminalState>[1];
      mutate?: (initialized: Awaited<ReturnType<typeof initializedStoreFixture>>) => void;
      childSuccess?: boolean;
    }> = [
      {
        name: 'upload-started-present',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          uuidEvidence: 'present'
        }
      },
      {
        name: 'upload-completed-null-present',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload',
          uuidEvidence: 'absent'
        },
        mutate: (initialized) => publishFirefoxUuidEvidence(initialized.statePath)
      },
      {
        name: 'upload-completed-digest-absent',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload'
        },
        mutate: (initialized) => rmSync(initialized.uuidPath)
      },
      {
        name: 'wrong-digest',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload'
        },
        mutate: (initialized) =>
          rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
            value.uploadUuidSha256 = '0'.repeat(64);
          })
      },
      {
        name: 'wrong-channel',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload'
        },
        mutate: (initialized) => {
          const bytes = canonicalJsonBytes({
            channel: 'unlisted',
            uploadUuid: 'upload-uuid',
            xpiCrcHash: 'e'.repeat(64)
          });
          writeFileSync(initialized.uuidPath, bytes);
          chmodSync(initialized.uuidPath, 0o600);
          rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
            value.uploadUuidSha256 = createHash('sha256').update(bytes).digest('hex');
          });
        }
      },
      {
        name: 'noncanonical-evidence',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload'
        },
        mutate: (initialized) => {
          const bytes = Buffer.from(
            `${JSON.stringify({ channel: 'listed', uploadUuid: 'upload-uuid', xpiCrcHash: 'e'.repeat(64) })}\n`
          );
          writeFileSync(initialized.uuidPath, bytes);
          chmodSync(initialized.uuidPath, 0o600);
          rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
            value.uploadUuidSha256 = createHash('sha256').update(bytes).digest('hex');
          });
        }
      },
      {
        name: 'extra-secret-field',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload'
        },
        mutate: (initialized) => {
          const bytes = canonicalJsonBytes({
            apiSecret: 'forbidden',
            channel: 'listed',
            uploadUuid: 'upload-uuid',
            xpiCrcHash: 'e'.repeat(64)
          });
          writeFileSync(initialized.uuidPath, bytes);
          chmodSync(initialized.uuidPath, 0o600);
          rewriteCanonicalOwnedJson(initialized.statePath, (value) => {
            value.uploadUuidSha256 = createHash('sha256').update(bytes).digest('hex');
          });
        }
      },
      {
        name: 'wrong-mode',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload'
        },
        mutate: (initialized) => chmodSync(initialized.uuidPath, 0o644)
      },
      {
        name: 'linked-evidence',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload'
        },
        mutate: (initialized) => linkSync(initialized.uuidPath, `${initialized.uuidPath}.alias`)
      },
      {
        name: 'symlink-replacement',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'upload'
        },
        mutate: (initialized) => {
          const target = `${initialized.uuidPath}.replacement`;
          writeFileSync(target, readFileSync(initialized.uuidPath), { mode: 0o600 });
          rmSync(initialized.uuidPath);
          symlinkSync(target, initialized.uuidPath);
        }
      },
      {
        name: 'version-started-without-evidence',
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'version-submit',
          completed: 'upload',
          uuidEvidence: 'absent'
        }
      },
      {
        name: 'success-without-evidence',
        terminal: {
          outcome: 'success',
          started: 'source-patch',
          completed: 'source-patch',
          uuidEvidence: 'absent'
        },
        childSuccess: true
      }
    ];

    for (const row of rows) {
      const initialized = await initializedStoreFixture('firefox');
      const spec = storeLeafSpec(initialized, row.childSuccess ?? false);
      const result = await startBoundedCommand(
        { profileId: spec.profileId, arguments: [] },
        {
          resolveProfile: () => spec,
          spawnOperation: spawnAfter(() => {
            writeStoreTerminalState(initialized.statePath, row.terminal);
            row.mutate?.(initialized);
          })
        }
      ).completion;
      expect(result.ok, row.name).toBe(false);
      expect(result.terminalReason, row.name).toMatch(/UUID|RELEASE_JSON/u);
    }

    const preflight = await initializedStoreFixture('firefox');
    const published = publishFirefoxUuidEvidence(preflight.statePath);
    rewriteCanonicalOwnedJson(preflight.statePath, (value) => {
      value.uploadUuidSha256 = published.sha256;
    });
    await expect(
      runBoundedCommand(
        { profileId: 'release-state-check-v1', arguments: ['--browser', 'firefox'] },
        { environment: preflight.fixture.environment }
      )
    ).resolves.toMatchObject({ ok: false, terminalReason: 'FIREFOX_UUID_EVIDENCE_INVALID' });
  });

  it.each(UUID_RACES)(
    'release-state-check rejects UUID %s after binding publication',
    async (race) => {
      const initialized = await initializedStoreFixture('firefox');
      const uuidEvidence = race === 'appearance' ? 'absent' : 'present';
      const spec = storeLeafSpec(initialized, false);
      const result = await startBoundedCommand(
        { profileId: spec.profileId, arguments: [] },
        {
          resolveProfile: () => spec,
          spawnOperation: spawnAfter(() => {
            writeStoreTerminalState(initialized.statePath, {
              outcome: 'unknown-submission-state',
              started: 'upload',
              completed: 'upload',
              uuidEvidence
            });
          })
        }
      ).completion;
      expect(result).toMatchObject({ ok: false, terminalReason: 'nonzero' });

      if (race === 'appearance') publishFirefoxUuidEvidence(initialized.statePath);
      else if (race === 'disappearance') rmSync(initialized.uuidPath);
      else if (race === 'replacement') {
        const bytes = canonicalJsonBytes({
          channel: 'listed',
          uploadUuid: 'replacement-uuid',
          xpiCrcHash: 'e'.repeat(64)
        });
        writeFileSync(initialized.uuidPath, bytes);
        chmodSync(initialized.uuidPath, 0o600);
      } else {
        writeFileSync(initialized.uuidPath, '{}\n');
        chmodSync(initialized.uuidPath, 0o600);
      }

      await expect(
        runBoundedCommand(
          { profileId: 'release-state-check-v1', arguments: ['--browser', 'firefox'] },
          { environment: initialized.fixture.environment }
        )
      ).resolves.toMatchObject({ ok: false });
    }
  );

  it.each(UUID_RACES)('binding reseal rejects close-boundary UUID %s races', async (race) => {
    const initialized = await initializedStoreFixture('firefox');
    const uuidEvidence = race === 'appearance' ? 'absent' : 'present';
    const spec = storeLeafSpec(initialized, false);
    const result = await startBoundedCommand(
      { profileId: spec.profileId, arguments: [] },
      {
        resolveProfile: () => spec,
        spawnOperation: spawnAfter(
          () => {
            writeStoreTerminalState(initialized.statePath, {
              outcome: 'unknown-submission-state',
              started: 'upload',
              completed: 'upload',
              uuidEvidence
            });
          },
          () => {
            if (race === 'appearance') publishFirefoxUuidEvidence(initialized.statePath);
            else if (race === 'disappearance') rmSync(initialized.uuidPath);
            else if (race === 'replacement') {
              const bytes = canonicalJsonBytes({
                channel: 'listed',
                uploadUuid: 'replacement-uuid',
                xpiCrcHash: 'e'.repeat(64)
              });
              writeFileSync(initialized.uuidPath, bytes);
              chmodSync(initialized.uuidPath, 0o600);
            } else {
              writeFileSync(initialized.uuidPath, '{}\n');
              chmodSync(initialized.uuidPath, 0o600);
            }
          }
        )
      }
    ).completion;
    expect(result.ok).toBe(false);
    expect(result.terminalReason).toMatch(/UUID|RELEASE_JSON/u);
  });

  it('rejects unrefreshed, reordered, cross-browser, result-mismatched, and CAS-drift states', async () => {
    const invalidCases: Array<{
      browser: 'chrome' | 'firefox';
      childSuccess: boolean;
      terminal?: Parameters<typeof writeStoreTerminalState>[1];
    }> = [
      {
        browser: 'chrome',
        childSuccess: false,
        terminal: { outcome: 'unknown-submission-state', started: 'publish' }
      },
      {
        browser: 'firefox',
        childSuccess: false,
        terminal: {
          outcome: 'unknown-submission-state',
          started: 'upload',
          completed: 'source-patch'
        }
      },
      {
        browser: 'chrome',
        childSuccess: false,
        terminal: { outcome: 'unknown-submission-state', started: 'version-submit' }
      },
      {
        browser: 'chrome',
        childSuccess: false,
        terminal: { outcome: 'success', started: 'publish', completed: 'publish' }
      },
      {
        browser: 'chrome',
        childSuccess: true,
        terminal: { outcome: 'unknown-submission-state', started: 'upload' }
      },
      {
        browser: 'firefox',
        childSuccess: true,
        terminal: { outcome: 'pre-mutation-failure' }
      },
      { browser: 'chrome', childSuccess: false }
    ];
    for (const row of invalidCases) {
      const initialized = await initializedStoreFixture(row.browser);
      const bindingBefore = readFileSync(initialized.bindingPath);
      const spec = storeLeafSpec(initialized, row.childSuccess);
      const result = await startBoundedCommand(
        { profileId: spec.profileId, arguments: [] },
        {
          resolveProfile: () => spec,
          spawnOperation: spawnAfter(() => {
            if (row.terminal) writeStoreTerminalState(initialized.statePath, row.terminal);
          })
        }
      ).completion;
      expect(result.ok).toBe(false);
      expect(readFileSync(initialized.bindingPath), JSON.stringify(row)).toEqual(bindingBefore);
      if (row.terminal) {
        const checked = await runBoundedCommand(
          { profileId: 'release-state-check-v1', arguments: ['--browser', row.browser] },
          { environment: initialized.fixture.environment }
        );
        expect(checked.ok).toBe(false);
      }
    }

    const unrefreshed = await initializedStoreFixture('chrome');
    writeStoreTerminalState(unrefreshed.statePath, {
      outcome: 'success',
      started: 'publish',
      completed: 'publish'
    });
    await expect(
      runBoundedCommand(
        { profileId: 'release-state-check-v1', arguments: ['--browser', 'chrome'] },
        { environment: unrefreshed.fixture.environment }
      )
    ).resolves.toMatchObject({ ok: false, terminalReason: 'RELEASE_STATE_BINDING_INVALID' });

    const bindingDrift = await initializedStoreFixture('chrome');
    const driftSpec = storeLeafSpec(bindingDrift, true);
    const driftResult = await startBoundedCommand(
      { profileId: driftSpec.profileId, arguments: [] },
      {
        resolveProfile: () => driftSpec,
        spawnOperation: spawnAfter(() => {
          writeStoreTerminalState(bindingDrift.statePath, {
            outcome: 'success',
            started: 'publish',
            completed: 'publish'
          });
          rewriteCanonicalOwnedJson(bindingDrift.bindingPath, (value) => {
            value.stateSha256 = '0'.repeat(64);
          });
        })
      }
    ).completion;
    expect(driftResult).toMatchObject({
      ok: false,
      terminalReason: 'RELEASE_STATE_BINDING_CAS_MISMATCH'
    });

    const casBlocked = await initializedStoreFixture('chrome');
    const casSpec = storeLeafSpec(casBlocked, true);
    const casResult = await startBoundedCommand(
      { profileId: casSpec.profileId, arguments: [] },
      {
        resolveProfile: () => casSpec,
        spawnOperation: spawnAfter(() => {
          writeStoreTerminalState(casBlocked.statePath, {
            outcome: 'success',
            started: 'publish',
            completed: 'publish'
          });
          writeFileSync(`${casBlocked.bindingPath}.next`, 'occupied', { mode: 0o600 });
        })
      }
    ).completion;
    expect(casResult.ok).toBe(false);

    const lateMutation = await initializedStoreFixture('chrome');
    const lateSpec = storeLeafSpec(lateMutation, true);
    const lateResult = await startBoundedCommand(
      { profileId: lateSpec.profileId, arguments: [] },
      {
        resolveProfile: () => lateSpec,
        spawnOperation: spawnAfter(
          () => {
            writeStoreTerminalState(lateMutation.statePath, {
              outcome: 'success',
              started: 'publish',
              completed: 'publish'
            });
          },
          () => {
            rewriteCanonicalOwnedJson(lateMutation.statePath, (value) => {
              value.manifestSha256 = '0'.repeat(64);
            });
          }
        )
      }
    ).completion;
    expect(lateResult.ok).toBe(false);

    const rebound = await initializedStoreFixture('chrome');
    const reboundSpec = storeLeafSpec(rebound, true);
    await startBoundedCommand(
      { profileId: reboundSpec.profileId, arguments: [] },
      {
        resolveProfile: () => reboundSpec,
        spawnOperation: spawnAfter(() => {
          writeStoreTerminalState(rebound.statePath, {
            outcome: 'success',
            started: 'publish',
            completed: 'publish'
          });
        })
      }
    ).completion;
    const beforeTamper = lstatSync(rebound.statePath);
    rewriteCanonicalOwnedJson(rebound.statePath, (value) => {
      value.manifestSha256 = `${String(value.manifestSha256).slice(0, -1)}0`;
    });
    const afterTamper = lstatSync(rebound.statePath);
    expect({ inode: afterTamper.ino, size: afterTamper.size }).toEqual({
      inode: beforeTamper.ino,
      size: beforeTamper.size
    });
    await expect(
      runBoundedCommand(
        { profileId: 'release-state-check-v1', arguments: ['--browser', 'chrome'] },
        { environment: rebound.fixture.environment }
      )
    ).resolves.toMatchObject({ ok: false });

    const replaced = await initializedStoreFixture('chrome');
    const replacement = join(dirname(replaced.statePath), 'replacement.json');
    writeFileSync(replacement, readFileSync(replaced.statePath), { mode: 0o600 });
    chmodSync(replacement, 0o600);
    renameSync(replacement, replaced.statePath);
    await expect(
      runBoundedCommand(
        { profileId: 'release-state-check-v1', arguments: ['--browser', 'chrome'] },
        { environment: replaced.fixture.environment }
      )
    ).resolves.toMatchObject({ ok: false, terminalReason: 'RELEASE_STATE_BINDING_INVALID' });
  });

  it('binds both Firefox Playwright phases to one fresh current-job root and owner configs', () => {
    const fixture = firefoxPlaywrightPhaseFixture();
    const host = resolveCommandProfile(
      'playwright-host-deps-platform-v1',
      ['firefox-with-host-deps'],
      { environment: fixture.phaseEnvironment }
    );
    const browser = resolveCommandProfile(
      'playwright-browser-install-v1',
      ['firefox-with-host-deps'],
      { environment: fixture.phaseEnvironment }
    );

    expect(host.argv.slice(-2)).toEqual(['install-deps', 'firefox']);
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
    expect(browser.env).toMatchObject({
      NPM_CONFIG_USERCONFIG: fixture.userconfig,
      NPM_CONFIG_GLOBALCONFIG: fixture.globalconfig,
      PLAYWRIGHT_BROWSERS_PATH: fixture.browsersPath,
      ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: fixture.attemptRoot
    });
    expect(browser.commandContext).toMatchObject({
      firefoxExecutionClass: 'release',
      attemptRoot: fixture.attemptRoot,
      browsersPath: fixture.browsersPath,
      userconfig: fixture.userconfig,
      globalconfig: fixture.globalconfig,
      browserRootState: 'empty'
    });
    expect(lstatSync(fixture.browsersPath).mode & 0o777).toBe(0o700);
    expect(readdirSync(fixture.browsersPath)).toEqual([]);

    const ordinary = ciInstallFixture('browser-v1', '60');
    const ordinaryInstall = resolveCommandProfile('github-ci-install-v1', [], {
      environment: ordinary.environment,
      operations: ordinary.operations
    });
    const ordinaryRoot = ordinaryInstall.commandContext?.attemptRoot;
    if (typeof ordinaryRoot !== 'string') throw new Error('TEST_ATTEMPT_ROOT_INVALID');
    const ordinaryEnvironment: NodeJS.ProcessEnv = {
      ...ordinary.environment,
      NPM_CONFIG_USERCONFIG: join(ordinaryRoot, 'install/npm-userconfig'),
      NPM_CONFIG_GLOBALCONFIG: join(ordinaryRoot, 'install/npm-globalconfig'),
      PLAYWRIGHT_BROWSERS_PATH: join(ordinaryRoot, 'browsers')
    };
    delete ordinaryEnvironment.ZENDIO_JOB_CLASS;
    delete ordinaryEnvironment.ZENDIO_JOB_TIMEOUT_MINUTES;
    const ordinaryHost = resolveCommandProfile(
      'playwright-host-deps-platform-v1',
      ['firefox-with-host-deps'],
      { environment: ordinaryEnvironment }
    );
    expect(ordinaryHost.commandContext).toMatchObject({
      firefoxExecutionClass: 'ordinary-ci',
      browsersPath: join(ordinaryRoot, 'browsers'),
      browserRootState: 'absent'
    });
    expect(ordinaryHost.env).not.toHaveProperty('ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT');
  });

  it('rejects missing, foreign, swapped, reused, and late-mutated Firefox phase paths', () => {
    const mutations = [
      (fixture: ReturnType<typeof firefoxPlaywrightPhaseFixture>) => {
        const environment: NodeJS.ProcessEnv = { ...fixture.phaseEnvironment };
        delete environment.NPM_CONFIG_USERCONFIG;
        return environment;
      },
      (fixture: ReturnType<typeof firefoxPlaywrightPhaseFixture>) => ({
        ...fixture.phaseEnvironment,
        NPM_CONFIG_USERCONFIG: fixture.globalconfig,
        NPM_CONFIG_GLOBALCONFIG: fixture.userconfig
      }),
      (fixture: ReturnType<typeof firefoxPlaywrightPhaseFixture>) => ({
        ...fixture.phaseEnvironment,
        PLAYWRIGHT_BROWSERS_PATH: join(realpathSync(temporaryRoot()), 'browsers')
      }),
      (fixture: ReturnType<typeof firefoxPlaywrightPhaseFixture>) => ({
        ...fixture.phaseEnvironment,
        PLAYWRIGHT_BROWSERS_PATH: join(fixture.attemptRoot, 'browsers')
      }),
      (fixture: ReturnType<typeof firefoxPlaywrightPhaseFixture>) => ({
        ...fixture.phaseEnvironment,
        ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: realpathSync(temporaryRoot())
      })
    ];
    for (const mutate of mutations) {
      const fixture = firefoxPlaywrightPhaseFixture();
      expect(() =>
        resolveCommandProfile('playwright-host-deps-platform-v1', ['firefox-with-host-deps'], {
          environment: mutate(fixture)
        })
      ).toThrow();
    }

    const wrongMode = firefoxPlaywrightPhaseFixture();
    chmodSync(wrongMode.userconfig, 0o644);
    expect(() =>
      resolveCommandProfile('playwright-host-deps-platform-v1', ['firefox-with-host-deps'], {
        environment: wrongMode.phaseEnvironment
      })
    ).toThrow('NPM_CONFIG_IDENTITY_INVALID');

    const reused = firefoxPlaywrightPhaseFixture();
    mkdirSync(reused.browsersPath, { mode: 0o700 });
    expect(() =>
      resolveCommandProfile('playwright-host-deps-platform-v1', ['firefox-with-host-deps'], {
        environment: reused.phaseEnvironment
      })
    ).toThrow('PLAYWRIGHT_BROWSER_ROOT_REUSED');

    const raced = firefoxPlaywrightPhaseFixture();
    const profile = resolveCommandProfile(
      'playwright-browser-install-v1',
      ['firefox-with-host-deps'],
      { environment: raced.phaseEnvironment }
    );
    writeFileSync(join(raced.browsersPath, 'foreign'), 'late');
    expect(() =>
      startBoundedCommand(
        { profileId: 'playwright-browser-install-v1', arguments: ['firefox-with-host-deps'] },
        { resolveProfile: () => profile }
      )
    ).toThrow('PLAYWRIGHT_BROWSER_ROOT_INVALID');
  });

  it('binds every Firefox release consumer and isolates the protected verifier class', () => {
    const fixture = firefoxPlaywrightPhaseFixture();
    resolveCommandProfile('playwright-browser-install-v1', ['firefox-with-host-deps'], {
      environment: fixture.phaseEnvironment
    });
    const fixedTrackedFileOperation = () => resolve('tests/fixtures/bounded-command/child.mjs');
    const consumerCases: Array<[CommandBoundaryProfileId, string[]]> = [
      [
        'firefox-prepare-v1',
        [
          '--config-mode',
          'owner-public-vars',
          '--transport-mode',
          'local-private-v1',
          '--attempt-root',
          fixture.attemptRoot,
          '--dist-dir',
          join(fixture.attemptRoot, 'dist'),
          '--release-dir',
          join(fixture.attemptRoot, 'release'),
          '--authorization-record',
          join(fixture.attemptRoot, 'authorization.json'),
          '--result-json',
          join(fixture.attemptRoot, 'result.json')
        ]
      ],
      [
        'firefox-verify-v1',
        [
          '--manifest',
          join(fixture.attemptRoot, 'manifest.json'),
          '--transport-mode',
          'local-private-v1'
        ]
      ],
      [
        'firefox-smoke-v1',
        [
          '--manifest',
          join(fixture.attemptRoot, 'manifest.json'),
          '--transport-mode',
          'local-private-v1',
          '--result-json',
          join(fixture.attemptRoot, 'smoke.json')
        ]
      ]
    ];
    for (const [profileId, args] of consumerCases) {
      const profile = resolveCommandProfile(profileId, args, {
        environment: fixture.phaseEnvironment,
        operations: { fixedTrackedFileOperation }
      });
      expect(profile.env).toMatchObject({
        NPM_CONFIG_USERCONFIG: fixture.userconfig,
        NPM_CONFIG_GLOBALCONFIG: fixture.globalconfig,
        PLAYWRIGHT_BROWSERS_PATH: fixture.browsersPath,
        ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: fixture.attemptRoot
      });
      expect(profile.commandContext).toMatchObject({
        firefoxExecutionClass: 'release',
        browserRootState: 'existing',
        attemptRoot: fixture.attemptRoot,
        browsersPath: fixture.browsersPath
      });
    }

    const protectedFixture = releaseAttemptFixture('firefox', 'submit');
    installAttemptConfigs(protectedFixture.attemptRoot);
    const protectedManifest = join(protectedFixture.attemptRoot, 'manifest.json');
    writeFileSync(protectedManifest, 'protected-manifest', { mode: 0o600 });
    const protectedEnvironment = {
      ...protectedFixture.environment,
      NPM_CONFIG_USERCONFIG: join(protectedFixture.attemptRoot, 'install/npm-userconfig'),
      NPM_CONFIG_GLOBALCONFIG: join(protectedFixture.attemptRoot, 'install/npm-globalconfig'),
      ZENDIO_EXPECTED_RELEASE_MANIFEST_SHA256: sha256(protectedManifest)
    };
    const protectedProfile = resolveCommandProfile(
      'firefox-verify-v1',
      ['--manifest', protectedManifest, '--transport-mode', 'github-artifact-v1'],
      {
        environment: protectedEnvironment,
        operations: { fixedTrackedFileOperation }
      }
    );
    expect(protectedProfile.commandContext).toMatchObject({
      firefoxExecutionClass: 'protected-verifier',
      browserRootState: 'none',
      browsersPath: null
    });
    expect(protectedProfile.env).not.toHaveProperty('PLAYWRIGHT_BROWSERS_PATH');
    expect(protectedProfile.env).not.toHaveProperty('ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT');
    expect(() =>
      resolveCommandProfile(
        'firefox-verify-v1',
        ['--manifest', protectedManifest, '--transport-mode', 'github-artifact-v1'],
        {
          environment: {
            ...protectedEnvironment,
            PLAYWRIGHT_BROWSERS_PATH: fixture.browsersPath,
            ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: fixture.attemptRoot
          },
          operations: { fixedTrackedFileOperation }
        }
      )
    ).toThrow('PLAYWRIGHT_PROTECTED_VERIFIER_ISOLATION_INVALID');
    const missingProtectedConfig: NodeJS.ProcessEnv = { ...protectedEnvironment };
    delete missingProtectedConfig.NPM_CONFIG_GLOBALCONFIG;
    expect(() =>
      resolveCommandProfile(
        'firefox-verify-v1',
        ['--manifest', protectedManifest, '--transport-mode', 'github-artifact-v1'],
        {
          environment: missingProtectedConfig,
          operations: { fixedTrackedFileOperation }
        }
      )
    ).toThrow('NPM_CONFIG_IDENTITY_INVALID');

    for (const environment of [
      {
        ...fixture.phaseEnvironment,
        PLAYWRIGHT_BROWSERS_PATH: join(fixture.attemptRoot, 'browsers')
      },
      {
        ...fixture.phaseEnvironment,
        NPM_CONFIG_USERCONFIG: fixture.globalconfig,
        NPM_CONFIG_GLOBALCONFIG: fixture.userconfig
      }
    ]) {
      expect(() =>
        resolveCommandProfile('firefox-verify-v1', consumerCases[1][1], {
          environment,
          operations: { fixedTrackedFileOperation }
        })
      ).toThrow();
    }

    const late = resolveCommandProfile('firefox-verify-v1', consumerCases[1][1], {
      environment: fixture.phaseEnvironment,
      operations: { fixedTrackedFileOperation }
    });
    chmodSync(fixture.globalconfig, 0o644);
    expect(() =>
      startBoundedCommand(
        { profileId: 'firefox-verify-v1', arguments: consumerCases[1][1] },
        { resolveProfile: () => late }
      )
    ).toThrow();
  });

  it('publishes immutable same-attempt Firefox phase receipts and requires them before consumers', async () => {
    const fixture = firefoxPlaywrightPhaseFixture();
    const leaf = resolveCommandProfile('fixture-v1', ['success'], {
      environment: cleanEnvironment()
    });
    const host = resolveCommandProfile(
      'playwright-host-deps-platform-v1',
      ['firefox-with-host-deps'],
      { environment: fixture.phaseEnvironment }
    );
    await expect(
      runBoundedCommand(
        { profileId: 'playwright-host-deps-platform-v1', arguments: ['firefox-with-host-deps'] },
        {
          environment: fixture.phaseEnvironment,
          resolveProfile: () => ({
            ...leaf,
            profileId: 'playwright-host-deps-platform-v1',
            env: host.env,
            commandContext: host.commandContext
          })
        }
      )
    ).resolves.toMatchObject({ ok: true });

    const browser = resolveCommandProfile(
      'playwright-browser-install-v1',
      ['firefox-with-host-deps'],
      { environment: fixture.phaseEnvironment }
    );
    await expect(
      runBoundedCommand(
        { profileId: 'playwright-browser-install-v1', arguments: ['firefox-with-host-deps'] },
        {
          environment: fixture.phaseEnvironment,
          resolveProfile: () => ({
            ...leaf,
            profileId: 'playwright-browser-install-v1',
            env: browser.env,
            commandContext: browser.commandContext
          }),
          spawnOperation: spawnAfter(() => {
            writeFileSync(join(fixture.browsersPath, 'installed-browser'), 'verified');
          })
        }
      )
    ).resolves.toMatchObject({ ok: true });

    const consumer = resolveCommandProfile(
      'firefox-verify-v1',
      [
        '--manifest',
        join(fixture.attemptRoot, 'release/manifest.json'),
        '--transport-mode',
        'local-private-v1'
      ],
      {
        environment: fixture.phaseEnvironment,
        operations: {
          fixedTrackedFileOperation: () => resolve('tests/fixtures/bounded-command/child.mjs')
        }
      }
    );
    await expect(
      runBoundedCommand(
        { profileId: 'firefox-verify-v1', arguments: [] },
        {
          environment: fixture.phaseEnvironment,
          resolveProfile: () => ({
            ...leaf,
            profileId: 'firefox-verify-v1',
            env: consumer.env,
            commandContext: consumer.commandContext
          })
        }
      )
    ).resolves.toMatchObject({ ok: true });

    const missing = firefoxPlaywrightPhaseFixture();
    mkdirSync(missing.browsersPath, { mode: 0o700 });
    const missingConsumer = resolveCommandProfile(
      'firefox-verify-v1',
      [
        '--manifest',
        join(missing.attemptRoot, 'release/manifest.json'),
        '--transport-mode',
        'local-private-v1'
      ],
      {
        environment: missing.phaseEnvironment,
        operations: {
          fixedTrackedFileOperation: () => resolve('tests/fixtures/bounded-command/child.mjs')
        }
      }
    );
    expect(() =>
      startBoundedCommand(
        { profileId: 'firefox-verify-v1', arguments: [] },
        {
          environment: missing.phaseEnvironment,
          resolveProfile: () => ({
            ...leaf,
            profileId: 'firefox-verify-v1',
            env: missingConsumer.env,
            commandContext: missingConsumer.commandContext
          })
        }
      )
    ).toThrow();
  });

  it('keeps the local-private Firefox consumer reachable without inventing a CI phase receipt', async () => {
    const root = realpathSync(temporaryRoot());
    installAttemptConfigs(root);
    const browsersPath = join(root, 'playwright-browsers');
    mkdirSync(browsersPath, { mode: 0o700 });
    writeFileSync(join(browsersPath, 'installed-browser'), 'verified');
    const environment = cleanEnvironment({
      NPM_CONFIG_USERCONFIG: join(root, 'install/npm-userconfig'),
      NPM_CONFIG_GLOBALCONFIG: join(root, 'install/npm-globalconfig'),
      ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: root,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath
    });
    const consumer = resolveCommandProfile(
      'firefox-verify-v1',
      ['--manifest', join(root, 'release/manifest.json'), '--transport-mode', 'local-private-v1'],
      {
        environment,
        operations: {
          fixedTrackedFileOperation: () => resolve('tests/fixtures/bounded-command/child.mjs')
        }
      }
    );
    expect(consumer.commandContext).toMatchObject({
      attemptRoot: root,
      firefoxExecutionClass: 'release',
      phaseReceiptPath: undefined
    });
    const leaf = resolveCommandProfile('fixture-v1', ['success'], {
      environment: cleanEnvironment()
    });
    await expect(
      runBoundedCommand(
        { profileId: 'firefox-verify-v1', arguments: [] },
        {
          environment,
          resolveProfile: () => ({
            ...leaf,
            profileId: 'firefox-verify-v1',
            env: consumer.env,
            commandContext: consumer.commandContext
          })
        }
      )
    ).resolves.toMatchObject({ ok: true });
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
