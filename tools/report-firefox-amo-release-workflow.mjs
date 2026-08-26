import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WORKFLOW_PATH = resolve(ROOT, '.github/workflows/release-firefox-amo.yml');
const EXACT_JOBS = ['release-attempt-policy', 'prepare', 'submit', 'release-attempt-verdict'];
const EXACT_OUTPUTS = [
  'release_sha',
  'release_tree',
  'package_sha256',
  'lock_sha256',
  'release_manifest_sha256',
  'artifact_id',
  'artifact_digest'
];

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

function requireIncludes(source, values, label) {
  for (const value of values) if (!source.includes(value)) fail(`${label} missing: ${value}`);
}

function stepNames(job) {
  if (!Array.isArray(job?.steps)) fail('job steps missing');
  return job.steps.map((step) => step.name);
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

export function checkFirefoxAmoReleaseWorkflowContract({
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

  check('topology', () => {
    exactKeys(value.jobs, EXACT_JOBS, 'job');
    if (value.concurrency?.group !== 'zendio-firefox-amo-release-v1') {
      fail('constant Firefox concurrency group missing');
    }
    if (value.concurrency?.['cancel-in-progress'] !== false)
      fail('concurrency cancellation changed');
    if (JSON.stringify(value.permissions) !== '{}') fail('workflow permissions must be empty');
    requireIncludes(
      workflow,
      [
        'expected_sha:',
        'channel:',
        'default: listed',
        '          - listed',
        '          - unlisted',
        "RAW_CHANNEL: ${{ github.event_name == 'workflow_dispatch' && inputs.channel || 'listed' }}"
      ],
      'trigger'
    );
  });

  const policy = value.jobs['release-attempt-policy'];
  const prepare = value.jobs.prepare;
  const submit = value.jobs.submit;
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
    exactKeys(policy.outputs, ['release_sha', 'channel'], 'policy output');
  });

  check('prepare', () => {
    if (prepare['runs-on'] !== 'ubuntu-24.04' || prepare['timeout-minutes'] !== 120) {
      fail('prepare runner or timeout changed');
    }
    if (prepare.environment) fail('prepare must not bind AMO environment');
    exactKeys(prepare.outputs, EXACT_OUTPUTS, 'prepare output');
    const expected = [
      'Bootstrap command boundary',
      'Checkout release commit',
      'Setup exact Node dependencies',
      'Validate release runtime',
      'Authorize exact release SHA and CI jobs',
      'Install Firefox host dependencies',
      'Install governed Firefox browser',
      'Provision pinned geckodriver',
      'Build isolated Firefox release',
      'Prepare immutable Firefox artifact',
      'Verify private Firefox artifact',
      'Smoke exact Firefox XPI',
      'Publish closed release job outputs',
      'Upload immutable Firefox release artifact',
      'Validate upload artifact ID',
      'Normalize upload artifact digest'
    ];
    if (JSON.stringify(stepNames(prepare)) !== JSON.stringify(expected)) {
      fail('prepare step order changed');
    }
    if (prepare.steps[1].uses !== 'actions/checkout@v6') fail('checkout pin changed');
    if (prepare.steps[2].uses !== './.github/actions/setup-node-deps')
      fail('install owner changed');
    if (prepare.steps[13].uses !== 'actions/upload-artifact@v7') fail('upload pin changed');
    if (prepare.steps[13].with?.name !== 'zendio-firefox-release-v1') {
      fail('immutable artifact name changed');
    }
    if (prepare.steps[13].with?.overwrite !== false) fail('artifact overwrite enabled');
    if (
      !prepare.steps[5].run.includes('playwright-host-deps-platform-v1') ||
      !prepare.steps[6].run.includes('playwright-browser-install-v1') ||
      !prepare.steps[7].run.includes('firefox-geckodriver-provision-v1')
    ) {
      fail('Firefox browser phase ownership changed');
    }
  });

  check('protected-submit', () => {
    if (submit['runs-on'] !== 'ubuntu-24.04' || submit['timeout-minutes'] !== 90) {
      fail('submit runner or timeout changed');
    }
    if (submit.environment?.name !== 'firefox-amo-release') fail('protected environment missing');
    if (
      submit.if !==
      "${{ github.run_attempt == 1 && needs.release-attempt-policy.result == 'success' && needs.prepare.result == 'success' }}"
    ) {
      fail('pre-environment first-attempt condition changed');
    }
    const expected = [
      'Bootstrap command boundary',
      'Checkout exact prepared commit',
      'Setup exact Node dependencies',
      'Download exact Firefox artifact',
      'Verify downloaded Firefox artifact',
      'Reauthorize release provenance',
      'Initialize Firefox submission state',
      'Submit verified Firefox artifact',
      'Validate Firefox submission evidence',
      'Upload Firefox submission evidence'
    ];
    if (JSON.stringify(stepNames(submit)) !== JSON.stringify(expected))
      fail('submit step order changed');
    if (submit.steps[3].uses !== 'actions/download-artifact@v8') fail('download pin changed');
    if (
      submit.steps[3].with?.['artifact-ids'] !== '${{ needs.prepare.outputs.artifact_id }}' ||
      Object.hasOwn(submit.steps[3].with ?? {}, 'name')
    ) {
      fail('download is not bound only to the canonical artifact ID');
    }
    if (submit.steps[3].with?.['digest-mismatch'] !== 'error') fail('digest mismatch is not fatal');
    if (submit.steps[9].uses !== 'actions/upload-artifact@v7') fail('state upload pin changed');
    if (
      submit.steps[9].with?.name !== 'zendio-firefox-submission-state-v1' ||
      submit.steps[9].with?.path !==
        '${{ runner.temp }}/zendio-firefox-submit-${{ github.run_id }}-${{ github.run_attempt }}/store-state/firefox/submission-state.json'
    ) {
      fail('Firefox state evidence identity changed');
    }
    if (submit.steps[8].if !== '${{ always() }}' || submit.steps[9].if !== '${{ always() }}') {
      fail('state evidence must always run');
    }
    const secretSteps = submit.steps.filter((step) =>
      JSON.stringify(step.env ?? {}).includes('secrets.')
    );
    if (secretSteps.length !== 1 || secretSteps[0].name !== 'Submit verified Firefox artifact') {
      fail('AMO credentials escaped the final mutation step');
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
        '--profile release-provenance-v1 -- scripts/utils/releaseCiProvenance.mjs --prepare-authorization',
        '--profile playwright-host-deps-platform-v1 -- firefox-with-host-deps',
        '--profile playwright-browser-install-v1 -- firefox-with-host-deps',
        '--profile firefox-geckodriver-provision-v1 -- --output-dir',
        '--profile isolated-build-v1 -- --run-isolated-build --config-mode owner-public-vars --browser firefox',
        '--profile firefox-prepare-v1 -- --config-mode owner-public-vars --transport-mode local-private-v1',
        '--profile firefox-verify-v1 -- --manifest',
        '--profile firefox-smoke-v1 -- --manifest',
        '--profile release-job-outputs-v1 -- --browser firefox',
        '--validate-upload-artifact-id "${{ steps.upload.outputs.artifact-id }}"',
        '--normalize-upload-artifact-digest "${{ steps.upload.outputs.artifact-digest }}"',
        '--profile release-provenance-v1 -- scripts/utils/releaseCiProvenance.mjs --reauthorize',
        '--profile release-state-init-v1 -- --browser firefox',
        '--profile firefox-submit-v1 -- --artifact-manifest',
        '--profile release-state-check-v1 -- --browser firefox'
      ],
      'fixed route'
    );
    if (count(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/gu) !== 2) {
      fail('exact prepare/reauthorize token mapping changed');
    }
    if (
      /package:firefox:sign|--sign|cmd\.sign|\bnpx\b|GITHUB_ENV|actions\/cache/iu.test(workflow)
    ) {
      fail('retired or ambient Firefox route remains');
    }
    for (const secret of ['WEB_EXT_API_KEY', 'WEB_EXT_API_SECRET']) {
      if (count(workflow, new RegExp(`${secret}:`, 'gu')) !== 1) fail(`${secret} scope changed`);
    }
    if (count(workflow, /firefox-submit-v1 -- --artifact-manifest/gu) !== 1) {
      fail('Firefox submit owner must be unique');
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
  const result = checkFirefoxAmoReleaseWorkflowContract({
    workflow: workflowOverride(process.argv.slice(2))
  });
  if (!result.ok) {
    console.error('Firefox AMO release workflow contract failed:');
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else if (!process.argv.includes('--check')) {
    console.log('Firefox AMO release workflow contract passed.');
  }
}
