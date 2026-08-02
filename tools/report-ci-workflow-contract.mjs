import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCiWorkflowJobs } from './ciWorkflowContract/yamlSubset.mjs';
import { checkCiWorkflowContractInputs } from './ciWorkflowContract/rules.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WORKFLOW_PATH = resolve(ROOT, '.github/workflows/ci.yml');
const FIREFOX_RELEASE_WORKFLOW_PATH = resolve(ROOT, '.github/workflows/release-firefox-amo.yml');
const NODE_ACTION_PATH = resolve(ROOT, '.github/actions/setup-node-deps/action.yml');
const PLAYWRIGHT_ACTION_PATH = resolve(ROOT, '.github/actions/setup-playwright/action.yml');
const PACKAGE_JSON_PATH = resolve(ROOT, 'package.json');
const QUALITY_CHECK_PATH = resolve(ROOT, 'scripts/quality-check.mjs');

function readRequired(path) {
  if (!existsSync(path)) {
    throw new Error(`Required CI contract file is missing: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

export { parseCiWorkflowJobs };

export function checkCiWorkflowContract({
  workflow = readRequired(WORKFLOW_PATH),
  firefoxReleaseWorkflow = readRequired(FIREFOX_RELEASE_WORKFLOW_PATH),
  nodeAction = readRequired(NODE_ACTION_PATH),
  packageJson = readRequired(PACKAGE_JSON_PATH),
  playwrightAction = readRequired(PLAYWRIGHT_ACTION_PATH),
  qualityCheck = readRequired(QUALITY_CHECK_PATH)
} = {}) {
  return checkCiWorkflowContractInputs({
    workflow,
    firefoxReleaseWorkflow,
    nodeAction,
    packageJson,
    playwrightAction,
    qualityCheck
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkCiWorkflowContract();
  if (!result.ok) {
    console.error('CI workflow contract failed:');
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else if (!process.argv.includes('--check')) {
    console.log('CI workflow contract passed.');
  }
}
