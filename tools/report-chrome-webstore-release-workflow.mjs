import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { R03_CI_JOB_SEQUENCE_RESERVATIONS } from '../scripts/config/commandBoundaryProfiles.mjs';
import { GITHUB_ACTION_PINS } from '../scripts/config/githubActionPins.mjs';
import { scanGitHubActionsSupplyChain } from './report-github-actions-supply-chain.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WORKFLOW_PATH = resolve(ROOT, '.github/workflows/release-chrome-webstore.yml');
const EXACT_JOBS = ['release-attempt-policy', 'prepare', 'publish', 'release-attempt-verdict'];
const EXACT_OUTPUTS = [
  'release_sha',
  'release_tree',
  'package_sha256',
  'lock_sha256',
  'release_manifest_sha256',
  'artifact_id',
  'artifact_digest'
];
const PIN_BY_ACTION = new Map(GITHUB_ACTION_PINS.map((pin) => [pin.action, pin]));

function pinnedUse(action) {
  const pin = PIN_BY_ACTION.get(action);
  if (!pin) throw new Error(`Missing GitHub Action pin: ${action}`);
  return `${pin.action}@${pin.commit}`;
}

const CHECKOUT_USE = pinnedUse('actions/checkout');
const UPLOAD_ARTIFACT_USE = pinnedUse('actions/upload-artifact');
const DOWNLOAD_ARTIFACT_USE = pinnedUse('actions/download-artifact');
const SUPPLY_CHAIN_RUN =
  'node scripts/run-bounded-command.mjs --profile npm-script-standard-v1 -- audit:github-actions-supply-chain:check';

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, expected, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value)) !== JSON.stringify(expected)
  ) {
    fail(`${label} keys changed`);
  }
}

function stepNames(job) {
  if (!Array.isArray(job?.steps)) fail('job steps missing');
  return job.steps.map((step) => step.name);
}

function requireIncludes(source, values, label) {
  for (const value of values) if (!source.includes(value)) fail(`${label} missing: ${value}`);
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

export function checkChromeWebstoreReleaseWorkflowContract({
  workflow = readFileSync(WORKFLOW_PATH, 'utf8')
} = {}) {
  const failures = [];
  const check = (label, operation) => {
    try {
      operation();
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  let value;
  check('yaml', () => {
    value = parse(workflow);
    if (!value || typeof value !== 'object') fail('workflow root missing');
  });
  if (!value) return { ok: false, failures };

  check('github-actions-supply-chain', () => {
    const report = scanGitHubActionsSupplyChain();
    if (
      !report.ok ||
      JSON.stringify(report.summary) !==
        JSON.stringify({
          yamlFiles: 5,
          workflowFiles: 3,
          actionFiles: 2,
          externalUses: 38,
          localUses: 21,
          compositeActions: 2,
          findings: 0
        })
    ) {
      fail('shared GitHub Actions supply-chain inventory is not green');
    }
  });

  check('topology', () => {
    exactKeys(value.jobs, EXACT_JOBS, 'job');
    if (value.concurrency?.group !== 'zendio-chrome-webstore-release-v1') {
      fail('constant Chrome concurrency group missing');
    }
    if (value.concurrency?.['cancel-in-progress'] !== false)
      fail('concurrency cancellation changed');
    if (JSON.stringify(value.permissions) !== '{}') fail('workflow permissions must be empty');
    if (!workflow.includes("      - 'v*'")) fail('tag trigger missing');
    requireIncludes(
      workflow,
      ['expected_sha:', 'required: true', 'RAW_EXPECTED_SHA: ${{ github.event_name'],
      'manual trigger'
    );
  });

  const policy = value.jobs['release-attempt-policy'];
  const prepare = value.jobs.prepare;
  const publish = value.jobs.publish;
  const verdict = value.jobs['release-attempt-verdict'];

  check('policy', () => {
    if (policy['runs-on'] !== 'ubuntu-24.04' || policy['timeout-minutes'] !== 5) {
      fail('policy runner or timeout changed');
    }
    if (
      JSON.stringify(policy.permissions) !== '{}' ||
      policy.environment ||
      policy.steps.length !== 1
    ) {
      fail('policy authority widened');
    }
    if (policy.steps[0].uses || !policy.steps[0].run.includes('github.run_attempt')) {
      fail('policy must be one shell-only first-attempt guard');
    }
  });

  check('prepare', () => {
    if (prepare['runs-on'] !== 'ubuntu-24.04' || prepare['timeout-minutes'] !== 75) {
      fail('prepare runner or timeout changed');
    }
    if (prepare.environment) fail('prepare must be unprivileged');
    exactKeys(prepare.outputs, EXACT_OUTPUTS, 'prepare output');
    const names = stepNames(prepare);
    const expected = [
      'Bootstrap command boundary',
      'Checkout release commit',
      'Setup exact Node dependencies',
      'Verify immutable GitHub Actions supply chain',
      'Validate release runtime',
      'Authorize exact release SHA and CI jobs',
      'Build isolated Chrome release',
      'Prepare immutable Chrome artifact',
      'Publish closed release job outputs',
      'Upload immutable Chrome release artifact',
      'Validate upload artifact ID',
      'Normalize upload artifact digest'
    ];
    if (JSON.stringify(names) !== JSON.stringify(expected)) fail('prepare step order changed');
    if (prepare.steps[1].uses !== CHECKOUT_USE) fail('checkout pin changed');
    if (prepare.steps[2].uses !== './.github/actions/setup-node-deps')
      fail('install owner changed');
    const supplyChain = prepare.steps[3];
    exactKeys(
      supplyChain.env,
      [
        'NPM_CONFIG_USERCONFIG',
        'NPM_CONFIG_GLOBALCONFIG',
        'ZENDIO_CHROME_ATTEMPT_ROOT',
        'ZENDIO_JOB_CLASS',
        'ZENDIO_JOB_TIMEOUT_MINUTES',
        'ZENDIO_RUNNER_ENVIRONMENT'
      ],
      'supply-chain environment'
    );
    if (
      supplyChain.run !== SUPPLY_CHAIN_RUN ||
      supplyChain.if !== undefined ||
      supplyChain['continue-on-error'] !== undefined ||
      JSON.stringify(supplyChain.env).includes('secrets.') ||
      Object.hasOwn(supplyChain.env ?? {}, 'GITHUB_TOKEN')
    ) {
      fail('prepare supply-chain guard changed, became masked, or gained authority');
    }
    if (prepare.steps[9].uses !== UPLOAD_ARTIFACT_USE) fail('upload pin changed');
    if (prepare.steps[9].with?.name !== 'zendio-chrome-release-v1') {
      fail('immutable artifact name changed');
    }
    if (prepare.steps[9].with?.overwrite !== false) fail('artifact overwrite enabled');
    const reservedMs = R03_CI_JOB_SEQUENCE_RESERVATIONS['chrome-prepare-v1'].reduce(
      (total, reservation) => total + reservation.fullMs,
      0
    );
    if (reservedMs !== 3_150_000 || 75 * 60_000 - reservedMs !== 1_350_000) {
      fail('prepare reservation budget changed');
    }
  });

  check('build-paths', () => {
    const buildRoot =
      '${{ runner.temp }}/zendio-chrome-${{ github.run_id }}-${{ github.run_attempt }}/build';
    const build = prepare.steps.find((step) => step.name === 'Build isolated Chrome release');
    const artifact = prepare.steps.find(
      (step) => step.name === 'Prepare immutable Chrome artifact'
    );
    requireIncludes(
      build.run,
      [`--dist-dir "${buildRoot}/dist-chrome"`, `--temp-dir "${buildRoot}/tmp-chrome"`],
      'isolated build workspace'
    );
    requireIncludes(
      artifact.run,
      [`--dist-dir "${buildRoot}/dist-chrome"`],
      'prepared build input'
    );
  });

  check('protected-publish', () => {
    if (publish['runs-on'] !== 'ubuntu-24.04' || publish['timeout-minutes'] !== 60) {
      fail('publish runner or timeout changed');
    }
    if (publish.environment?.name !== 'chrome-webstore-release')
      fail('protected environment missing');
    if (
      publish.if !==
      "${{ github.run_attempt == 1 && needs.release-attempt-policy.result == 'success' && needs.prepare.result == 'success' }}"
    ) {
      fail('pre-environment first-attempt condition changed');
    }
    const names = stepNames(publish);
    const expected = [
      'Bootstrap command boundary',
      'Checkout exact prepared commit',
      'Setup exact Node dependencies',
      'Download exact Chrome artifact',
      'Verify downloaded Chrome artifact',
      'Reauthorize release provenance',
      'Initialize Chrome submission state',
      'Publish verified Chrome artifact',
      'Validate Chrome submission evidence',
      'Upload Chrome submission evidence'
    ];
    if (JSON.stringify(names) !== JSON.stringify(expected)) fail('publish step order changed');
    if (publish.steps[3].uses !== DOWNLOAD_ARTIFACT_USE) fail('download pin changed');
    if (
      publish.steps[3].with?.['artifact-ids'] !== '${{ needs.prepare.outputs.artifact_id }}' ||
      Object.hasOwn(publish.steps[3].with ?? {}, 'name')
    ) {
      fail('download is not bound only to the canonical artifact ID');
    }
    if (publish.steps[3].with?.['digest-mismatch'] !== 'error')
      fail('digest mismatch is not fatal');
    if (publish.steps[9].uses !== UPLOAD_ARTIFACT_USE) fail('state upload pin changed');
    if (
      publish.steps[9].with?.name !== 'zendio-chrome-submission-state-v1' ||
      publish.steps[9].with?.path !==
        '${{ runner.temp }}/zendio-chrome-publish-${{ github.run_id }}-${{ github.run_attempt }}/store-state/chrome/publish-state.json'
    ) {
      fail('Chrome state evidence identity changed');
    }
    if (publish.steps[8].if !== '${{ always() }}' || publish.steps[9].if !== '${{ always() }}') {
      fail('state evidence must always run');
    }
    const secretSteps = publish.steps.filter((step) =>
      JSON.stringify(step.env ?? {}).includes('secrets.')
    );
    if (secretSteps.length !== 1 || secretSteps[0].name !== 'Publish verified Chrome artifact') {
      fail('Chrome credentials escaped the final mutation step');
    }
    if (
      publish.steps.some(
        (step) =>
          step.name === 'Verify immutable GitHub Actions supply chain' ||
          step.run === SUPPLY_CHAIN_RUN
      )
    ) {
      fail('supply-chain guard entered protected publish');
    }
  });

  check('verdict', () => {
    if (
      verdict.if !== '${{ always() }}' ||
      verdict['runs-on'] !== 'ubuntu-24.04' ||
      verdict['timeout-minutes'] !== 5 ||
      JSON.stringify(verdict.permissions) !== '{}' ||
      verdict.steps.length !== 1 ||
      verdict.steps[0].uses
    ) {
      fail('terminal verdict authority changed');
    }
  });

  check('fixed-routes', () => {
    requireIncludes(
      workflow,
      [
        '--profile release-runtime-check-v1 -- --check --config-mode owner-public-vars',
        SUPPLY_CHAIN_RUN,
        '--profile release-provenance-v1 -- scripts/utils/releaseCiProvenance.mjs --prepare-authorization',
        '--profile isolated-build-v1 -- --run-isolated-build --config-mode owner-public-vars --browser chrome',
        '--profile chrome-prepare-v1 -- --config-mode owner-public-vars',
        '--profile release-job-outputs-v1 -- --browser chrome',
        '--validate-upload-artifact-id "${{ steps.upload.outputs.artifact-id }}"',
        '--normalize-upload-artifact-digest "${{ steps.upload.outputs.artifact-digest }}"',
        '--profile chrome-verify-v1 -- --manifest',
        '--profile release-provenance-v1 -- scripts/utils/releaseCiProvenance.mjs --reauthorize',
        '--profile release-state-init-v1 -- --browser chrome',
        '--profile chrome-publish-v1 -- --publish --artifact-manifest',
        '--profile release-state-check-v1 -- --browser chrome'
      ],
      'fixed route'
    );
    if (count(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/gu) !== 2) {
      fail('exact prepare/reauthorize token mapping changed');
    }
    if (
      /npm run release:chrome|publish-chrome-webstore\.mjs|\bnpx\b|GITHUB_ENV|actions\/cache/iu.test(
        workflow
      )
    ) {
      fail('retired or ambient executable route remains');
    }
    for (const secret of [
      'CWS_CLIENT_ID',
      'CWS_CLIENT_SECRET',
      'CWS_REFRESH_TOKEN',
      'CWS_EXTENSION_ID',
      'CWS_PUBLISHER_ID'
    ]) {
      if (count(workflow, new RegExp(`${secret}:`, 'gu')) !== 1) fail(`${secret} scope changed`);
    }
  });

  return { ok: failures.length === 0, failures };
}

function workflowOverride(argv) {
  const index = argv.indexOf('--workflow');
  if (index < 0) return undefined;
  const path = argv[index + 1];
  if (!path || path.startsWith('--')) fail('--workflow requires a path');
  return readFileSync(resolve(path), 'utf8');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkChromeWebstoreReleaseWorkflowContract({
    workflow: workflowOverride(process.argv.slice(2))
  });
  if (!result.ok) {
    console.error('Chrome Web Store release workflow contract failed:');
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else if (!process.argv.includes('--check')) {
    console.log('Chrome Web Store release workflow contract passed.');
  }
}
