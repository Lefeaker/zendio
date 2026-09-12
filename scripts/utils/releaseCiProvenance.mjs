import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RELEASE_REQUIRED_CI_JOBS } from '../config/releaseRequiredCiJobs.mjs';
import {
  parseCanonicalRestArtifactId,
  parseRestArtifactDigest
} from './releaseArtifactManifest.mjs';

export const RELEASE_CI_PROVENANCE_SCHEMA = 'zendio-release-ci-provenance-v1';
export const RELEASE_CI_PROVENANCE_LIMITS = Object.freeze({
  requestMs: 30_000,
  wholeMs: 120_000,
  perPage: 100,
  maximumRunPages: 10,
  maximumJobPages: 10,
  maximumRows: 1_000,
  responseBytes: 2 * 1024 * 1024,
  cumulativeBytes: 16 * 1024 * 1024,
  linkHeaderBytes: 8 * 1024,
  stringBytes: 4_096,
  maximumDepth: 32,
  recordBytes: 256 * 1024
});

const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const USER_AGENT = 'zendio-release-provenance-v1';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function validateBoundedValue(value, depth = 0) {
  if (depth > RELEASE_CI_PROVENANCE_LIMITS.maximumDepth) fail('RELEASE_PROVENANCE_DEPTH');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > RELEASE_CI_PROVENANCE_LIMITS.stringBytes) {
      fail('RELEASE_PROVENANCE_STRING_LIMIT');
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > RELEASE_CI_PROVENANCE_LIMITS.maximumRows) fail('RELEASE_PROVENANCE_ROWS');
    for (const entry of value) validateBoundedValue(entry, depth + 1);
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      validateBoundedValue(key, depth + 1);
      validateBoundedValue(entry, depth + 1);
    }
  }
}

export function canonicalReleaseProvenanceJson(value) {
  validateBoundedValue(value);
  const bytes = `${JSON.stringify(canonicalize(value), null, 2)}\n`;
  if (Buffer.byteLength(bytes, 'utf8') > RELEASE_CI_PROVENANCE_LIMITS.recordBytes) {
    fail('RELEASE_PROVENANCE_RECORD_LIMIT');
  }
  return bytes;
}

export function releaseProvenanceSha256(value) {
  return createHash('sha256').update(canonicalReleaseProvenanceJson(value)).digest('hex');
}

function exactSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) fail('RELEASE_SHA_INVALID');
  return value;
}

function exactPositiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(code);
  return value;
}

function exactString(value, code) {
  if (typeof value !== 'string' || value.length === 0) fail(code);
  validateBoundedValue(value);
  return value;
}

function assertRequiredJobs(requiredJobs) {
  if (
    !Array.isArray(requiredJobs) ||
    requiredJobs.length === 0 ||
    new Set(requiredJobs).size !== requiredJobs.length ||
    requiredJobs.some((name) => typeof name !== 'string' || name.length === 0)
  ) {
    fail('RELEASE_REQUIRED_JOBS_INVALID');
  }
  return [...requiredJobs];
}

export function selectReleaseCiProvenance(options) {
  const {
    runs,
    jobs,
    expectedSha,
    requiredJobs,
    repositoryId,
    repositoryFullName,
    workflowPath = '.github/workflows/ci.yml'
  } = options;
  const sha = exactSha(expectedSha);
  const required = assertRequiredJobs(requiredJobs);
  if (
    !Array.isArray(runs) ||
    runs.length === 0 ||
    runs.length > RELEASE_CI_PROVENANCE_LIMITS.maximumRows
  ) {
    fail('RELEASE_CI_RUN_SET_INVALID');
  }
  const candidates = runs.filter(
    (run) =>
      isPlainObject(run) &&
      run.head_sha === sha &&
      run.event === 'push' &&
      run.head_branch === 'main' &&
      (run.path === undefined || run.path === workflowPath)
  );
  if (candidates.length === 0) fail('RELEASE_CI_RUN_NOT_FOUND');
  candidates.sort((left, right) => {
    const numberDelta = Number(right.run_number) - Number(left.run_number);
    if (numberDelta !== 0) return numberDelta;
    const createdDelta = Date.parse(right.created_at) - Date.parse(left.created_at);
    if (createdDelta !== 0) return createdDelta;
    return Number(right.id) - Number(left.id);
  });
  const selectedRunNumber = Number(candidates[0].run_number);
  const selectedFamily = candidates.filter((run) => Number(run.run_number) === selectedRunNumber);
  const selected = selectedFamily.sort(
    (left, right) => Number(right.run_attempt ?? 1) - Number(left.run_attempt ?? 1)
  )[0];
  exactPositiveInteger(Number(selected.id), 'RELEASE_CI_RUN_ID_INVALID');
  exactPositiveInteger(Number(selected.run_number), 'RELEASE_CI_RUN_NUMBER_INVALID');
  exactPositiveInteger(Number(selected.run_attempt ?? 1), 'RELEASE_CI_RUN_ATTEMPT_INVALID');
  if (selected.status !== 'completed' || selected.conclusion !== 'success') {
    fail('RELEASE_CI_RUN_NOT_SUCCESSFUL');
  }
  if (!Array.isArray(jobs) || jobs.length > RELEASE_CI_PROVENANCE_LIMITS.maximumRows) {
    fail('RELEASE_CI_JOB_SET_INVALID');
  }
  const rowsByName = new Map();
  for (const job of jobs) {
    if (!isPlainObject(job)) fail('RELEASE_CI_JOB_INVALID');
    const name = exactString(job.name, 'RELEASE_CI_JOB_NAME_INVALID');
    if (rowsByName.has(name)) fail('RELEASE_CI_JOB_DUPLICATE', name);
    rowsByName.set(name, job);
  }
  if (
    rowsByName.size !== required.length ||
    [...rowsByName.keys()].some((name) => !required.includes(name)) ||
    required.some((name) => !rowsByName.has(name))
  ) {
    fail('RELEASE_CI_JOB_SET_MISMATCH');
  }
  const orderedJobs = required.map((name) => {
    const job = rowsByName.get(name);
    if (job.status !== 'completed' || job.conclusion !== 'success') {
      fail('RELEASE_CI_JOB_NOT_SUCCESSFUL', name);
    }
    return Object.freeze({
      id: exactPositiveInteger(Number(job.id), 'RELEASE_CI_JOB_ID_INVALID'),
      name,
      status: 'completed',
      conclusion: 'success'
    });
  });
  const record = {
    schema: RELEASE_CI_PROVENANCE_SCHEMA,
    releaseSha: sha,
    workflowPath,
    workflowId: exactPositiveInteger(
      Number(selected.workflow_id),
      'RELEASE_CI_WORKFLOW_ID_INVALID'
    ),
    repositoryId: exactPositiveInteger(Number(repositoryId), 'RELEASE_REPOSITORY_ID_INVALID'),
    repositoryFullName: exactString(repositoryFullName, 'RELEASE_REPOSITORY_INVALID'),
    runId: Number(selected.id),
    runNumber: Number(selected.run_number),
    runAttempt: Number(selected.run_attempt ?? 1),
    headSha: sha,
    event: 'push',
    branch: 'main',
    requiredJobs: required,
    jobs: orderedJobs
  };
  canonicalReleaseProvenanceJson(record);
  return Object.freeze(canonicalize(record));
}

function parseNextLink(value, expectedOrigin, expectedPathPrefix) {
  if (value === null) return null;
  if (Buffer.byteLength(value, 'utf8') > RELEASE_CI_PROVENANCE_LIMITS.linkHeaderBytes) {
    fail('RELEASE_GITHUB_LINK_LIMIT');
  }
  let next = null;
  for (const part of value.split(',')) {
    const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/u);
    if (!match) fail('RELEASE_GITHUB_LINK_INVALID');
    if (match[2] !== 'next') continue;
    if (next !== null) fail('RELEASE_GITHUB_LINK_DUPLICATE');
    const url = new URL(match[1]);
    if (url.origin !== expectedOrigin || !url.pathname.startsWith(expectedPathPrefix)) {
      fail('RELEASE_GITHUB_LINK_SCOPE');
    }
    next = url.href;
  }
  return next;
}

async function fetchJson(url, context) {
  const controller = new AbortController();
  let timer;
  try {
    const response = await Promise.race([
      context.fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': USER_AGENT,
          Authorization: `Bearer ${context.token}`
        }
      }),
      new Promise((_, reject) => {
        timer = context.setTimeoutOperation(() => {
          controller.abort();
          reject(new Error('RELEASE_GITHUB_TIMEOUT'));
        }, RELEASE_CI_PROVENANCE_LIMITS.requestMs);
      })
    ]);
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) > RELEASE_CI_PROVENANCE_LIMITS.responseBytes) {
      fail('RELEASE_GITHUB_RESPONSE_LIMIT');
    }
    const text = await response.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    context.cumulativeBytes += bytes;
    if (
      bytes > RELEASE_CI_PROVENANCE_LIMITS.responseBytes ||
      context.cumulativeBytes > RELEASE_CI_PROVENANCE_LIMITS.cumulativeBytes
    ) {
      fail('RELEASE_GITHUB_RESPONSE_LIMIT');
    }
    if (!response.ok) fail('RELEASE_GITHUB_HTTP', String(response.status));
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      fail('RELEASE_GITHUB_JSON');
    }
    validateBoundedValue(value);
    return {
      value,
      next: parseNextLink(response.headers.get('link'), API_ORIGIN, context.expectedPathPrefix)
    };
  } finally {
    if (timer !== undefined) context.clearTimeoutOperation(timer);
  }
}

async function paginate(initialUrl, key, maximumPages, context) {
  const rows = [];
  const seenUrls = new Set();
  let url = initialUrl;
  for (let page = 0; url !== null; page += 1) {
    if (page >= maximumPages || seenUrls.has(url)) fail('RELEASE_GITHUB_PAGINATION_LIMIT');
    seenUrls.add(url);
    const response = await fetchJson(url, context);
    if (!isPlainObject(response.value) || !Array.isArray(response.value[key])) {
      fail('RELEASE_GITHUB_RESPONSE_SCHEMA');
    }
    rows.push(...response.value[key]);
    if (rows.length > RELEASE_CI_PROVENANCE_LIMITS.maximumRows) {
      fail('RELEASE_GITHUB_ROW_LIMIT');
    }
    url = response.next;
  }
  return rows;
}

export async function queryReleaseCiProvenance(options, dependencies = {}) {
  const repository = exactString(options.repositoryFullName, 'RELEASE_REPOSITORY_INVALID');
  const encodedRepository = repository
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const sha = exactSha(options.expectedSha);
  const token = exactString(options.token, 'RELEASE_GITHUB_TOKEN_MISSING');
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const context = {
    fetchImpl,
    token,
    cumulativeBytes: 0,
    expectedPathPrefix: `/repos/${encodedRepository}/actions/`,
    setTimeoutOperation: dependencies.setTimeoutOperation ?? setTimeout,
    clearTimeoutOperation: dependencies.clearTimeoutOperation ?? clearTimeout
  };
  const runsUrl = new URL(`/repos/${encodedRepository}/actions/workflows/ci.yml/runs`, API_ORIGIN);
  runsUrl.search = new URLSearchParams({
    head_sha: sha,
    event: 'push',
    branch: 'main',
    per_page: String(RELEASE_CI_PROVENANCE_LIMITS.perPage),
    page: '1'
  }).toString();
  const runs = await paginate(
    runsUrl.href,
    'workflow_runs',
    RELEASE_CI_PROVENANCE_LIMITS.maximumRunPages,
    context
  );
  const matching = runs
    .filter((run) => run?.head_sha === sha && run?.event === 'push' && run?.head_branch === 'main')
    .sort((left, right) =>
      Number(right.run_number) !== Number(left.run_number)
        ? Number(right.run_number) - Number(left.run_number)
        : Date.parse(right.created_at) !== Date.parse(left.created_at)
          ? Date.parse(right.created_at) - Date.parse(left.created_at)
          : Number(right.id) - Number(left.id)
    );
  if (matching.length === 0) fail('RELEASE_CI_RUN_NOT_FOUND');
  const selectedRunNumber = Number(matching[0].run_number);
  const selected = matching
    .filter((run) => Number(run.run_number) === selectedRunNumber)
    .sort((left, right) => Number(right.run_attempt ?? 1) - Number(left.run_attempt ?? 1))[0];
  const selectedRepositoryId =
    options.repositoryId ?? selected.repository?.id ?? selected.head_repository?.id;
  const selectedRepositoryFullName =
    selected.repository?.full_name ?? selected.head_repository?.full_name;
  if (selectedRepositoryFullName !== undefined && selectedRepositoryFullName !== repository) {
    fail('RELEASE_REPOSITORY_MISMATCH');
  }
  const jobsUrl = new URL(
    `/repos/${encodedRepository}/actions/runs/${selected.id}/attempts/${selected.run_attempt ?? 1}/jobs`,
    API_ORIGIN
  );
  jobsUrl.search = new URLSearchParams({
    per_page: String(RELEASE_CI_PROVENANCE_LIMITS.perPage),
    page: '1'
  }).toString();
  const jobs = await paginate(
    jobsUrl.href,
    'jobs',
    RELEASE_CI_PROVENANCE_LIMITS.maximumJobPages,
    context
  );
  return selectReleaseCiProvenance({
    runs,
    jobs,
    expectedSha: sha,
    requiredJobs: options.requiredJobs,
    repositoryId: selectedRepositoryId,
    repositoryFullName: repository
  });
}

function gitValue(args, dependencies = {}) {
  const operation =
    dependencies.gitOperation ??
    ((gitArgs) =>
      execFileSync('/usr/bin/git', gitArgs, {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }
      }));
  const value = operation(args);
  return String(value).trim();
}

function repositoryFromRemote(remote) {
  const value = String(remote).trim();
  const match = value.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/u
  );
  if (!match) fail('RELEASE_REPOSITORY_REMOTE_INVALID');
  return match[1];
}

async function assertReleaseContext(expectedSha, environment, dependencies = {}) {
  gitValue(
    ['fetch', '--no-tags', '--force', 'origin', 'refs/heads/main:refs/remotes/origin/main'],
    dependencies
  );
  const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
  const headSha = exactSha(gitValue(['rev-parse', 'HEAD'], dependencies));
  const mainSha = exactSha(
    gitValue(['rev-parse', 'refs/remotes/origin/main^{commit}'], dependencies)
  );
  const eventSha = exactSha(environment.GITHUB_SHA);
  if (headSha !== expectedSha || mainSha !== expectedSha || eventSha !== expectedSha) {
    fail('RELEASE_CONTEXT_SHA_MISMATCH');
  }
  if (environment.GITHUB_EVENT_NAME === 'push') {
    if (environment.GITHUB_REF !== `refs/tags/v${packageJson.version}`) {
      fail('RELEASE_CONTEXT_TAG_INVALID');
    }
  } else if (
    environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    environment.GITHUB_REF !== 'refs/heads/main'
  ) {
    fail('RELEASE_CONTEXT_EVENT_INVALID');
  }
  return Object.freeze({
    repositoryFullName: repositoryFromRemote(
      gitValue(['remote', 'get-url', 'origin'], dependencies)
    ),
    releaseSha: expectedSha,
    releaseTree: exactSha(gitValue(['rev-parse', 'HEAD^{tree}'], dependencies)),
    packageVersion: packageJson.version
  });
}

async function assertReleaseArtifactMetadata(options, dependencies = {}) {
  const encodedRepository = options.repositoryFullName
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const artifactUrl = new URL(
    `/repos/${encodedRepository}/actions/artifacts/${options.artifactId}`,
    API_ORIGIN
  );
  const context = {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    token: options.token,
    cumulativeBytes: 0,
    expectedPathPrefix: `/repos/${encodedRepository}/actions/artifacts/`,
    setTimeoutOperation: dependencies.setTimeoutOperation ?? setTimeout,
    clearTimeoutOperation: dependencies.clearTimeoutOperation ?? clearTimeout
  };
  const response = await fetchJson(artifactUrl.href, context);
  if (response.next !== null || !isPlainObject(response.value)) {
    fail('RELEASE_ARTIFACT_REST_SCHEMA');
  }
  const artifact = response.value;
  if (
    parseCanonicalRestArtifactId(artifact.id) !== options.artifactId ||
    parseRestArtifactDigest(artifact.digest) !== options.artifactDigest ||
    artifact.expired !== false ||
    artifact.name !== options.artifactName ||
    Number(artifact.workflow_run?.id) !== Number(options.workflowRunId) ||
    artifact.workflow_run?.head_sha !== options.expectedSha
  ) {
    fail('RELEASE_ARTIFACT_REST_MISMATCH');
  }
}

export async function writeCanonicalAuthorizationRecord(path, record) {
  const target = resolve(path);
  const bytes = canonicalReleaseProvenanceJson(record);
  const handle = await open(target, 'wx', 0o600);
  try {
    await handle.writeFile(bytes, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directory = await open(dirname(target), 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  return target;
}

export async function readCanonicalAuthorizationRecord(path) {
  const bytes = await readFile(path);
  if (bytes.length === 0 || bytes.length > RELEASE_CI_PROVENANCE_LIMITS.recordBytes) {
    fail('RELEASE_AUTHORIZATION_RECORD_LIMIT');
  }
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('RELEASE_AUTHORIZATION_RECORD_JSON');
  }
  if (!isPlainObject(value) || canonicalReleaseProvenanceJson(value) !== bytes.toString('utf8')) {
    fail('RELEASE_AUTHORIZATION_RECORD_NOT_CANONICAL');
  }
  return Object.freeze(canonicalize(value));
}

function parseArgs(argv) {
  if (argv[0] === '--prepare-authorization' && argv.length === 7) {
    if (
      argv[1] !== '--expected-sha' ||
      argv[3] !== '--required-jobs-source' ||
      argv[4] !== 'scripts/config/releaseRequiredCiJobs.mjs' ||
      argv[5] !== '--authorization-record'
    ) {
      fail('RELEASE_PROVENANCE_ARGUMENTS_INVALID');
    }
    return { mode: 'prepare', expectedSha: exactSha(argv[2]), output: resolve(argv[6]) };
  }
  if (argv[0] === '--reauthorize' && argv.length === 13) {
    const flags = [
      '--expected-sha',
      '--artifact-manifest',
      '--artifact-id',
      '--artifact-digest',
      '--required-jobs-source',
      '--authorization-record'
    ];
    for (let index = 0; index < flags.length; index += 1) {
      if (argv[index * 2 + 1] !== flags[index]) fail('RELEASE_PROVENANCE_ARGUMENTS_INVALID');
    }
    if (argv[10] !== 'scripts/config/releaseRequiredCiJobs.mjs') {
      fail('RELEASE_PROVENANCE_ARGUMENTS_INVALID');
    }
    return {
      mode: 'reauthorize',
      expectedSha: exactSha(argv[2]),
      artifactManifest: resolve(argv[4]),
      artifactId: argv[6],
      artifactDigest: argv[8],
      output: resolve(argv[12])
    };
  }
  fail('RELEASE_PROVENANCE_ARGUMENTS_INVALID');
}

export async function runReleaseCiProvenanceCli(
  argv = process.argv.slice(2),
  environment = process.env,
  dependencies = {}
) {
  const args = parseArgs(argv);
  const context = await assertReleaseContext(args.expectedSha, environment, dependencies);
  const record = await queryReleaseCiProvenance(
    {
      expectedSha: args.expectedSha,
      requiredJobs: RELEASE_REQUIRED_CI_JOBS,
      repositoryFullName: context.repositoryFullName,
      token: environment.GITHUB_TOKEN
    },
    dependencies
  );
  if (args.mode === 'reauthorize') {
    if (!/^[1-9][0-9]{0,15}$/u.test(args.artifactId)) fail('ARTIFACT_ID_INVALID');
    if (!/^sha256:[0-9a-f]{64}$/u.test(args.artifactDigest)) fail('ARTIFACT_DIGEST_INVALID');
    const manifest = JSON.parse(await readFile(args.artifactManifest, 'utf8'));
    const bound = manifest?.authorization?.provenance;
    if (canonicalReleaseProvenanceJson(bound) !== canonicalReleaseProvenanceJson(record)) {
      fail('RELEASE_PROVENANCE_MISMATCH');
    }
    const browser = environment.ZENDIO_JOB_CLASS?.startsWith('firefox-') ? 'firefox' : 'chrome';
    await assertReleaseArtifactMetadata(
      {
        repositoryFullName: context.repositoryFullName,
        expectedSha: args.expectedSha,
        artifactId: args.artifactId,
        artifactDigest: args.artifactDigest,
        artifactName: `zendio-${browser}-release-v1`,
        workflowRunId: environment.GITHUB_RUN_ID,
        token: environment.GITHUB_TOKEN
      },
      dependencies
    );
  }
  await writeCanonicalAuthorizationRecord(args.output, record);
  return record;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReleaseCiProvenanceCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
