export interface ReleaseCiJobEvidence {
  readonly id: number;
  readonly name: string;
  readonly status: 'completed';
  readonly conclusion: 'success';
}

export interface ReleaseCiProvenanceRecord {
  readonly schema: 'zendio-release-ci-provenance-v1';
  readonly releaseSha: string;
  readonly workflowPath: '.github/workflows/ci.yml';
  readonly workflowId: number;
  readonly repositoryId: number;
  readonly repositoryFullName: string;
  readonly runId: number;
  readonly runNumber: number;
  readonly runAttempt: number;
  readonly headSha: string;
  readonly event: 'push';
  readonly branch: 'main';
  readonly requiredJobs: readonly string[];
  readonly jobs: readonly ReleaseCiJobEvidence[];
}

export const RELEASE_CI_PROVENANCE_SCHEMA: 'zendio-release-ci-provenance-v1';
export const RELEASE_CI_PROVENANCE_LIMITS: Readonly<{
  requestMs: 30000;
  wholeMs: 120000;
  perPage: 100;
  maximumRunPages: 10;
  maximumJobPages: 10;
  maximumRows: 1000;
  responseBytes: number;
  cumulativeBytes: number;
  linkHeaderBytes: number;
  stringBytes: number;
  maximumDepth: 32;
  recordBytes: number;
}>;

export function canonicalReleaseProvenanceJson(value: unknown): string;
export function releaseProvenanceSha256(value: unknown): string;
export function selectReleaseCiProvenance(options: {
  runs: readonly Record<string, unknown>[];
  jobs: readonly Record<string, unknown>[];
  expectedSha: string;
  requiredJobs: readonly string[];
  repositoryId: number;
  repositoryFullName: string;
  workflowPath?: '.github/workflows/ci.yml';
}): ReleaseCiProvenanceRecord;
export function queryReleaseCiProvenance(
  options: {
    expectedSha: string;
    requiredJobs: readonly string[];
    repositoryId: number;
    repositoryFullName: string;
    token: string;
  },
  dependencies?: {
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
    setTimeoutOperation?: typeof setTimeout;
    clearTimeoutOperation?: typeof clearTimeout;
  }
): Promise<ReleaseCiProvenanceRecord>;
export function writeCanonicalAuthorizationRecord(
  path: string,
  record: ReleaseCiProvenanceRecord
): Promise<string>;
export function readCanonicalAuthorizationRecord(path: string): Promise<ReleaseCiProvenanceRecord>;
export function runReleaseCiProvenanceCli(
  argv?: readonly string[],
  environment?: NodeJS.ProcessEnv
): Promise<ReleaseCiProvenanceRecord>;
