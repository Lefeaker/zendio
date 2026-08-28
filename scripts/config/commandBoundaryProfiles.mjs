import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deepFreeze, sha256Buffer } from '../../tools/npm-audit-regression/canonical-json.mjs';
import { detectNpmCommand } from '../../tools/npm-audit-regression/runtime-discovery.mjs';

export const COMMAND_BOUNDARY_VERSION = 'command-boundary-v1';
export const COMMAND_REQUEST_FILE = 'command-request.json';
export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const COMMAND_LIMITS = deepFreeze({
  quick: {
    activeMs: 60_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 8 << 20,
    stderrBytes: 8 << 20,
    fd4Bytes: 1 << 20,
    fd5Bytes: 1 << 20
  },
  standard: {
    activeMs: 180_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 16 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  build: {
    activeMs: 360_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 32 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  vitest: {
    activeMs: 720_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 64 << 20,
    stderrBytes: 32 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  browser: {
    activeMs: 1_380_000,
    termMs: 35_000,
    killMs: 15_000,
    stdoutBytes: 64 << 20,
    stderrBytes: 32 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  install: {
    activeMs: 630_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 32 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  browserInstall: {
    activeMs: 930_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 32 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  geckodriverProvision: {
    activeMs: 900_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 16 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  isolatedBuild: {
    activeMs: 630_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 32 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  firefoxSmoke: {
    activeMs: 440_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 16 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  chromePrepare: {
    activeMs: 720_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 32 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  chromeVerify: {
    activeMs: 300_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 16 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  chromePublish: {
    activeMs: 720_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 32 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  firefoxPrepare: {
    activeMs: 1_200_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 64 << 20,
    stderrBytes: 32 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  firefoxVerify: {
    activeMs: 480_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 32 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  firefoxSubmit: {
    activeMs: 2_700_000,
    termMs: 5_000,
    killMs: 5_000,
    stdoutBytes: 64 << 20,
    stderrBytes: 32 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  stitch: {
    activeMs: 3_780_000,
    termMs: 35_000,
    killMs: 15_000,
    stdoutBytes: 64 << 20,
    stderrBytes: 32 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  platform: {
    activeMs: null,
    termMs: 0,
    killMs: 0,
    stdoutBytes: 32 << 20,
    stderrBytes: 16 << 20,
    fd4Bytes: 4 << 20,
    fd5Bytes: 4 << 20
  },
  fixture: {
    activeMs: 750,
    termMs: 100,
    killMs: 250,
    stdoutBytes: 64 << 10,
    stderrBytes: 64 << 10,
    fd4Bytes: 64 << 10,
    fd5Bytes: 64 << 10
  }
});

export const TASK_GRAPH_POLICIES = deepFreeze({
  'quality-v1': { concurrency: 3, fullMs: 930_000, terminalReserveMs: 10_000 },
  'preflight-v1': { concurrency: 1, fullMs: 640_000, terminalReserveMs: 10_000 },
  'vitest-shards-v1': { concurrency: 3, fullMs: 1_510_000, terminalReserveMs: 10_000 },
  'browser-shards-v1': { concurrency: 2, fullMs: 2_750_000, terminalReserveMs: 50_000 }
});

export const DIRECT_ROOT_COORDINATOR_GRAMMARS = deepFreeze([
  { path: 'scripts/quality-check.mjs', grammar: 'none' },
  { path: 'scripts/run-browser-test-shards.mjs', grammar: 'browser-shards-v1' },
  { path: 'scripts/run-test-shards.mjs', grammar: 'test-shards-v1' },
  { path: 'scripts/verify-preflight.mjs', grammar: 'none' }
]);

const LOCKED_PACKAGES = deepFreeze({
  vitest: {
    rootSpec: '4.1.9',
    version: '4.1.9',
    binName: 'vitest',
    packageSha256: 'e12762a5b629bea6cbb2b0540a8a15c50f3098bb3193d3e319293b58b64c4ed9',
    binSha256: '39db22f579acf5639bbb17a261408debbde03f4692c0c439e77e7f13aeba74d6'
  },
  prettier: {
    rootSpec: '^3.8.3',
    version: '3.8.3',
    binName: 'prettier',
    packageSha256: '223e6230f29d5537f6448db55339355c08c2125afe92977a1492a569cbfd413d',
    binSha256: 'ac5523cd57e7e9d8eac71caef7e022a8a8489bcdc19ca8a778b7e728ec103b93'
  },
  stylelint: {
    rootSpec: '^16.26.1',
    version: '16.26.1',
    binName: 'stylelint',
    packageSha256: 'eaeb825454198489518207184a9928212e54e3147a91a7e6522c16942601773a',
    binSha256: 'fff129a9fdd70eea1aaa609c42277622bf5bbbac228e54d22858d3324eada025'
  },
  'lint-staged': {
    rootSpec: '^16.4.0',
    version: '16.4.0',
    binName: 'lint-staged',
    packageSha256: '340e88434a282cd38350f84fe589505afbc6c4a1472c0c8c1f878533b13ead87',
    binSha256: 'cccadd752dcc66d8e07160d03ecb71469ed3913bbab00917f17ee0cdede57cb2'
  },
  husky: {
    rootSpec: '^9.1.7',
    version: '9.1.7',
    binName: 'husky',
    packageSha256: '8f3966c3b43a59e4b8e13fdfe8eb00a7ab66dfeb235515f7c19c8e0f5ca530e1',
    binSha256: 'c6965589a83667d43c4dc22f90dccfa91c133f8ed23629b896ce326f0a6c5cc8'
  },
  playwright: {
    rootName: '@playwright/test',
    packageName: '@playwright/test',
    rootSpec: '^1.60.0',
    version: '1.60.0',
    binName: 'playwright',
    packageSha256: 'cf92117ef1d8cbf1e4b2dffb63a0da552c0173bd6052f0f45711c0f00b79dc99',
    binSha256: '79e23e6a249176295b8490567daa7717448a75866d6ea6f6b296ff3d23305c69'
  }
});

export const QUICK_NPM_SCRIPTS = deepFreeze([
  'audit:ci-workflow:check',
  'lint:type-any',
  'lint:type-any:ratchet',
  'lint:warnings-guard',
  'lint:warnings-report',
  'release:metadata:check',
  'release:metadata:sync',
  'report:layout',
  'report:options-legacy',
  'report:release-summary',
  'validate:i18n:budgets',
  'verify:runtime'
]);

export const STANDARD_NPM_SCRIPTS = deepFreeze([
  'analytics:validate:prod',
  'analytics:validate:prod:required',
  'audit:build-graph:report',
  'audit:build:report',
  'audit:chrome-webstore-release:check',
  'audit:compatibility-duplicates:check',
  'audit:components:report',
  'audit:design-system-doc:report',
  'audit:design-tokens:report',
  'audit:firefox-amo-release:check',
  'audit:firefox-amo-release:report',
  'audit:ga:client-secret',
  'audit:ga:docs',
  'audit:ga:legacy-api',
  'audit:ga:proxy-contract',
  'audit:ga:release-surface',
  'audit:i18n-uncatalogued-user-copy:check',
  'audit:imports:check',
  'audit:imports:report',
  'audit:interaction-contract:report',
  'audit:locales:report',
  'audit:non-production-source:check',
  'audit:non-production-source:report',
  'audit:options-mainline:report',
  'audit:performance:report',
  'audit:platform-boundary:report',
  'audit:platform-services:report',
  'audit:production-build-graph:report',
  'audit:production-shape:report',
  'audit:release-surface:report',
  'audit:repository-composition:report',
  'audit:retired-code:report',
  'audit:test-suite-ownership:check',
  'audit:test-suite-ownership:report',
  'audit:ui-architecture:report',
  'i18n:catalog:check',
  'i18n:generate',
  'i18n:lint',
  'layout:report',
  'lint',
  'lint:hardcoded',
  'manifest:generate',
  'typecheck:app',
  'typecheck:strict',
  'typecheck:tests'
]);

export const BUILD_NPM_SCRIPTS = deepFreeze(['build:dev', 'build:fast', 'package:ci']);
export const BROWSER_NPM_SCRIPTS = deepFreeze([
  'test:e2e:browser',
  'test:e2e:browser:architecture',
  'test:e2e:browser:firefox',
  'test:e2e:browser:local-vault',
  'test:e2e:browser:reader-panel',
  'test:e2e:browser:smoke',
  'test:e2e:browser:state',
  'test:e2e:browser:video',
  'test:i18n:visual',
  'visual:record',
  'visual:stitch',
  'visual:test'
]);

export const PROFILE_IDS = deepFreeze([
  'chrome-dry-run-v1',
  'chrome-prepare-v1',
  'chrome-publish-v1',
  'chrome-verify-v1',
  'coverage-summary-v1',
  'dependency-cruiser-v1',
  'fixture-v1',
  'firefox-geckodriver-provision-v1',
  'firefox-prepare-v1',
  'firefox-smoke-v1',
  'firefox-submit-v1',
  'firefox-verify-v1',
  'generated-artifact-check-v1',
  'github-ci-install-v1',
  'husky-provision-v1',
  'isolated-build-v1',
  'lint-staged-hook-v1',
  'lint-staged-prepare-v1',
  'local-install-v1',
  'npm-audit-context-v1',
  'npm-ci-v1',
  'npm-script-browser-v1',
  'npm-script-build-v1',
  'npm-script-quick-v1',
  'npm-script-standard-v1',
  'npm-tree-read-v1',
  'node-script-standard-v1',
  'playwright-browser-install-v1',
  'playwright-host-deps-platform-v1',
  'playwright-install-v1',
  'playwright-v1',
  'prettier-v1',
  'release-job-outputs-v1',
  'release-provenance-v1',
  'release-result-field-v1',
  'release-runtime-check-v1',
  'release-state-check-v1',
  'release-state-init-v1',
  'stitch-secondary-v1',
  'stylelint-v1',
  'vitest-v1'
]);

const PROFILE_ID_SET = new Set(PROFILE_IDS);
const UNIT_SHARDS = new Set(['background', 'content', 'options', 'shared', 'tools']);
const E2E_SHARDS = new Set(['ai-chat', 'content', 'options', 'video']);

export class CommandBoundaryInvocationValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CommandBoundaryInvocationValidationError';
    this.code = code;
  }
}

function invalid(code) {
  throw new CommandBoundaryInvocationValidationError(code);
}

function boundedToken(value, { path = false, glob = false } = {}) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > 4096)
    invalid('ARGUMENT_INVALID');
  if (/[\0-\x1f\x7f]/u.test(value) || value.startsWith('@')) invalid('ARGUMENT_INVALID');
  if (path) {
    const normalized = value.replaceAll('\\', '/');
    if (isAbsolute(value) || normalized.startsWith('/') || normalized.split('/').includes('..'))
      invalid('PATH_INVALID');
    if (!glob && /[*?{}[\]]/u.test(value)) invalid('PATH_INVALID');
  }
  return value;
}

const RELEASE_CONFIG_MODES = new Set(['standalone-synthetic', 'owner-public-vars']);
const RELEASE_TRANSPORT_MODES = new Set(['local-private-v1', 'github-artifact-v1']);
const RELEASE_BROWSERS = new Set(['chrome', 'firefox']);
const RELEASE_AUDIT_NPM_SCRIPTS = new Set([
  'audit:release-surface:report',
  'audit:ga:client-secret',
  'audit:ga:release-surface'
]);
const FIREFOX_EXECUTION_CLASSES = deepFreeze({
  release: {
    browserRootBasename: 'playwright-browsers',
    requireAttemptEnvironment: true
  },
  'ordinary-ci': {
    browserRootBasename: 'browsers',
    requireAttemptEnvironment: false
  },
  'protected-verifier': {
    browserRootBasename: null,
    requireAttemptEnvironment: false
  }
});
const FIXED_RELEASE_NODE_PATHS = new Set([
  'scripts/build.mjs',
  'scripts/provision-geckodriver.mjs',
  'scripts/package-firefox.mjs',
  'scripts/package.mjs',
  'scripts/prepare-chrome-release.mjs',
  'scripts/prepare-firefox-release.mjs',
  'scripts/publish-chrome-webstore.mjs',
  'scripts/run-firefox-xpi-smoke.mjs',
  'scripts/run-playwright.mjs',
  'scripts/submit-firefox-amo-release.mjs',
  'scripts/utils/releaseArtifactManifest.mjs',
  'scripts/utils/releaseCiProvenance.mjs',
  'scripts/utils/releasePublicBuildConfig.mjs',
  'scripts/verify-chrome-release.mjs',
  'scripts/verify-firefox-release.mjs',
  'tools/check-npm-audit-regression.mjs',
  'tools/report-chrome-webstore-release-workflow.mjs',
  'tools/report-firefox-amo-release-workflow.mjs'
]);

function absolutePathToken(value) {
  boundedToken(value);
  if (!isAbsolute(value) || resolve(value) !== value) invalid('ABSOLUTE_PATH_INVALID');
  return value;
}

function exactArgs(args, expected, code = 'PROFILE_ARGUMENTS_INVALID') {
  if (JSON.stringify(args) !== JSON.stringify(expected)) invalid(code);
  return args;
}

function requireFlagValue(args, index, flag, validator = boundedToken) {
  if (args[index] !== flag || args[index + 1] === undefined) invalid('PROFILE_ARGUMENTS_INVALID');
  validator(args[index + 1]);
  return args[index + 1];
}

function validatePrepareArgs(args, { firefox = false } = {}) {
  let index = 0;
  const configMode = requireFlagValue(args, index, '--config-mode');
  if (!RELEASE_CONFIG_MODES.has(configMode)) invalid('RELEASE_CONFIG_MODE_INVALID');
  index += 2;
  if (firefox) {
    const transport = requireFlagValue(args, index, '--transport-mode');
    if (transport !== 'local-private-v1') invalid('RELEASE_TRANSPORT_MODE_INVALID');
    index += 2;
  }
  const attemptRoot = requireFlagValue(args, index, '--attempt-root', absolutePathToken);
  index += 2;
  const distDir = requireFlagValue(args, index, '--dist-dir', absolutePathToken);
  index += 2;
  const releaseDir = requireFlagValue(args, index, '--release-dir', absolutePathToken);
  index += 2;
  let authorizationRecord;
  if (args[index] === '--authorization-record') {
    authorizationRecord = requireFlagValue(
      args,
      index,
      '--authorization-record',
      absolutePathToken
    );
    index += 2;
  }
  const resultJson = requireFlagValue(args, index, '--result-json', absolutePathToken);
  index += 2;
  if (index !== args.length) invalid('PROFILE_ARGUMENTS_INVALID');
  if ((authorizationRecord !== undefined) !== (configMode === 'owner-public-vars'))
    invalid('RELEASE_AUTHORIZATION_MODE_INVALID');
  if (
    new Set([attemptRoot, distDir, releaseDir, resultJson, authorizationRecord].filter(Boolean))
      .size !==
    [attemptRoot, distDir, releaseDir, resultJson, authorizationRecord].filter(Boolean).length
  )
    invalid('RELEASE_PATH_ALIAS_INVALID');
  return args;
}

function validateReleaseProvenanceArgs(args) {
  const [script, mode] = args;
  if (script === 'scripts/utils/releaseArtifactManifest.mjs') {
    if (mode === '--validate-upload-artifact-id') {
      if (args.length !== 3 || !/^[1-9][0-9]{0,15}$/u.test(args[2])) invalid('ARTIFACT_ID_INVALID');
      const numeric = Number(args[2]);
      if (!Number.isSafeInteger(numeric) || String(numeric) !== args[2])
        invalid('ARTIFACT_ID_INVALID');
      return args;
    }
    if (mode === '--normalize-upload-artifact-digest') {
      if (args.length !== 3 || !/^[0-9a-f]{64}$/u.test(args[2])) invalid('ARTIFACT_DIGEST_INVALID');
      return args;
    }
    invalid('RELEASE_PROVENANCE_ARGUMENTS_INVALID');
  }
  if (script !== 'scripts/utils/releaseCiProvenance.mjs')
    invalid('RELEASE_PROVENANCE_ARGUMENTS_INVALID');
  if (mode === '--prepare-authorization') {
    if (args.length !== 8) invalid('RELEASE_PROVENANCE_ARGUMENTS_INVALID');
    requireFlagValue(args, 2, '--expected-sha', (value) => {
      if (!/^[0-9a-f]{40}$/u.test(value)) invalid('RELEASE_SHA_INVALID');
    });
    exactArgs(
      args.slice(4, 6),
      ['--required-jobs-source', 'scripts/config/releaseRequiredCiJobs.mjs'],
      'RELEASE_PROVENANCE_ARGUMENTS_INVALID'
    );
    requireFlagValue(args, 6, '--authorization-record', absolutePathToken);
    return args;
  }
  if (mode === '--reauthorize') {
    if (args.length !== 14) invalid('RELEASE_PROVENANCE_ARGUMENTS_INVALID');
    requireFlagValue(args, 2, '--expected-sha', (value) => {
      if (!/^[0-9a-f]{40}$/u.test(value)) invalid('RELEASE_SHA_INVALID');
    });
    const manifest = requireFlagValue(args, 4, '--artifact-manifest', absolutePathToken);
    requireFlagValue(args, 6, '--artifact-id', (value) => {
      if (!/^[1-9][0-9]{0,15}$/u.test(value) || !Number.isSafeInteger(Number(value)))
        invalid('ARTIFACT_ID_INVALID');
    });
    requireFlagValue(args, 8, '--artifact-digest', (value) => {
      if (!/^sha256:[0-9a-f]{64}$/u.test(value)) invalid('ARTIFACT_DIGEST_INVALID');
    });
    exactArgs(
      args.slice(10, 12),
      ['--required-jobs-source', 'scripts/config/releaseRequiredCiJobs.mjs'],
      'RELEASE_PROVENANCE_ARGUMENTS_INVALID'
    );
    const output = requireFlagValue(args, 12, '--authorization-record', absolutePathToken);
    if (manifest === output) invalid('RELEASE_PATH_ALIAS_INVALID');
    return args;
  }
  invalid('RELEASE_PROVENANCE_ARGUMENTS_INVALID');
}

function validateReleaseProfileArguments(profileId, args) {
  if (profileId === 'local-install-v1') return exactArgs(args, []);
  if (profileId === 'npm-audit-context-v1') {
    if (
      args.length !== 3 ||
      args[0] !== '--verify-baseline-context' ||
      args[1] !== '--baseline-manifest'
    )
      invalid('NPM_AUDIT_CONTEXT_ARGUMENTS_INVALID');
    absolutePathToken(args[2]);
    return args;
  }
  if (profileId === 'npm-tree-read-v1') {
    if (
      JSON.stringify(args) !== JSON.stringify(['ls', '--all']) &&
      JSON.stringify(args) !==
        JSON.stringify(['ls', 'yauzl', 'crc-32', 'dependency-cruiser', 'yaml', '--all'])
    )
      invalid('NPM_TREE_ARGUMENTS_INVALID');
    return args;
  }
  if (profileId === 'release-runtime-check-v1') {
    if (args.length !== 3 || args[0] !== '--check' || args[1] !== '--config-mode')
      invalid('RELEASE_RUNTIME_ARGUMENTS_INVALID');
    if (!RELEASE_CONFIG_MODES.has(args[2])) invalid('RELEASE_CONFIG_MODE_INVALID');
    return args;
  }
  if (profileId === 'isolated-build-v1') {
    if (args.length !== 9 || args[0] !== '--run-isolated-build')
      invalid('ISOLATED_BUILD_ARGUMENTS_INVALID');
    const configMode = requireFlagValue(args, 1, '--config-mode');
    if (!RELEASE_CONFIG_MODES.has(configMode)) invalid('RELEASE_CONFIG_MODE_INVALID');
    const browser = requireFlagValue(args, 3, '--browser');
    if (!RELEASE_BROWSERS.has(browser)) invalid('RELEASE_BROWSER_INVALID');
    const dist = requireFlagValue(args, 5, '--dist-dir', absolutePathToken);
    const temp = requireFlagValue(args, 7, '--temp-dir', absolutePathToken);
    if (dist === temp) invalid('RELEASE_PATH_ALIAS_INVALID');
    return args;
  }
  if (profileId === 'release-provenance-v1') return validateReleaseProvenanceArgs(args);
  if (profileId === 'chrome-prepare-v1') return validatePrepareArgs(args);
  if (profileId === 'firefox-prepare-v1') return validatePrepareArgs(args, { firefox: true });
  if (profileId === 'firefox-geckodriver-provision-v1') {
    if (args.length !== 2) invalid('GECKODRIVER_ARGUMENTS_INVALID');
    requireFlagValue(args, 0, '--output-dir', absolutePathToken);
    return args;
  }
  if (profileId === 'chrome-verify-v1' || profileId === 'firefox-verify-v1') {
    if (args.length !== 4) invalid('RELEASE_VERIFY_ARGUMENTS_INVALID');
    requireFlagValue(args, 0, '--manifest', absolutePathToken);
    const transport = requireFlagValue(args, 2, '--transport-mode');
    if (!RELEASE_TRANSPORT_MODES.has(transport)) invalid('RELEASE_TRANSPORT_MODE_INVALID');
    return args;
  }
  if (profileId === 'firefox-smoke-v1') {
    if (args.length !== 6) invalid('FIREFOX_SMOKE_ARGUMENTS_INVALID');
    requireFlagValue(args, 0, '--manifest', absolutePathToken);
    if (requireFlagValue(args, 2, '--transport-mode') !== 'local-private-v1')
      invalid('RELEASE_TRANSPORT_MODE_INVALID');
    const manifest = args[1];
    const result = requireFlagValue(args, 4, '--result-json', absolutePathToken);
    if (manifest === result) invalid('RELEASE_PATH_ALIAS_INVALID');
    return args;
  }
  if (profileId === 'chrome-dry-run-v1') {
    if (args.length !== 9 || args[0] !== '--dry-run') invalid('CHROME_DRY_RUN_ARGUMENTS_INVALID');
    const zip = requireFlagValue(args, 1, '--zip', absolutePathToken);
    const manifest = requireFlagValue(args, 3, '--artifact-manifest', absolutePathToken);
    const state = requireFlagValue(args, 5, '--state-file', absolutePathToken);
    if (requireFlagValue(args, 7, '--transport-mode') !== 'local-private-v1')
      invalid('RELEASE_TRANSPORT_MODE_INVALID');
    if (new Set([zip, manifest, state]).size !== 3) invalid('RELEASE_PATH_ALIAS_INVALID');
    return args;
  }
  if (profileId === 'chrome-publish-v1') {
    if (args.length !== 7 || args[0] !== '--publish') invalid('CHROME_PUBLISH_ARGUMENTS_INVALID');
    const manifest = requireFlagValue(args, 1, '--artifact-manifest', absolutePathToken);
    const state = requireFlagValue(args, 3, '--state-file', absolutePathToken);
    if (requireFlagValue(args, 5, '--transport-mode') !== 'github-artifact-v1')
      invalid('RELEASE_TRANSPORT_MODE_INVALID');
    if (manifest === state) invalid('RELEASE_PATH_ALIAS_INVALID');
    return args;
  }
  if (profileId === 'firefox-submit-v1') {
    if (args.length !== 10) invalid('FIREFOX_SUBMIT_ARGUMENTS_INVALID');
    const manifest = requireFlagValue(args, 0, '--artifact-manifest', absolutePathToken);
    if (requireFlagValue(args, 2, '--transport-mode') !== 'github-artifact-v1')
      invalid('RELEASE_TRANSPORT_MODE_INVALID');
    const state = requireFlagValue(args, 4, '--submission-state-file', absolutePathToken);
    const uuid = requireFlagValue(args, 6, '--saved-upload-uuid-path', absolutePathToken);
    const channel = requireFlagValue(args, 8, '--channel');
    if (!['listed', 'unlisted'].includes(channel)) invalid('FIREFOX_CHANNEL_INVALID');
    if (new Set([manifest, state, uuid]).size !== 3) invalid('RELEASE_PATH_ALIAS_INVALID');
    return args;
  }
  if (profileId === 'release-job-outputs-v1') {
    if (args.length !== 4) invalid('RELEASE_JOB_OUTPUT_ARGUMENTS_INVALID');
    const browser = requireFlagValue(args, 0, '--browser');
    if (!RELEASE_BROWSERS.has(browser)) invalid('RELEASE_BROWSER_INVALID');
    requireFlagValue(args, 2, '--result-json', absolutePathToken);
    return args;
  }
  if (profileId === 'release-result-field-v1') {
    if (args.length !== 6) invalid('RELEASE_RESULT_FIELD_ARGUMENTS_INVALID');
    const browser = requireFlagValue(args, 0, '--browser');
    if (!RELEASE_BROWSERS.has(browser)) invalid('RELEASE_BROWSER_INVALID');
    requireFlagValue(args, 2, '--result-json', absolutePathToken);
    const field = requireFlagValue(args, 4, '--field');
    const accepted =
      browser === 'chrome' ? ['manifestPath', 'zipPath'] : ['manifestPath', 'xpiPath'];
    if (!accepted.includes(field)) invalid('RELEASE_RESULT_FIELD_INVALID');
    return args;
  }
  if (profileId === 'release-state-init-v1' || profileId === 'release-state-check-v1') {
    if (args.length !== 2 || args[0] !== '--browser' || !RELEASE_BROWSERS.has(args[1]))
      invalid('RELEASE_STATE_ARGUMENTS_INVALID');
    return args;
  }
  return null;
}

function validateVitestArgs(args) {
  if (args[0] !== 'run') invalid('VITEST_ARGUMENTS_INVALID');
  let index = 1;
  if (args[index] === '--config') {
    if (!['vitest.unit.config.ts', 'vitest.e2e.config.ts'].includes(args[index + 1]))
      invalid('VITEST_ARGUMENTS_INVALID');
    index += 2;
  }
  if (args[index] === '--coverage') index += 1;
  if (args.length - index > 256) invalid('VITEST_ARGUMENTS_INVALID');
  for (; index < args.length; index += 1) boundedToken(args[index], { path: true, glob: true });
  return args;
}

function validatePrettierArgs(args) {
  if (!['--check', '--write'].includes(args[0]) || args.length < 2 || args.length > 257)
    invalid('PRETTIER_ARGUMENTS_INVALID');
  for (const token of args.slice(1)) boundedToken(token, { path: true, glob: true });
  return args;
}

function validateStylelintArgs(args) {
  if (args[0] === '--print-config') {
    if (args.length !== 2) invalid('STYLELINT_ARGUMENTS_INVALID');
    const item = boundedToken(args[1], { path: true });
    if (!item.startsWith('src/options/') && !item.startsWith('src/ui/'))
      invalid('STYLELINT_ARGUMENTS_INVALID');
    return args;
  }
  if (args.length < 1 || args.length > 256) invalid('STYLELINT_ARGUMENTS_INVALID');
  for (const token of args) boundedToken(token, { path: true, glob: true });
  return args;
}

function validateNpmScriptArgs(args, accepted) {
  const [name, separator, ...forwarded] = args;
  if (!accepted.includes(name)) invalid('NPM_SCRIPT_INVALID');
  if (separator === undefined) return args;
  if (separator !== '--') invalid('NPM_SCRIPT_INVALID');
  if (name === 'lint' && JSON.stringify(forwarded) === JSON.stringify(['--quiet'])) return args;
  if (RELEASE_AUDIT_NPM_SCRIPTS.has(name)) {
    if (
      ![2, 4].includes(forwarded.length) ||
      forwarded[0] !== '--dist' ||
      (forwarded.length === 4 && forwarded[2] !== '--archive')
    )
      invalid('NPM_SCRIPT_ARGUMENTS_INVALID');
    const paths = [forwarded[1], ...(forwarded.length === 4 ? [forwarded[3]] : [])];
    for (const path of paths) absolutePathToken(path);
    if (new Set(paths).size !== paths.length) invalid('NPM_SCRIPT_ARGUMENTS_INVALID');
    return args;
  }
  if (forwarded.length !== 0) invalid('NPM_SCRIPT_ARGUMENTS_INVALID');
  return args;
}

export function validateProfileArguments(profileId, args) {
  if (!PROFILE_ID_SET.has(profileId) || !Array.isArray(args)) invalid('PROFILE_INVALID');
  if (args.length > 256) invalid('ARGUMENT_COUNT_INVALID');
  for (const item of args) boundedToken(item);
  const releaseArguments = validateReleaseProfileArguments(profileId, args);
  if (releaseArguments) return releaseArguments;
  if (profileId === 'vitest-v1') return validateVitestArgs(args);
  if (profileId === 'prettier-v1') return validatePrettierArgs(args);
  if (profileId === 'stylelint-v1') return validateStylelintArgs(args);
  if (
    [
      'lint-staged-hook-v1',
      'lint-staged-prepare-v1',
      'husky-provision-v1',
      'coverage-summary-v1',
      'dependency-cruiser-v1',
      'github-ci-install-v1',
      'npm-ci-v1',
      'stitch-secondary-v1'
    ].includes(profileId)
  ) {
    if (args.length !== 0) invalid('PROFILE_ARGUMENTS_INVALID');
  }
  if (profileId === 'npm-script-quick-v1') return validateNpmScriptArgs(args, QUICK_NPM_SCRIPTS);
  if (profileId === 'npm-script-standard-v1')
    return validateNpmScriptArgs(args, STANDARD_NPM_SCRIPTS);
  if (profileId === 'npm-script-build-v1') return validateNpmScriptArgs(args, BUILD_NPM_SCRIPTS);
  if (profileId === 'npm-script-browser-v1')
    return validateNpmScriptArgs(args, BROWSER_NPM_SCRIPTS);
  if (
    ['playwright-browser-install-v1', 'playwright-host-deps-platform-v1'].includes(profileId) &&
    (args.length !== 1 || !['chromium-with-host-deps', 'firefox-with-host-deps'].includes(args[0]))
  )
    invalid('PLAYWRIGHT_PHASE_ARGUMENTS_INVALID');
  if (
    profileId === 'playwright-install-v1' &&
    (args.length !== 1 || !['chromium-with-deps', 'firefox-with-deps'].includes(args[0]))
  )
    invalid('PLAYWRIGHT_INSTALL_ARGUMENTS_INVALID');
  if (profileId === 'playwright-v1') {
    if (args[0] !== 'test') invalid('PLAYWRIGHT_ARGUMENTS_INVALID');
    for (const item of args.slice(1)) {
      if (item.startsWith('--config=') || item.startsWith('--project=')) boundedToken(item);
      else boundedToken(item, { path: true, glob: true });
    }
  }
  if (profileId === 'node-script-standard-v1') {
    if (args.length < 1) invalid('NODE_SCRIPT_ARGUMENTS_INVALID');
    const script = boundedToken(args[0], { path: true });
    if (
      !script.endsWith('.mjs') ||
      (!script.startsWith('scripts/') && !script.startsWith('tools/'))
    )
      invalid('NODE_SCRIPT_ARGUMENTS_INVALID');
    if (FIXED_RELEASE_NODE_PATHS.has(script)) invalid('NODE_SCRIPT_FIXED_OWNER_REQUIRED');
  }
  if (
    profileId === 'generated-artifact-check-v1' &&
    (args.length !== 1 || !['locales', 'manifests'].includes(args[0]))
  )
    invalid('GENERATED_ARTIFACT_ARGUMENTS_INVALID');
  if (profileId === 'fixture-v1') {
    const [mode, first, second, extra] = args;
    if (extra !== undefined) invalid('FIXTURE_ARGUMENTS_INVALID');
    if (mode === 'success' && second === undefined) return args;
    if (['descriptors', 'close-extra'].includes(mode) && first === undefined) return args;
    if (mode === 'exit' && /^\d{1,3}$/u.test(first ?? '')) return args;
    if (mode === 'signal' && ['SIGINT', 'SIGTERM'].includes(first)) return args;
    if (
      ['delay', 'ignore-term', 'hold-pipe'].includes(mode) &&
      (first === undefined || /^\d{1,5}$/u.test(first))
    )
      return args;
    if (
      mode === 'overflow' &&
      ['o', 'e', '4', '5'].includes(first) &&
      /^\d{1,7}$/u.test(second ?? '')
    )
      return args;
    invalid('FIXTURE_ARGUMENTS_INVALID');
  }
  return args;
}

export function parseManagedCommandInvocationArgv(argv) {
  if (!Array.isArray(argv) || argv[0] !== 'node') invalid('LAUNCHER_INVALID');
  const launcher = argv[1]?.replaceAll('\\', '/');
  if (launcher === 'scripts/run-bounded-command.mjs') {
    if (argv[2] !== '--profile' || typeof argv[3] !== 'string') invalid('CONTROL_ARGUMENT_INVALID');
    const separatorPresent = argv[4] === '--';
    if (argv.length > 4 && !separatorPresent) invalid('SEPARATOR_INVALID');
    const argumentsList = separatorPresent ? argv.slice(5) : [];
    validateProfileArguments(argv[3], argumentsList);
    return deepFreeze({
      kind: 'profile',
      profileId: argv[3],
      arguments: [...argumentsList],
      separatorPresent
    });
  }
  const row = DIRECT_ROOT_COORDINATOR_GRAMMARS.find((entry) => entry.path === launcher);
  if (!row) invalid('LAUNCHER_INVALID');
  const args = argv.slice(2);
  if (row.grammar === 'none' && args.length !== 0) invalid('COORDINATOR_ARGUMENTS_INVALID');
  if (
    row.grammar === 'browser-shards-v1' &&
    (args.length !== 1 || !['e2e', 'visual', 'bundled'].includes(args[0]))
  )
    invalid('COORDINATOR_ARGUMENTS_INVALID');
  if (row.grammar === 'test-shards-v1') {
    const [suite, shard, extra] = args;
    if (!['unit', 'e2e'].includes(suite) || extra !== undefined)
      invalid('COORDINATOR_ARGUMENTS_INVALID');
    if (shard && !(suite === 'unit' ? UNIT_SHARDS : E2E_SHARDS).has(shard))
      invalid('COORDINATOR_ARGUMENTS_INVALID');
  }
  return deepFreeze({ kind: 'coordinator', coordinatorId: launcher, arguments: [...args] });
}

function contained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function regularFile(path, root = REPOSITORY_ROOT) {
  const absolute = resolve(root, path);
  const canonical = realpathSync(absolute);
  const stats = lstatSync(absolute);
  if (
    !contained(realpathSync(root), canonical) ||
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.nlink !== 1 ||
    stats.uid !== process.getuid()
  )
    invalid('EXECUTABLE_IDENTITY_INVALID');
  return canonical;
}

function trackedOrStaged(relativePath) {
  try {
    execFileSync('/usr/bin/git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd: REPOSITORY_ROOT,
      stdio: 'ignore',
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }
    });
  } catch {
    invalid('SOURCE_NOT_TRACKED');
  }
}

function fixedTrackedFile(relativePath) {
  trackedOrStaged(relativePath);
  return regularFile(relativePath);
}

function lintStagedPath() {
  const directory = resolve(REPOSITORY_ROOT, 'node_modules/.bin');
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink() || stats.uid !== process.getuid()) {
    invalid('LINT_STAGED_BIN_DIRECTORY_INVALID');
  }
  return `${dirname(process.execPath)}:${realpathSync(directory)}:/usr/bin:/bin`;
}

function packageProjection() {
  const packageJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  const lockJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, 'package-lock.json'), 'utf8'));
  return { packageJson, lockJson };
}

function resolveLockedBin(name) {
  const identity = LOCKED_PACKAGES[name];
  const rootName = identity.rootName ?? name;
  const packageName = identity.packageName ?? name;
  const { packageJson, lockJson } = packageProjection();
  const lockRow = lockJson.packages?.[`node_modules/${packageName}`];
  const installedPackagePath = resolve(REPOSITORY_ROOT, `node_modules/${packageName}/package.json`);
  const installedPackageBytes = readFileSync(installedPackagePath);
  const installedPackage = JSON.parse(installedPackageBytes);
  if (
    packageJson.devDependencies?.[rootName] !== identity.rootSpec ||
    lockJson.packages?.['']?.devDependencies?.[rootName] !== identity.rootSpec ||
    lockRow?.version !== identity.version ||
    installedPackage.version !== identity.version
  )
    invalid('LOCK_IDENTITY_INVALID');
  const binRelative = (
    typeof installedPackage.bin === 'string'
      ? installedPackage.bin
      : installedPackage.bin?.[identity.binName]
  )?.replace(/^\.\//u, '');
  const lockBinRelative = (
    typeof lockRow.bin === 'string' ? lockRow.bin : lockRow.bin?.[identity.binName]
  )?.replace(/^\.\//u, '');
  if (typeof binRelative !== 'string' || lockBinRelative !== binRelative)
    invalid('BIN_METADATA_INVALID');
  const binPath = regularFile(`node_modules/${packageName}/${binRelative}`);
  if (identity.packageSha256 && sha256Buffer(installedPackageBytes) !== identity.packageSha256)
    invalid('PACKAGE_DIGEST_INVALID');
  if (identity.binSha256 && sha256Buffer(readFileSync(binPath)) !== identity.binSha256)
    invalid('BIN_DIGEST_INVALID');
  return binPath;
}

const PASS_ENV = new Set([
  'BUILD_DIST_DIR',
  'CI',
  'GITHUB_ACTIONS',
  'GITHUB_EVENT_NAME',
  'GITHUB_JOB',
  'GITHUB_REF',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_RUN_ID',
  'GITHUB_SHA',
  'GITHUB_OUTPUT',
  'ImageOS',
  'ImageVersion',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PLAYWRIGHT_DIST_DIR',
  'PLAYWRIGHT_HTML_REPORT_DIR',
  'PLAYWRIGHT_OUTPUT_DIR',
  'PLAYWRIGHT_SKIP_WEB_SERVER_BUILD',
  'PLAYWRIGHT_WEB_SERVER_PORT',
  'RUNNER_ARCH',
  'RUNNER_OS',
  'RUNNER_TEMP',
  'ZENDIO_JOB_CLASS',
  'ZENDIO_JOB_TIMEOUT_MINUTES',
  'ZENDIO_RUNNER_ARCH',
  'ZENDIO_RUNNER_ENVIRONMENT',
  'ZENDIO_RUNNER_OS'
]);

function isVerifiedNpmLifecycle(environment) {
  try {
    const npm = detectNpmCommand({ repositoryRoot: REPOSITORY_ROOT, environment: {} });
    const { packageJson } = packageProjection();
    const event = environment.npm_lifecycle_event;
    const script = typeof event === 'string' ? packageJson.scripts?.[event] : undefined;
    return (
      typeof script === 'string' &&
      environment.npm_command === 'run-script' &&
      environment.npm_config_npm_version === npm.version &&
      environment.npm_execpath === npm.cliPath &&
      environment.npm_node_execpath === npm.nodePath &&
      environment.NODE === npm.nodePath &&
      environment.npm_package_json === resolve(REPOSITORY_ROOT, 'package.json') &&
      environment.npm_package_name === packageJson.name &&
      environment.npm_package_version === packageJson.version &&
      environment.npm_lifecycle_script === script &&
      environment.INIT_CWD === REPOSITORY_ROOT &&
      environment.PWD === REPOSITORY_ROOT
    );
  } catch {
    return false;
  }
}

export function buildClosedCommandEnvironment(environment = process.env, additions = {}) {
  for (const key of Object.keys(environment)) {
    const lower = key.toLowerCase();
    const emptyNpmNoProxy =
      key === 'npm_config_noproxy' &&
      environment[key] === '' &&
      isVerifiedNpmLifecycle(environment);
    if (
      !emptyNpmNoProxy &&
      ([
        'node_options',
        'husky',
        'quality_concurrency',
        'test_shard_concurrency',
        'browser_test_concurrency'
      ].includes(lower) ||
        lower.includes('preload') ||
        lower.includes('loader') ||
        lower.includes('proxy') ||
        lower.includes('certificate') ||
        lower === 'node_extra_ca_certs' ||
        lower === 'ssl_cert_file')
    )
      invalid('ENVIRONMENT_FORBIDDEN');
  }
  const result = {
    HOME: typeof environment.HOME === 'string' ? environment.HOME : dirname(process.execPath),
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`
  };
  if (typeof environment.TMPDIR === 'string') result.TMPDIR = environment.TMPDIR;
  for (const key of PASS_ENV)
    if (typeof environment[key] === 'string') result[key] = environment[key];
  return Object.freeze({ ...result, ...additions });
}

const CI_JOB_TIMEOUTS = deepFreeze({
  'static-preflight-v1': 60,
  'package-extension-v1': 35,
  'generic-v1': 30,
  'browser-v1': 60,
  'chrome-prepare-v1': 75,
  'chrome-publish-v1': 60,
  'firefox-prepare-v1': 120,
  'firefox-submit-v1': 90
});

export const R03_CI_JOB_SEQUENCE_RESERVATIONS = deepFreeze({
  'chrome-prepare-v1': [
    { owner: 'github-ci-install-v1', fullMs: 640_000 },
    { owner: 'release-runtime-check-v1', fullMs: 190_000 },
    { owner: 'release-provenance-v1:prepare', fullMs: 190_000 },
    { owner: 'isolated-build-v1', fullMs: 640_000 },
    { owner: 'chrome-prepare-v1', fullMs: 730_000 },
    { owner: 'release-job-outputs-v1', fullMs: 70_000 },
    { owner: 'platform:upload-artifact-v1', fullMs: 0 },
    { owner: 'release-provenance-v1:artifact-id', fullMs: 190_000 },
    { owner: 'release-provenance-v1:artifact-digest', fullMs: 190_000 },
    { owner: 'runner-finalization-v1', fullMs: 120_000 }
  ],
  'firefox-prepare-v1': [
    { owner: 'github-ci-install-v1', fullMs: 640_000 },
    { owner: 'release-runtime-check-v1', fullMs: 190_000 },
    { owner: 'release-provenance-v1:prepare', fullMs: 190_000 },
    { owner: 'platform:playwright-host-deps-v1', fullMs: 0 },
    { owner: 'playwright-browser-install-v1', fullMs: 940_000 },
    { owner: 'firefox-geckodriver-provision-v1', fullMs: 910_000 },
    { owner: 'isolated-build-v1', fullMs: 640_000 },
    { owner: 'firefox-prepare-v1', fullMs: 1_210_000 },
    { owner: 'release-job-outputs-v1', fullMs: 70_000 },
    { owner: 'firefox-verify-v1', fullMs: 490_000 },
    { owner: 'firefox-smoke-v1', fullMs: 450_000 },
    { owner: 'platform:upload-artifact-v1', fullMs: 0 },
    { owner: 'release-provenance-v1:artifact-id', fullMs: 190_000 },
    { owner: 'release-provenance-v1:artifact-digest', fullMs: 190_000 },
    { owner: 'runner-finalization-v1', fullMs: 120_000 }
  ],
  'chrome-publish-v1': [
    { owner: 'github-ci-install-v1', fullMs: 640_000 },
    { owner: 'platform:download-artifact-v1', fullMs: 0 },
    { owner: 'chrome-verify-v1', fullMs: 310_000 },
    { owner: 'release-provenance-v1:reauthorize', fullMs: 190_000 },
    { owner: 'release-state-init-v1', fullMs: 70_000 },
    { owner: 'chrome-publish-v1', fullMs: 730_000 },
    { owner: 'release-state-check-v1', fullMs: 70_000 },
    { owner: 'platform:upload-state-v1', fullMs: 0 },
    { owner: 'runner-finalization-v1', fullMs: 120_000 }
  ],
  'firefox-submit-v1': [
    { owner: 'github-ci-install-v1', fullMs: 640_000 },
    { owner: 'platform:download-artifact-v1', fullMs: 0 },
    { owner: 'firefox-verify-v1', fullMs: 490_000 },
    { owner: 'release-provenance-v1:reauthorize', fullMs: 190_000 },
    { owner: 'release-state-init-v1', fullMs: 70_000 },
    { owner: 'firefox-submit-v1', fullMs: 2_710_000 },
    { owner: 'release-state-check-v1', fullMs: 70_000 },
    { owner: 'platform:upload-state-v1', fullMs: 0 },
    { owner: 'runner-finalization-v1', fullMs: 120_000 }
  ]
});

const R03_CI_JOB_CLASSES = new Set([
  'chrome-prepare-v1',
  'chrome-publish-v1',
  'firefox-prepare-v1',
  'firefox-submit-v1'
]);
const PROTECTED_CI_JOB_CLASSES = new Set(['chrome-publish-v1', 'firefox-submit-v1']);

const CI_ENVIRONMENT_KEYS = [
  'CI',
  'GITHUB_ACTIONS',
  'GITHUB_JOB',
  'GITHUB_OUTPUT',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_RUN_ID',
  'ImageOS',
  'ImageVersion',
  'RUNNER_ARCH',
  'RUNNER_OS',
  'RUNNER_TEMP',
  'ZENDIO_RUNNER_ENVIRONMENT',
  'ZENDIO_JOB_CLASS',
  'ZENDIO_JOB_TIMEOUT_MINUTES'
];

const PROTECTED_EXPECTED_KEYS = [
  'ZENDIO_EXPECTED_RELEASE_SHA',
  'ZENDIO_EXPECTED_RELEASE_TREE',
  'ZENDIO_EXPECTED_PACKAGE_SHA256',
  'ZENDIO_EXPECTED_LOCK_SHA256'
];

function requiredEnvironment(environment, name, pattern) {
  const value = environment[name];
  if (typeof value !== 'string' || !pattern.test(value)) invalid('CI_ENVIRONMENT_INVALID');
  return value;
}

function lstatOrNull(path, lstatOperation = lstatSync) {
  try {
    return lstatOperation(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function requireOwnedRegular(path, root, operations) {
  const stats = operations.lstatOperation(path);
  const canonical = operations.realpathOperation(path);
  if (
    !contained(root, canonical) ||
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.uid !== operations.currentUid ||
    stats.nlink !== 1
  )
    invalid('CI_FILE_INVALID');
  return { canonical, stats };
}

function defaultUptimeCentiseconds() {
  const [raw] = readFileSync('/proc/uptime', 'utf8').trim().split(/\s+/u);
  if (!/^\d{1,12}\.\d{1,32}$/u.test(raw ?? '')) invalid('CI_UPTIME_INVALID');
  const [seconds, fraction] = raw.split('.');
  return Number(seconds) * 100 + Number(`${fraction}00`.slice(0, 2));
}

function defaultGitValue(args) {
  return execFileSync('/usr/bin/git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }
  }).trim();
}

function ciAttemptName(jobClass, runId, runAttempt, job) {
  if (jobClass === 'chrome-prepare-v1') return `zendio-chrome-${runId}-${runAttempt}`;
  if (jobClass === 'firefox-prepare-v1') return `zendio-firefox-${runId}-${runAttempt}`;
  if (jobClass === 'chrome-publish-v1') return `zendio-chrome-publish-${runId}-${runAttempt}`;
  if (jobClass === 'firefox-submit-v1') return `zendio-firefox-submit-${runId}-${runAttempt}`;
  return `zendio-ci-node-${runId}-${runAttempt}-${job}`;
}

function prepareGithubCiInstall(environment, injected = {}) {
  buildClosedCommandEnvironment(environment);
  const operations = {
    currentUid: process.getuid(),
    chmodOperation: chmodSync,
    lstatOperation: lstatSync,
    mkdirOperation: mkdirSync,
    readFileOperation: readFileSync,
    readDirectoryOperation: readdirSync,
    realpathOperation: realpathSync,
    writeFileOperation: writeFileSync,
    readUptimeCentiseconds: defaultUptimeCentiseconds,
    gitValueOperation: defaultGitValue,
    ...injected
  };
  if (operations.readDirectoryOperation(REPOSITORY_ROOT).some((name) => name.startsWith('.env')))
    invalid('CI_ENV_FILE_FORBIDDEN');
  const controlled = new Map(CI_ENVIRONMENT_KEYS.map((key) => [key.toLowerCase(), key]));
  for (const key of Object.keys(environment)) {
    const canonical = controlled.get(key.toLowerCase());
    if (canonical && key !== canonical) invalid('CI_ENVIRONMENT_INVALID');
    const protectedCanonical = PROTECTED_EXPECTED_KEYS.find(
      (expected) => expected.toLowerCase() === key.toLowerCase()
    );
    if (protectedCanonical && key !== protectedCanonical) invalid('CI_PROTECTED_INPUT_INVALID');
  }
  if (environment.CI !== 'true' || environment.GITHUB_ACTIONS !== 'true')
    invalid('CI_ENVIRONMENT_INVALID');
  const runId = requiredEnvironment(environment, 'GITHUB_RUN_ID', /^[1-9][0-9]{0,19}$/u);
  const runAttempt = requiredEnvironment(environment, 'GITHUB_RUN_ATTEMPT', /^[1-9][0-9]{0,9}$/u);
  const job = requiredEnvironment(environment, 'GITHUB_JOB', /^[A-Za-z0-9_-]{1,128}$/u);
  const jobClass = requiredEnvironment(environment, 'ZENDIO_JOB_CLASS', /^[a-z0-9-]{1,64}$/u);
  const timeout = requiredEnvironment(environment, 'ZENDIO_JOB_TIMEOUT_MINUTES', /^[1-9][0-9]*$/u);
  if (String(CI_JOB_TIMEOUTS[jobClass]) !== timeout) invalid('CI_JOB_BUDGET_INVALID');
  if (R03_CI_JOB_CLASSES.has(jobClass)) {
    if (runAttempt !== '1' || environment.ZENDIO_RUNNER_ENVIRONMENT !== 'github-hosted')
      invalid('CI_RELEASE_JOB_INVALID');
  } else if (environment.ZENDIO_RUNNER_ENVIRONMENT !== undefined) {
    invalid('CI_RELEASE_JOB_INVALID');
  }
  const protectedJob = PROTECTED_CI_JOB_CLASSES.has(jobClass);
  for (const key of PROTECTED_EXPECTED_KEYS) {
    const present = Object.hasOwn(environment, key);
    if (present !== protectedJob) invalid('CI_PROTECTED_INPUT_INVALID');
  }
  if (protectedJob) {
    const expected = {
      ZENDIO_EXPECTED_RELEASE_SHA: operations.gitValueOperation(['rev-parse', 'HEAD']),
      ZENDIO_EXPECTED_RELEASE_TREE: operations.gitValueOperation(['rev-parse', 'HEAD^{tree}']),
      ZENDIO_EXPECTED_PACKAGE_SHA256: sha256Buffer(
        operations.readFileOperation(join(REPOSITORY_ROOT, 'package.json'))
      ),
      ZENDIO_EXPECTED_LOCK_SHA256: sha256Buffer(
        operations.readFileOperation(join(REPOSITORY_ROOT, 'package-lock.json'))
      )
    };
    for (const [key, value] of Object.entries(expected)) {
      const pattern =
        key === 'ZENDIO_EXPECTED_RELEASE_SHA' || key === 'ZENDIO_EXPECTED_RELEASE_TREE'
          ? /^[0-9a-f]{40}$/u
          : /^[0-9a-f]{64}$/u;
      if (!pattern.test(environment[key] ?? '') || environment[key] !== value)
        invalid('CI_PROTECTED_INPUT_INVALID');
    }
  }
  if (
    environment.RUNNER_OS !== 'Linux' ||
    environment.RUNNER_ARCH !== 'X64' ||
    environment.ImageOS !== 'ubuntu24' ||
    !/^[A-Za-z0-9._-]{1,128}$/u.test(environment.ImageVersion ?? '')
  )
    invalid('CI_RUNNER_INVALID');
  const rawRunnerTemp = requiredEnvironment(environment, 'RUNNER_TEMP', /^\/.{0,4095}$/u);
  if (resolve(rawRunnerTemp) !== rawRunnerTemp) invalid('CI_RUNNER_TEMP_INVALID');
  const runnerStats = operations.lstatOperation(rawRunnerTemp);
  const runnerTemp = operations.realpathOperation(rawRunnerTemp);
  if (
    runnerTemp !== rawRunnerTemp ||
    !runnerStats.isDirectory() ||
    runnerStats.isSymbolicLink() ||
    runnerStats.uid !== operations.currentUid
  )
    invalid('CI_RUNNER_TEMP_INVALID');
  const stampPath = join(runnerTemp, `zendio-command-start-${runId}-${runAttempt}-${job}.receipt`);
  const stamp = requireOwnedRegular(stampPath, runnerTemp, operations);
  if ((stamp.stats.mode & 0o777) !== 0o600) invalid('CI_STAMP_INVALID');
  const stampBytes = operations.readFileOperation(stamp.canonical);
  if (!Buffer.isBuffer(stampBytes) || stampBytes.length > 4096) invalid('CI_STAMP_INVALID');
  const lines = stampBytes.toString('utf8').split('\n');
  const startCentiseconds = lines[10];
  const expectedLines = [
    'zendio-ci-command-start-v1',
    runId,
    runAttempt,
    job,
    jobClass,
    timeout,
    'Linux',
    'X64',
    'ubuntu24',
    environment.ImageVersion,
    startCentiseconds,
    ''
  ];
  if (
    JSON.stringify(lines) !== JSON.stringify(expectedLines) ||
    !/^[0-9]{1,14}$/u.test(startCentiseconds ?? '')
  )
    invalid('CI_STAMP_INVALID');
  const elapsedCentiseconds = operations.readUptimeCentiseconds() - Number(startCentiseconds);
  const availableCentiseconds = Number(timeout) * 60 * 100 - 3_000 - elapsedCentiseconds - 9_000;
  const installFullCentiseconds =
    (COMMAND_LIMITS.install.activeMs +
      COMMAND_LIMITS.install.termMs +
      COMMAND_LIMITS.install.killMs) /
    10;
  const releaseSequence = R03_CI_JOB_SEQUENCE_RESERVATIONS[jobClass];
  const releaseSequenceCentiseconds = releaseSequence
    ? releaseSequence.reduce((total, row) => total + row.fullMs / 10, 0)
    : null;
  const remainingCentiseconds = Number(timeout) * 60 * 100 - elapsedCentiseconds;
  if (
    elapsedCentiseconds < 0 ||
    (releaseSequenceCentiseconds === null
      ? availableCentiseconds < installFullCentiseconds
      : remainingCentiseconds < releaseSequenceCentiseconds)
  )
    invalid('CI_JOB_BUDGET_INVALID');
  if (!operations.readFileOperation(stamp.canonical).equals(stampBytes))
    invalid('CI_STAMP_CHANGED');
  const outputPath = requiredEnvironment(environment, 'GITHUB_OUTPUT', /^\/.{0,4095}$/u);
  const output = requireOwnedRegular(outputPath, runnerTemp, operations);
  if ((output.stats.mode & 0o022) !== 0) invalid('CI_OUTPUT_INVALID');
  const attemptRoot = join(runnerTemp, ciAttemptName(jobClass, runId, runAttempt, job));
  if (lstatOrNull(attemptRoot, operations.lstatOperation)) invalid('CI_ATTEMPT_REUSED');
  operations.mkdirOperation(attemptRoot, { mode: 0o700 });
  operations.chmodOperation(attemptRoot, 0o700);
  operations.mkdirOperation(join(attemptRoot, 'install'), { mode: 0o700 });
  operations.chmodOperation(join(attemptRoot, 'install'), 0o700);
  operations.writeFileOperation(join(attemptRoot, 'install/npm-userconfig'), '', {
    flag: 'wx',
    mode: 0o600
  });
  operations.writeFileOperation(join(attemptRoot, 'install/npm-globalconfig'), '', {
    flag: 'wx',
    mode: 0o600
  });
  operations.chmodOperation(join(attemptRoot, 'install/npm-userconfig'), 0o600);
  operations.chmodOperation(join(attemptRoot, 'install/npm-globalconfig'), 0o600);
  const installRoot = operations.realpathOperation(join(attemptRoot, 'install'));
  const userconfig = operations.realpathOperation(join(installRoot, 'npm-userconfig'));
  const globalconfig = operations.realpathOperation(join(installRoot, 'npm-globalconfig'));
  return deepFreeze({
    attemptRoot: operations.realpathOperation(attemptRoot),
    installRoot,
    userconfig,
    globalconfig,
    jobClass,
    protectedJob,
    githubOutputPath: output.canonical,
    stampPath: stamp.canonical,
    stampDevice: String(stamp.stats.dev),
    stampInode: String(stamp.stats.ino),
    stampMode: String(stamp.stats.mode & 0o777),
    stampSha256: sha256Buffer(stampBytes),
    outputDevice: String(output.stats.dev),
    outputInode: String(output.stats.ino),
    outputMode: String(output.stats.mode & 0o777),
    expectedAttemptEntries: ['install'],
    expectedInstallEntries: ['npm-globalconfig', 'npm-userconfig']
  });
}

function prepareLocalInstall(environment, injected = {}) {
  buildClosedCommandEnvironment(environment);
  const operations = {
    currentUid: process.getuid(),
    chmodOperation: chmodSync,
    lstatOperation: lstatSync,
    mkdirOperation: mkdirSync,
    readDirectoryOperation: readdirSync,
    realpathOperation: realpathSync,
    writeFileOperation: writeFileSync,
    ...injected
  };
  const localKey = 'ZENDIO_LOCAL_ATTEMPT_ROOT';
  for (const key of Object.keys(environment)) {
    if (key.toLowerCase() === localKey.toLowerCase() && key !== localKey)
      invalid('LOCAL_ATTEMPT_ROOT_INVALID');
    if (
      ['ci', 'github_actions', 'zendio_runner_environment', 'imageos', 'imageversion'].includes(
        key.toLowerCase()
      ) ||
      key.toLowerCase().startsWith('runner_')
    )
      invalid('LOCAL_ENVIRONMENT_INVALID');
  }
  const rawRoot = environment[localKey];
  if (typeof rawRoot !== 'string' || !isAbsolute(rawRoot) || resolve(rawRoot) !== rawRoot)
    invalid('LOCAL_ATTEMPT_ROOT_INVALID');
  const stats = operations.lstatOperation(rawRoot);
  const root = operations.realpathOperation(rawRoot);
  if (
    root !== rawRoot ||
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    stats.uid !== operations.currentUid ||
    (stats.mode & 0o777) !== 0o700 ||
    operations.readDirectoryOperation(root).length !== 0
  )
    invalid('LOCAL_ATTEMPT_ROOT_INVALID');
  const installRoot = join(root, 'install');
  operations.mkdirOperation(installRoot, { mode: 0o700 });
  operations.chmodOperation(installRoot, 0o700);
  const userconfig = join(installRoot, 'npm-userconfig');
  const globalconfig = join(installRoot, 'npm-globalconfig');
  operations.writeFileOperation(userconfig, '', { flag: 'wx', mode: 0o600 });
  operations.writeFileOperation(globalconfig, '', { flag: 'wx', mode: 0o600 });
  operations.chmodOperation(userconfig, 0o600);
  operations.chmodOperation(globalconfig, 0o600);
  return deepFreeze({
    attemptRoot: root,
    installRoot: operations.realpathOperation(installRoot),
    userconfig: operations.realpathOperation(userconfig),
    globalconfig: operations.realpathOperation(globalconfig)
  });
}

function profileArgumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function assertOwnedDirectory(path, mode = 0o700) {
  const stats = lstatSync(path);
  const canonical = realpathSync(path);
  if (
    canonical !== path ||
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    stats.uid !== process.getuid() ||
    (stats.mode & 0o777) !== mode
  )
    invalid('RELEASE_DIRECTORY_INVALID');
  return canonical;
}

function releaseAttemptRoot(environment) {
  for (const key of Object.keys(environment)) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith('npm_config_') &&
      !['npm_config_userconfig', 'npm_config_globalconfig'].includes(lower)
    )
      invalid('NPM_CONFIG_AUTHORITY_INVALID');
    if (lower === 'npm_config_userconfig' && key !== 'NPM_CONFIG_USERCONFIG')
      invalid('NPM_CONFIG_AUTHORITY_INVALID');
    if (lower === 'npm_config_globalconfig' && key !== 'NPM_CONFIG_GLOBALCONFIG')
      invalid('NPM_CONFIG_AUTHORITY_INVALID');
  }
  if (environment.CI === 'true' || environment.GITHUB_ACTIONS === 'true') {
    const runnerTemp = environment.RUNNER_TEMP;
    const runId = environment.GITHUB_RUN_ID;
    const runAttempt = environment.GITHUB_RUN_ATTEMPT;
    const job = environment.GITHUB_JOB;
    const jobClass = environment.ZENDIO_JOB_CLASS;
    if (
      typeof runnerTemp !== 'string' ||
      typeof runId !== 'string' ||
      typeof runAttempt !== 'string' ||
      typeof job !== 'string' ||
      typeof jobClass !== 'string'
    )
      invalid('CI_ENVIRONMENT_INVALID');
    return assertOwnedDirectory(
      join(realpathSync(runnerTemp), ciAttemptName(jobClass, runId, runAttempt, job))
    );
  }
  const declared = environment.ZENDIO_LOCAL_ATTEMPT_ROOT;
  if (declared !== undefined) {
    if (typeof declared !== 'string' || !isAbsolute(declared) || resolve(declared) !== declared)
      invalid('LOCAL_ATTEMPT_ROOT_INVALID');
    const root = assertOwnedDirectory(declared);
    const hasUserconfig = environment.NPM_CONFIG_USERCONFIG !== undefined;
    const hasGlobalconfig = environment.NPM_CONFIG_GLOBALCONFIG !== undefined;
    if (hasUserconfig !== hasGlobalconfig) invalid('NPM_CONFIG_AUTHORITY_INVALID');
    if (hasUserconfig) {
      const configs = attemptNpmConfigEnvironment(root);
      if (
        environment.NPM_CONFIG_USERCONFIG !== configs.NPM_CONFIG_USERCONFIG ||
        environment.NPM_CONFIG_GLOBALCONFIG !== configs.NPM_CONFIG_GLOBALCONFIG
      )
        invalid('NPM_CONFIG_AUTHORITY_INVALID');
    }
    return root;
  }
  const userconfig = environment.NPM_CONFIG_USERCONFIG;
  const globalconfig = environment.NPM_CONFIG_GLOBALCONFIG;
  if (
    typeof userconfig !== 'string' ||
    typeof globalconfig !== 'string' ||
    !isAbsolute(userconfig) ||
    !isAbsolute(globalconfig) ||
    resolve(userconfig) !== userconfig ||
    resolve(globalconfig) !== globalconfig ||
    basename(userconfig) !== 'npm-userconfig' ||
    basename(globalconfig) !== 'npm-globalconfig' ||
    dirname(userconfig) !== dirname(globalconfig) ||
    basename(dirname(userconfig)) !== 'install'
  )
    invalid('NPM_CONFIG_AUTHORITY_INVALID');
  const root = assertOwnedDirectory(dirname(dirname(userconfig)));
  const configs = attemptNpmConfigEnvironment(root);
  if (
    configs.NPM_CONFIG_USERCONFIG !== userconfig ||
    configs.NPM_CONFIG_GLOBALCONFIG !== globalconfig
  )
    invalid('NPM_CONFIG_AUTHORITY_INVALID');
  return root;
}

const CHROME_STORE_KEYS = [
  'CWS_CLIENT_ID',
  'CWS_CLIENT_SECRET',
  'CWS_REFRESH_TOKEN',
  'CWS_EXTENSION_ID',
  'CWS_PUBLISHER_ID'
];
const FIREFOX_STORE_KEYS = ['WEB_EXT_API_KEY', 'WEB_EXT_API_SECRET'];
const ALL_STORE_KEYS = [...CHROME_STORE_KEYS, ...FIREFOX_STORE_KEYS];

function releaseProfileEnvironment(profileId, environment, additions = {}) {
  const allowedSecrets =
    profileId === 'chrome-publish-v1'
      ? CHROME_STORE_KEYS
      : profileId === 'firefox-submit-v1'
        ? FIREFOX_STORE_KEYS
        : [];
  for (const key of Object.keys(environment)) {
    const canonical = ALL_STORE_KEYS.find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase()
    );
    if (!canonical) continue;
    if (key !== canonical || !allowedSecrets.includes(canonical))
      invalid('STORE_CREDENTIAL_FORBIDDEN');
  }
  const secretEnvironment = {};
  for (const key of allowedSecrets) {
    const value = environment[key];
    if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > 4096)
      invalid('STORE_CREDENTIAL_INVALID');
    secretEnvironment[key] = value;
  }
  const gaEnvironment = {};
  if (
    [
      'release-runtime-check-v1',
      'isolated-build-v1',
      'chrome-prepare-v1',
      'firefox-prepare-v1'
    ].includes(profileId)
  ) {
    for (const key of [
      'ZENDIO_GA_MEASUREMENT_ID',
      'ZENDIO_GA_TRANSPORT_MODE',
      'ZENDIO_GA_PROXY_ENDPOINT'
    ]) {
      if (typeof environment[key] === 'string') gaEnvironment[key] = environment[key];
    }
  }
  return buildClosedCommandEnvironment(environment, {
    ...gaEnvironment,
    ...secretEnvironment,
    ...additions
  });
}

function requireReleaseJob(environment, acceptedJobClasses) {
  if (
    environment.CI !== 'true' ||
    environment.GITHUB_ACTIONS !== 'true' ||
    environment.GITHUB_RUN_ATTEMPT !== '1' ||
    environment.ZENDIO_RUNNER_ENVIRONMENT !== 'github-hosted' ||
    !acceptedJobClasses.includes(environment.ZENDIO_JOB_CLASS)
  )
    invalid('RELEASE_JOB_CONTEXT_INVALID');
  return releaseAttemptRoot(environment);
}

function validatedGithubOutput(environment) {
  if (typeof environment.GITHUB_OUTPUT !== 'string' || typeof environment.RUNNER_TEMP !== 'string')
    invalid('CI_OUTPUT_INVALID');
  const runnerTemp = realpathSync(environment.RUNNER_TEMP);
  const output = requireOwnedRegular(environment.GITHUB_OUTPUT, runnerTemp, {
    currentUid: process.getuid(),
    lstatOperation: lstatSync,
    realpathOperation: realpathSync
  });
  if ((output.stats.mode & 0o022) !== 0) invalid('CI_OUTPUT_INVALID');
  return output.canonical;
}

function requireLocalRelease(environment) {
  if (environment.CI !== undefined || environment.GITHUB_ACTIONS !== undefined)
    invalid('LOCAL_ENVIRONMENT_INVALID');
  return releaseAttemptRoot(environment);
}

function profileFixedScript(profileId) {
  const paths = {
    'chrome-dry-run-v1': 'scripts/publish-chrome-webstore.mjs',
    'chrome-prepare-v1': 'scripts/prepare-chrome-release.mjs',
    'chrome-publish-v1': 'scripts/publish-chrome-webstore.mjs',
    'chrome-verify-v1': 'scripts/verify-chrome-release.mjs',
    'firefox-prepare-v1': 'scripts/prepare-firefox-release.mjs',
    'firefox-geckodriver-provision-v1': 'scripts/provision-geckodriver.mjs',
    'firefox-smoke-v1': 'scripts/run-firefox-xpi-smoke.mjs',
    'firefox-submit-v1': 'scripts/submit-firefox-amo-release.mjs',
    'firefox-verify-v1': 'scripts/verify-firefox-release.mjs',
    'isolated-build-v1': 'scripts/utils/releasePublicBuildConfig.mjs',
    'release-runtime-check-v1': 'scripts/utils/releasePublicBuildConfig.mjs'
  };
  return paths[profileId];
}

function requireContainedArgument(root, value) {
  const candidate = resolve(value);
  if (!contained(root, candidate)) invalid('RELEASE_PATH_OUTSIDE_ATTEMPT');
  return candidate;
}

function attemptNpmConfigEnvironment(root) {
  assertOwnedDirectory(join(root, 'install'));
  const values = {};
  for (const [key, name] of [
    ['NPM_CONFIG_USERCONFIG', 'npm-userconfig'],
    ['NPM_CONFIG_GLOBALCONFIG', 'npm-globalconfig']
  ]) {
    const path = join(root, 'install', name);
    const stats = lstatSync(path);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.uid !== process.getuid() ||
      stats.nlink !== 1 ||
      (stats.mode & 0o777) !== 0o600 ||
      readFileSync(path).length !== 0
    )
      invalid('NPM_CONFIG_IDENTITY_INVALID');
    values[key] = realpathSync(path);
  }
  return values;
}

function exactAttemptConfigEnvironment(root, environment) {
  const configs = attemptNpmConfigEnvironment(root);
  if (
    environment.NPM_CONFIG_USERCONFIG !== configs.NPM_CONFIG_USERCONFIG ||
    environment.NPM_CONFIG_GLOBALCONFIG !== configs.NPM_CONFIG_GLOBALCONFIG
  )
    invalid('NPM_CONFIG_IDENTITY_INVALID');
  return configs;
}

function attemptConfigAuthority(environment, { required = false } = {}) {
  const authorityIntent =
    required ||
    environment.ZENDIO_LOCAL_ATTEMPT_ROOT !== undefined ||
    Object.keys(environment).some((key) =>
      ['npm_config_userconfig', 'npm_config_globalconfig'].includes(key.toLowerCase())
    );
  if (!authorityIntent) return null;
  for (const key of Object.keys(environment)) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith('npm_config_') &&
      !['npm_config_userconfig', 'npm_config_globalconfig'].includes(lower)
    )
      invalid('NPM_CONFIG_AUTHORITY_INVALID');
    if (lower === 'npm_config_userconfig' && key !== 'NPM_CONFIG_USERCONFIG')
      invalid('NPM_CONFIG_AUTHORITY_INVALID');
    if (lower === 'npm_config_globalconfig' && key !== 'NPM_CONFIG_GLOBALCONFIG')
      invalid('NPM_CONFIG_AUTHORITY_INVALID');
  }
  const hasUserconfig = environment.NPM_CONFIG_USERCONFIG !== undefined;
  const hasGlobalconfig = environment.NPM_CONFIG_GLOBALCONFIG !== undefined;
  if (!hasUserconfig && !hasGlobalconfig) {
    if (environment.ZENDIO_LOCAL_ATTEMPT_ROOT === undefined) {
      if (required) invalid('NPM_CONFIG_AUTHORITY_INVALID');
      return null;
    }
    const attemptRoot = releaseAttemptRoot(environment);
    const configs = attemptNpmConfigEnvironment(attemptRoot);
    return {
      attemptRoot,
      userconfig: configs.NPM_CONFIG_USERCONFIG,
      globalconfig: configs.NPM_CONFIG_GLOBALCONFIG,
      environment: configs,
      commandContext: {
        attemptConfigAuthority: true,
        attemptRoot,
        userconfig: configs.NPM_CONFIG_USERCONFIG,
        globalconfig: configs.NPM_CONFIG_GLOBALCONFIG
      }
    };
  }
  if (!hasUserconfig || !hasGlobalconfig) invalid('NPM_CONFIG_AUTHORITY_INVALID');
  const attemptRoot = releaseAttemptRoot(environment);
  const configs = exactAttemptConfigEnvironment(attemptRoot, environment);
  return {
    attemptRoot,
    userconfig: configs.NPM_CONFIG_USERCONFIG,
    globalconfig: configs.NPM_CONFIG_GLOBALCONFIG,
    environment: configs,
    commandContext: {
      attemptConfigAuthority: true,
      attemptRoot,
      userconfig: configs.NPM_CONFIG_USERCONFIG,
      globalconfig: configs.NPM_CONFIG_GLOBALCONFIG
    }
  };
}

function releaseAuditPathAuthority(args, environment) {
  const [name, separator, ...forwarded] = args;
  const releaseAudit = RELEASE_AUDIT_NPM_SCRIPTS.has(name) && separator !== undefined;
  const authority = attemptConfigAuthority(environment, { required: releaseAudit });
  if (!releaseAudit) return authority;
  const paths = [forwarded[1], ...(forwarded.length === 4 ? [forwarded[3]] : [])];
  for (const path of paths) requireContainedArgument(authority.attemptRoot, path);
  return authority;
}

function firefoxPhaseReceiptPath(root, phase) {
  return join(root, 'receipts', `firefox-playwright-${phase}.json`);
}

function firefoxPlaywrightPhaseEnvironment(environment, hostDependencies) {
  if (environment.CI !== 'true' || environment.GITHUB_ACTIONS !== 'true')
    invalid('PLAYWRIGHT_PHASE_CONTEXT_INVALID');
  const runId = requiredEnvironment(environment, 'GITHUB_RUN_ID', /^[1-9][0-9]{0,19}$/u);
  const runAttempt = requiredEnvironment(environment, 'GITHUB_RUN_ATTEMPT', /^[1-9][0-9]{0,9}$/u);
  const job = requiredEnvironment(environment, 'GITHUB_JOB', /^[A-Za-z0-9_-]{1,128}$/u);
  let root;
  let executionClass;
  if (environment.ZENDIO_JOB_CLASS === 'firefox-prepare-v1') {
    root = requireReleaseJob(environment, ['firefox-prepare-v1']);
    executionClass = 'release';
  } else {
    if (environment.ZENDIO_JOB_CLASS !== undefined && environment.ZENDIO_JOB_CLASS !== 'browser-v1')
      invalid('PLAYWRIGHT_PHASE_CONTEXT_INVALID');
    const runnerTemp = environment.RUNNER_TEMP;
    if (
      typeof runnerTemp !== 'string' ||
      !isAbsolute(runnerTemp) ||
      resolve(runnerTemp) !== runnerTemp ||
      realpathSync(runnerTemp) !== runnerTemp
    )
      invalid('PLAYWRIGHT_PHASE_CONTEXT_INVALID');
    root = assertOwnedDirectory(
      join(runnerTemp, ciAttemptName('browser-v1', runId, runAttempt, job))
    );
    executionClass = 'ordinary-ci';
  }
  const policy = FIREFOX_EXECUTION_CLASSES[executionClass];
  if (
    policy.requireAttemptEnvironment
      ? environment.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT !== root
      : environment.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT !== undefined
  )
    invalid('PLAYWRIGHT_PHASE_ATTEMPT_ROOT_INVALID');
  const configs = exactAttemptConfigEnvironment(root, environment);
  const browsersPath = join(root, policy.browserRootBasename);
  if (environment.PLAYWRIGHT_BROWSERS_PATH !== browsersPath)
    invalid('PLAYWRIGHT_BROWSERS_PATH_INVALID');
  if (lstatOrNull(browsersPath)) invalid('PLAYWRIGHT_BROWSER_ROOT_REUSED');
  if (!hostDependencies) {
    mkdirSync(browsersPath, { mode: 0o700 });
    chmodSync(browsersPath, 0o700);
    assertOwnedDirectory(browsersPath);
    if (readdirSync(browsersPath).length !== 0) invalid('PLAYWRIGHT_BROWSER_ROOT_INVALID');
  }
  return {
    executionClass,
    attemptRoot: root,
    browsersPath,
    userconfig: configs.NPM_CONFIG_USERCONFIG,
    globalconfig: configs.NPM_CONFIG_GLOBALCONFIG,
    environment: {
      NPM_CONFIG_USERCONFIG: configs.NPM_CONFIG_USERCONFIG,
      NPM_CONFIG_GLOBALCONFIG: configs.NPM_CONFIG_GLOBALCONFIG,
      ...(policy.requireAttemptEnvironment ? { ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: root } : {}),
      PLAYWRIGHT_BROWSERS_PATH: browsersPath
    },
    phaseReceiptPath: firefoxPhaseReceiptPath(
      root,
      hostDependencies ? 'host-deps' : 'browser-install'
    ),
    requiredPhaseReceiptPath:
      !hostDependencies && executionClass === 'release'
        ? firefoxPhaseReceiptPath(root, 'host-deps')
        : undefined,
    sequenceOwner:
      executionClass === 'release'
        ? hostDependencies
          ? 'platform:playwright-host-deps-v1'
          : 'playwright-browser-install-v1'
        : undefined
  };
}

function firefoxReleaseConsumerEnvironment(profileId, environment, attemptRoot, transport) {
  const executionClass =
    profileId === 'firefox-verify-v1' && transport === 'github-artifact-v1'
      ? 'protected-verifier'
      : 'release';
  const policy = FIREFOX_EXECUTION_CLASSES[executionClass];
  const ciReleaseConsumer = executionClass === 'release' && environment.CI === 'true';
  const configs = exactAttemptConfigEnvironment(attemptRoot, environment);
  if (executionClass === 'protected-verifier') {
    if (
      environment.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT !== undefined ||
      environment.PLAYWRIGHT_BROWSERS_PATH !== undefined
    )
      invalid('PLAYWRIGHT_PROTECTED_VERIFIER_ISOLATION_INVALID');
    return {
      executionClass,
      attemptRoot,
      browsersPath: null,
      userconfig: configs.NPM_CONFIG_USERCONFIG,
      globalconfig: configs.NPM_CONFIG_GLOBALCONFIG,
      environment: {
        NPM_CONFIG_USERCONFIG: configs.NPM_CONFIG_USERCONFIG,
        NPM_CONFIG_GLOBALCONFIG: configs.NPM_CONFIG_GLOBALCONFIG
      }
    };
  }
  const browsersPath = join(attemptRoot, policy.browserRootBasename);
  if (
    environment.ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT !== attemptRoot ||
    environment.PLAYWRIGHT_BROWSERS_PATH !== browsersPath
  )
    invalid('PLAYWRIGHT_RELEASE_CONSUMER_BINDING_INVALID');
  assertOwnedDirectory(browsersPath);
  return {
    executionClass,
    attemptRoot,
    browsersPath,
    userconfig: configs.NPM_CONFIG_USERCONFIG,
    globalconfig: configs.NPM_CONFIG_GLOBALCONFIG,
    phaseReceiptPath: ciReleaseConsumer
      ? firefoxPhaseReceiptPath(attemptRoot, 'browser-install')
      : undefined,
    requiredPhaseReceiptPath: ciReleaseConsumer
      ? firefoxPhaseReceiptPath(attemptRoot, 'browser-install')
      : undefined,
    sequenceOwner: ciReleaseConsumer ? profileId : undefined,
    environment: {
      NPM_CONFIG_USERCONFIG: configs.NPM_CONFIG_USERCONFIG,
      NPM_CONFIG_GLOBALCONFIG: configs.NPM_CONFIG_GLOBALCONFIG,
      ZENDIO_PLAYWRIGHT_ATTEMPT_ROOT: attemptRoot,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath
    }
  };
}

function npmInvocation(args, limits) {
  const npm = detectNpmCommand({ repositoryRoot: REPOSITORY_ROOT, environment: {} });
  return { executable: npm.nodePath, argv: [npm.cliPath, ...args], limits };
}

function npmScriptInvocation(args, accepted, limits, environment) {
  validateNpmScriptArgs(args, accepted);
  const [name, separator, ...forwarded] = args;
  const authority = environment ? releaseAuditPathAuthority(args, environment) : null;
  return {
    ...npmInvocation(['run', name, ...(separator ? ['--', ...forwarded] : [])], limits),
    ...(authority
      ? {
          env: buildClosedCommandEnvironment(environment, authority.environment),
          commandContext: authority.commandContext
        }
      : {})
  };
}

const ATTEMPT_CONFIG_PROPAGATION_PROFILES = new Set([
  'dependency-cruiser-v1',
  'node-script-standard-v1',
  'npm-script-build-v1',
  'npm-script-quick-v1',
  'npm-script-standard-v1',
  'prettier-v1',
  'stylelint-v1',
  'vitest-v1'
]);

export function resolveCommandProfile(
  profileId,
  args,
  { environment = process.env, operations = {} } = {}
) {
  validateProfileArguments(profileId, args);
  const fixedFileOperation = operations.fixedTrackedFileOperation ?? fixedTrackedFile;
  let command;
  if (profileId === 'vitest-v1')
    command = {
      executable: process.execPath,
      argv: [resolveLockedBin('vitest'), ...args],
      limits: COMMAND_LIMITS.vitest
    };
  else if (profileId === 'prettier-v1')
    command = {
      executable: process.execPath,
      argv: [resolveLockedBin('prettier'), ...args],
      limits: COMMAND_LIMITS.standard
    };
  else if (profileId === 'stylelint-v1')
    command = {
      executable: process.execPath,
      argv: [resolveLockedBin('stylelint'), ...args],
      limits: COMMAND_LIMITS.quick
    };
  else if (profileId === 'lint-staged-hook-v1' || profileId === 'lint-staged-prepare-v1')
    command = {
      executable: process.execPath,
      argv: [resolveLockedBin('lint-staged'), '--no-stash'],
      limits: COMMAND_LIMITS.standard
    };
  else if (profileId === 'husky-provision-v1')
    command = {
      executable: process.execPath,
      argv: [resolveLockedBin('husky')],
      limits: COMMAND_LIMITS.quick
    };
  else if (profileId === 'npm-ci-v1')
    command = npmInvocation(
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
      COMMAND_LIMITS.build
    );
  else if (profileId === 'github-ci-install-v1') {
    const prepared = prepareGithubCiInstall(environment, operations);
    const npm = detectNpmCommand({ repositoryRoot: REPOSITORY_ROOT, environment: {} });
    command = {
      executable: npm.nodePath,
      argv: [
        npm.cliPath,
        'ci',
        '--ignore-scripts',
        '--include=optional',
        '--no-audit',
        '--no-fund',
        `--userconfig=${prepared.userconfig}`,
        `--globalconfig=${prepared.globalconfig}`
      ],
      env: Object.freeze({
        HOME: prepared.installRoot,
        TMPDIR: dirname(prepared.installRoot),
        PATH: `${dirname(npm.nodePath)}:/usr/bin:/bin`,
        LANG: 'C',
        LC_ALL: 'C',
        TZ: 'UTC',
        CI: 'true',
        NPM_CONFIG_USERCONFIG: prepared.userconfig,
        NPM_CONFIG_GLOBALCONFIG: prepared.globalconfig
      }),
      limits: COMMAND_LIMITS.install,
      ciInstallOutputs: {
        path: prepared.githubOutputPath,
        lines: [
          `attempt-root=${prepared.attemptRoot}`,
          `npm-userconfig=${prepared.userconfig}`,
          `npm-globalconfig=${prepared.globalconfig}`
        ]
      },
      commandContext: {
        attemptRoot: prepared.attemptRoot,
        jobClass: prepared.jobClass,
        protectedJob: prepared.protectedJob,
        installRoot: prepared.installRoot,
        userconfig: prepared.userconfig,
        globalconfig: prepared.globalconfig,
        expectedAttemptEntries: prepared.expectedAttemptEntries,
        expectedInstallEntries: prepared.expectedInstallEntries,
        stampPath: prepared.stampPath,
        stampDevice: prepared.stampDevice,
        stampInode: prepared.stampInode,
        stampMode: prepared.stampMode,
        stampSha256: prepared.stampSha256,
        githubOutputPath: prepared.githubOutputPath,
        outputDevice: prepared.outputDevice,
        outputInode: prepared.outputInode,
        outputMode: prepared.outputMode,
        ciInstall: true
      }
    };
  } else if (profileId === 'local-install-v1') {
    const prepared = prepareLocalInstall(environment, operations);
    const npm = detectNpmCommand({ repositoryRoot: REPOSITORY_ROOT, environment: {} });
    command = {
      executable: npm.nodePath,
      argv: [
        npm.cliPath,
        'ci',
        '--ignore-scripts',
        '--include=optional',
        '--no-audit',
        '--no-fund',
        `--userconfig=${prepared.userconfig}`,
        `--globalconfig=${prepared.globalconfig}`
      ],
      env: Object.freeze({
        HOME: prepared.installRoot,
        TMPDIR: prepared.attemptRoot,
        PATH: `${dirname(npm.nodePath)}:/usr/bin:/bin`,
        LANG: 'C',
        LC_ALL: 'C',
        TZ: 'UTC',
        NPM_CONFIG_USERCONFIG: prepared.userconfig,
        NPM_CONFIG_GLOBALCONFIG: prepared.globalconfig
      }),
      limits: COMMAND_LIMITS.install,
      commandContext: { attemptRoot: prepared.attemptRoot, localInstall: true }
    };
  } else if (profileId === 'npm-audit-context-v1') {
    const attemptRoot = requireLocalRelease(environment);
    const authority = attemptConfigAuthority(environment, { required: true });
    command = {
      executable: process.execPath,
      argv: [fixedFileOperation('tools/check-npm-audit-regression.mjs'), ...args],
      env: releaseProfileEnvironment(profileId, environment, authority.environment),
      limits: COMMAND_LIMITS.quick,
      commandContext: { ...authority.commandContext, attemptRoot }
    };
  } else if (profileId === 'npm-tree-read-v1') {
    const root = requireLocalRelease(environment);
    command = {
      ...npmInvocation(args, COMMAND_LIMITS.quick),
      env: releaseProfileEnvironment(profileId, environment, attemptNpmConfigEnvironment(root)),
      commandContext: { attemptRoot: root }
    };
  } else if (profileId === 'firefox-geckodriver-provision-v1') {
    const attemptRoot =
      environment.CI === 'true' || environment.GITHUB_ACTIONS === 'true'
        ? requireReleaseJob(environment, ['firefox-prepare-v1'])
        : requireLocalRelease(environment);
    const outputDir = requireContainedArgument(
      attemptRoot,
      profileArgumentValue(args, '--output-dir')
    );
    if (outputDir !== join(attemptRoot, 'geckodriver')) {
      invalid('GECKODRIVER_OUTPUT_DIRECTORY_INVALID');
    }
    command = {
      executable: process.execPath,
      argv: [fixedFileOperation(profileFixedScript(profileId)), ...args],
      env: releaseProfileEnvironment(profileId, environment),
      limits: COMMAND_LIMITS.geckodriverProvision,
      commandContext: { attemptRoot, outputDir, geckodriverProvision: true }
    };
  } else if (
    [
      'release-result-field-v1',
      'release-job-outputs-v1',
      'release-state-init-v1',
      'release-state-check-v1'
    ].includes(profileId)
  ) {
    const browser = profileArgumentValue(args, '--browser');
    let attemptRoot;
    if (profileId === 'release-job-outputs-v1') {
      attemptRoot = requireReleaseJob(environment, [`${browser}-prepare-v1`]);
    } else if (profileId === 'release-state-init-v1' || profileId === 'release-state-check-v1') {
      attemptRoot = requireReleaseJob(environment, [
        browser === 'chrome' ? 'chrome-publish-v1' : 'firefox-submit-v1'
      ]);
    } else {
      attemptRoot =
        environment.CI === 'true' || environment.GITHUB_ACTIONS === 'true'
          ? requireReleaseJob(environment, [`${browser}-prepare-v1`])
          : requireLocalRelease(environment);
    }
    const resultPath = profileArgumentValue(args, '--result-json');
    if (resultPath) requireContainedArgument(attemptRoot, resultPath);
    command = {
      operation: profileId,
      argv: [...args],
      limits: COMMAND_LIMITS.quick,
      commandContext: {
        attemptRoot,
        browser,
        resultPath,
        field: profileArgumentValue(args, '--field'),
        githubOutputPath:
          profileId === 'release-job-outputs-v1' ? validatedGithubOutput(environment) : undefined
      },
      env: releaseProfileEnvironment(profileId, environment)
    };
  } else if (profileId === 'release-runtime-check-v1' || profileId === 'isolated-build-v1') {
    const configMode = profileArgumentValue(args, '--config-mode');
    const browser = profileArgumentValue(args, '--browser');
    let attemptRoot;
    if (configMode === 'owner-public-vars') {
      attemptRoot = requireReleaseJob(
        environment,
        browser ? [`${browser}-prepare-v1`] : ['chrome-prepare-v1', 'firefox-prepare-v1']
      );
    } else {
      attemptRoot = requireLocalRelease(environment);
    }
    for (const flag of ['--dist-dir', '--temp-dir']) {
      const value = profileArgumentValue(args, flag);
      if (value) requireContainedArgument(attemptRoot, value);
    }
    command = {
      executable: process.execPath,
      argv: [fixedFileOperation(profileFixedScript(profileId)), ...args],
      env: releaseProfileEnvironment(
        profileId,
        environment,
        attemptNpmConfigEnvironment(attemptRoot)
      ),
      limits:
        profileId === 'isolated-build-v1' ? COMMAND_LIMITS.isolatedBuild : COMMAND_LIMITS.standard,
      commandContext: { attemptRoot, browser, configMode }
    };
  } else if (profileId === 'release-provenance-v1') {
    const [script, mode] = args;
    for (const key of Object.keys(environment)) {
      if (key.toLowerCase() === 'github_token' && key !== 'GITHUB_TOKEN')
        invalid('RELEASE_TOKEN_INVALID');
    }
    const prepareLike =
      mode === '--prepare-authorization' || script.endsWith('releaseArtifactManifest.mjs');
    const attemptRoot = requireReleaseJob(
      environment,
      prepareLike
        ? ['chrome-prepare-v1', 'firefox-prepare-v1']
        : ['chrome-publish-v1', 'firefox-submit-v1']
    );
    for (const flag of ['--artifact-manifest', '--authorization-record']) {
      const value = profileArgumentValue(args, flag);
      if (value) requireContainedArgument(attemptRoot, value);
    }
    const additions = {};
    if (script.endsWith('releaseCiProvenance.mjs')) {
      if (typeof environment.GITHUB_TOKEN !== 'string' || environment.GITHUB_TOKEN.length === 0)
        invalid('RELEASE_TOKEN_INVALID');
      additions.GITHUB_TOKEN = environment.GITHUB_TOKEN;
    } else if (environment.GITHUB_TOKEN !== undefined) {
      invalid('RELEASE_TOKEN_FORBIDDEN');
    }
    command = {
      executable: process.execPath,
      argv: [fixedFileOperation(script), ...args.slice(1)],
      env: releaseProfileEnvironment(profileId, environment, additions),
      limits: COMMAND_LIMITS.standard,
      commandContext: {
        attemptRoot,
        actionOutputKey:
          mode === '--validate-upload-artifact-id'
            ? 'artifact_id'
            : mode === '--normalize-upload-artifact-digest'
              ? 'artifact_digest'
              : undefined,
        actionOutputValue:
          mode === '--validate-upload-artifact-id'
            ? args[2]
            : mode === '--normalize-upload-artifact-digest'
              ? `sha256:${args[2]}`
              : undefined,
        githubOutputPath:
          mode === '--validate-upload-artifact-id' || mode === '--normalize-upload-artifact-digest'
            ? validatedGithubOutput(environment)
            : undefined
      }
    };
  } else if (
    [
      'chrome-prepare-v1',
      'chrome-verify-v1',
      'firefox-prepare-v1',
      'firefox-verify-v1',
      'firefox-smoke-v1',
      'chrome-dry-run-v1',
      'chrome-publish-v1',
      'firefox-submit-v1'
    ].includes(profileId)
  ) {
    const browser = profileId.startsWith('chrome-') ? 'chrome' : 'firefox';
    const transport = profileArgumentValue(args, '--transport-mode');
    const configMode = profileArgumentValue(args, '--config-mode');
    const firefoxReleaseConsumer = [
      'firefox-prepare-v1',
      'firefox-verify-v1',
      'firefox-smoke-v1'
    ].includes(profileId);
    const firefoxProtectedVerifier =
      profileId === 'firefox-verify-v1' && transport === 'github-artifact-v1';
    if (
      profileId === 'firefox-prepare-v1' &&
      (environment.CI === 'true' || environment.GITHUB_ACTIONS === 'true') &&
      configMode !== 'owner-public-vars'
    )
      invalid('RELEASE_CONFIG_MODE_INVALID');
    let attemptRoot;
    if (profileId === 'chrome-publish-v1' || profileId === 'firefox-submit-v1') {
      attemptRoot = requireReleaseJob(environment, [
        browser === 'chrome' ? 'chrome-publish-v1' : 'firefox-submit-v1'
      ]);
    } else if (firefoxProtectedVerifier || transport === 'github-artifact-v1') {
      attemptRoot = requireReleaseJob(environment, [
        browser === 'chrome' ? 'chrome-publish-v1' : 'firefox-submit-v1'
      ]);
    } else if (firefoxReleaseConsumer) {
      attemptRoot =
        environment.CI === 'true' || environment.GITHUB_ACTIONS === 'true'
          ? requireReleaseJob(environment, ['firefox-prepare-v1'])
          : requireLocalRelease(environment);
    } else if (configMode === 'owner-public-vars') {
      attemptRoot = requireReleaseJob(environment, [`${browser}-prepare-v1`]);
    } else {
      attemptRoot = requireLocalRelease(environment);
    }
    const declaredAttemptRoot = profileArgumentValue(args, '--attempt-root');
    if (declaredAttemptRoot && declaredAttemptRoot !== attemptRoot)
      invalid('RELEASE_ATTEMPT_ROOT_MISMATCH');
    for (const flag of [
      '--manifest',
      '--artifact-manifest',
      '--zip',
      '--state-file',
      '--submission-state-file',
      '--saved-upload-uuid-path',
      '--dist-dir',
      '--release-dir',
      '--authorization-record',
      '--result-json'
    ]) {
      const value = profileArgumentValue(args, flag);
      if (value) requireContainedArgument(attemptRoot, value);
    }
    let expectedManifestSha256;
    if (transport === 'github-artifact-v1') {
      expectedManifestSha256 = environment.ZENDIO_EXPECTED_RELEASE_MANIFEST_SHA256;
      if (!/^[0-9a-f]{64}$/u.test(expectedManifestSha256 ?? ''))
        invalid('RELEASE_MANIFEST_DIGEST_INVALID');
    } else if (environment.ZENDIO_EXPECTED_RELEASE_MANIFEST_SHA256 !== undefined) {
      invalid('RELEASE_MANIFEST_DIGEST_FORBIDDEN');
    }
    const firefoxExecution = firefoxReleaseConsumer
      ? firefoxReleaseConsumerEnvironment(profileId, environment, attemptRoot, transport)
      : undefined;
    command = {
      executable: process.execPath,
      argv: [fixedFileOperation(profileFixedScript(profileId)), ...args],
      env: releaseProfileEnvironment(profileId, environment, firefoxExecution?.environment),
      limits:
        profileId === 'chrome-prepare-v1'
          ? COMMAND_LIMITS.chromePrepare
          : profileId === 'chrome-verify-v1'
            ? COMMAND_LIMITS.chromeVerify
            : profileId === 'chrome-publish-v1'
              ? COMMAND_LIMITS.chromePublish
              : profileId === 'firefox-prepare-v1'
                ? COMMAND_LIMITS.firefoxPrepare
                : profileId === 'firefox-verify-v1'
                  ? COMMAND_LIMITS.firefoxVerify
                  : profileId === 'firefox-smoke-v1'
                    ? COMMAND_LIMITS.firefoxSmoke
                    : profileId === 'firefox-submit-v1'
                      ? COMMAND_LIMITS.firefoxSubmit
                      : COMMAND_LIMITS.build,
      commandContext: {
        attemptRoot,
        browser,
        channel: profileArgumentValue(args, '--channel'),
        transport,
        manifestPath:
          profileArgumentValue(args, '--manifest') ??
          profileArgumentValue(args, '--artifact-manifest'),
        statePath:
          profileArgumentValue(args, '--state-file') ??
          profileArgumentValue(args, '--submission-state-file'),
        expectedManifestSha256,
        phaseReceiptPath: firefoxExecution?.phaseReceiptPath,
        requiredPhaseReceiptPath: firefoxExecution?.requiredPhaseReceiptPath,
        sequenceOwner: firefoxExecution?.sequenceOwner,
        ...(firefoxExecution
          ? {
              firefoxExecution: true,
              firefoxExecutionClass: firefoxExecution.executionClass,
              browsersPath: firefoxExecution.browsersPath,
              userconfig: firefoxExecution.userconfig,
              globalconfig: firefoxExecution.globalconfig,
              browserRootState:
                firefoxExecution.executionClass === 'protected-verifier' ? 'none' : 'existing'
            }
          : {})
      }
    };
  } else if (profileId === 'npm-script-quick-v1')
    command = npmScriptInvocation(args, QUICK_NPM_SCRIPTS, COMMAND_LIMITS.quick, environment);
  else if (profileId === 'npm-script-standard-v1')
    command = npmScriptInvocation(args, STANDARD_NPM_SCRIPTS, COMMAND_LIMITS.standard, environment);
  else if (profileId === 'npm-script-build-v1')
    command = npmScriptInvocation(args, BUILD_NPM_SCRIPTS, COMMAND_LIMITS.build, environment);
  else if (profileId === 'npm-script-browser-v1')
    command = npmScriptInvocation(args, BROWSER_NPM_SCRIPTS, COMMAND_LIMITS.browser);
  else if (profileId === 'node-script-standard-v1') {
    trackedOrStaged(args[0]);
    command = {
      executable: process.execPath,
      argv: [regularFile(args[0]), ...args.slice(1)],
      limits: COMMAND_LIMITS.standard
    };
  } else if (profileId === 'playwright-v1')
    command = {
      executable: process.execPath,
      argv: [
        args.includes('--config=playwright.bundled-chromium.config.ts')
          ? resolveLockedBin('playwright')
          : regularFile('scripts/run-playwright.mjs'),
        ...args
      ],
      limits: COMMAND_LIMITS.browser
    };
  else if (
    profileId === 'playwright-host-deps-platform-v1' ||
    profileId === 'playwright-browser-install-v1'
  ) {
    const browser = args[0].startsWith('firefox') ? 'firefox' : 'chromium';
    const hostDependencies = profileId === 'playwright-host-deps-platform-v1';
    const phaseEnvironment =
      browser === 'firefox'
        ? firefoxPlaywrightPhaseEnvironment(environment, hostDependencies)
        : undefined;
    command = {
      executable: process.execPath,
      argv: [
        resolveLockedBin('playwright'),
        hostDependencies ? 'install-deps' : 'install',
        browser
      ],
      ...(phaseEnvironment
        ? {
            env: buildClosedCommandEnvironment(environment, phaseEnvironment.environment),
            commandContext: {
              firefoxExecution: true,
              firefoxExecutionClass: phaseEnvironment.executionClass,
              attemptRoot: phaseEnvironment.attemptRoot,
              browsersPath: phaseEnvironment.browsersPath,
              userconfig: phaseEnvironment.userconfig,
              globalconfig: phaseEnvironment.globalconfig,
              phaseReceiptPath: phaseEnvironment.phaseReceiptPath,
              requiredPhaseReceiptPath: phaseEnvironment.requiredPhaseReceiptPath,
              sequenceOwner: phaseEnvironment.sequenceOwner,
              browserRootState: hostDependencies ? 'absent' : 'empty'
            }
          }
        : {}),
      limits: hostDependencies ? COMMAND_LIMITS.platform : COMMAND_LIMITS.browserInstall,
      platformOwned: hostDependencies,
      detached: hostDependencies ? false : process.platform !== 'win32'
    };
  } else if (profileId === 'playwright-install-v1')
    command = {
      executable: process.execPath,
      argv: [
        resolveLockedBin('playwright'),
        'install',
        '--with-deps',
        args[0].startsWith('firefox') ? 'firefox' : 'chromium'
      ],
      limits: COMMAND_LIMITS.browser
    };
  else if (profileId === 'fixture-v1')
    command = {
      executable: process.execPath,
      argv: [regularFile('tests/fixtures/bounded-command/child.mjs'), ...args],
      limits: COMMAND_LIMITS.fixture,
      fd3Input: args[0] === 'descriptors' ? 'fd3-input' : undefined
    };
  else if (profileId === 'dependency-cruiser-v1')
    command = {
      executable: process.execPath,
      argv: [
        regularFile('node_modules/dependency-cruiser/bin/dependency-cruise.mjs'),
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'json',
        'src/**/*.ts',
        'src/**/*.tsx',
        'src/**/*.js'
      ],
      limits: COMMAND_LIMITS.build
    };
  else
    command = {
      composite: profileId,
      argv: [...args],
      limits: profileId === 'stitch-secondary-v1' ? COMMAND_LIMITS.stitch : COMMAND_LIMITS.standard
    };
  if (ATTEMPT_CONFIG_PROPAGATION_PROFILES.has(profileId) && !command.commandContext) {
    const authority = attemptConfigAuthority(environment);
    if (authority) {
      command = {
        ...command,
        env: buildClosedCommandEnvironment(environment, authority.environment),
        commandContext: authority.commandContext
      };
    }
  }
  const environmentAdditions =
    profileId === 'lint-staged-hook-v1' || profileId === 'lint-staged-prepare-v1'
      ? { PATH: lintStagedPath() }
      : {};
  return deepFreeze({
    profileId,
    version: COMMAND_BOUNDARY_VERSION,
    cwd: realpathSync(REPOSITORY_ROOT),
    env: buildClosedCommandEnvironment(environment, environmentAdditions),
    shell: false,
    tty: false,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe', command.fd3Input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    ...command
  });
}
