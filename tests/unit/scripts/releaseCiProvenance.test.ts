import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalReleaseProvenanceJson,
  queryReleaseCiProvenance,
  runReleaseCiProvenanceCli,
  selectReleaseCiProvenance,
  writeCanonicalAuthorizationRecord
} from '../../../scripts/utils/releaseCiProvenance.mjs';

const roots: string[] = [];
const sha = 'a'.repeat(40);
const requiredJobs: string[] = [
  'Static preflight',
  'Static release surface',
  'Static generated artifacts',
  'Static style and locale audits',
  'Static reporting audits',
  'Unit coverage',
  'Visual regression (chromium-desktop)',
  'Visual regression (chromium-tablet)',
  'Visual regression (chromium-mobile)',
  'E2E Vitest',
  'Browser YAML flow',
  'Browser reader panel flow',
  'Browser smoke flow',
  'Browser video flow',
  'Browser Firefox flow',
  'Browser state flow',
  'Browser architecture flow',
  'Package extension'
];

type RunFixture = {
  id: number;
  run_number: number;
  run_attempt: number;
  workflow_id: number;
  created_at: string;
  head_sha: string;
  head_branch: string;
  event: string;
  path: string;
  status: string;
  conclusion: string | null;
  repository?: { id: number; full_name: string };
};

function run(overrides: Partial<RunFixture> = {}): RunFixture {
  return {
    id: 20,
    run_number: 11,
    run_attempt: 1,
    workflow_id: 7,
    created_at: '2026-08-25T00:00:00Z',
    head_sha: sha,
    head_branch: 'main',
    event: 'push',
    path: '.github/workflows/ci.yml',
    status: 'completed',
    conclusion: 'success',
    repository: { id: 99, full_name: 'owner/repo' },
    ...overrides
  };
}

function jobs() {
  return requiredJobs.map((name, index) => ({
    id: index + 1,
    name,
    status: 'completed',
    conclusion: 'success'
  }));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('release CI provenance', () => {
  it('selects the newest same-SHA attempt before checking its conclusion', () => {
    expect(() =>
      selectReleaseCiProvenance({
        runs: [run(), run({ id: 21, run_number: 12, conclusion: 'failure' })],
        jobs: jobs(),
        expectedSha: sha,
        requiredJobs,
        repositoryId: 99,
        repositoryFullName: 'owner/repo'
      })
    ).toThrow('RELEASE_CI_RUN_NOT_SUCCESSFUL');
    const record = selectReleaseCiProvenance({
      runs: [run({ run_attempt: 1 }), run({ id: 22, run_attempt: 2 })],
      jobs: jobs().reverse(),
      expectedSha: sha,
      requiredJobs,
      repositoryId: 99,
      repositoryFullName: 'owner/repo'
    });
    expect(record.runAttempt).toBe(2);
    expect(record.jobs.map((job) => job.name)).toEqual(requiredJobs);
  });

  it.each([
    { name: 'missing', mutate: (rows: ReturnType<typeof jobs>) => rows.slice(1) },
    {
      name: 'extra',
      mutate: (rows: ReturnType<typeof jobs>) => [...rows, { ...rows[0], id: 99, name: 'Extra' }]
    },
    {
      name: 'duplicate',
      mutate: (rows: ReturnType<typeof jobs>) => [...rows, { ...rows[0], id: 99 }]
    },
    {
      name: 'pending',
      mutate: (rows: ReturnType<typeof jobs>) =>
        rows.map((row, index) =>
          index === 0 ? { ...row, status: 'in_progress', conclusion: null } : row
        )
    }
  ])('rejects an exact-job-set $name mutation', ({ mutate }) => {
    expect(() =>
      selectReleaseCiProvenance({
        runs: [run()],
        jobs: mutate(jobs()),
        expectedSha: sha,
        requiredJobs,
        repositoryId: 99,
        repositoryFullName: 'owner/repo'
      })
    ).toThrow(/RELEASE_CI_JOB/u);
  });

  it.each(['Browser state flow', 'Browser architecture flow'])(
    'fails closed when required job %s is failed, cancelled, skipped, neutral, or incomplete',
    (requiredName) => {
      const unsuccessfulStates: Array<{ status: string; conclusion: string | null }> = [
        { status: 'completed', conclusion: 'failure' },
        { status: 'completed', conclusion: 'cancelled' },
        { status: 'completed', conclusion: 'skipped' },
        { status: 'completed', conclusion: 'neutral' },
        { status: 'in_progress', conclusion: null }
      ];
      for (const { status, conclusion } of unsuccessfulStates) {
        expect(() =>
          selectReleaseCiProvenance({
            runs: [run()],
            jobs: jobs().map((job) =>
              job.name === requiredName ? { ...job, status, conclusion } : job
            ),
            expectedSha: sha,
            requiredJobs,
            repositoryId: 99,
            repositoryFullName: 'owner/repo'
          })
        ).toThrow(`RELEASE_CI_JOB_NOT_SUCCESSFUL:${requiredName}`);
      }
    }
  );

  it('fails closed while a newer same-SHA attempt is incomplete or unsuccessful', () => {
    for (const latest of [
      run({ id: 30, run_attempt: 2, status: 'in_progress', conclusion: null }),
      run({ id: 31, run_attempt: 2, conclusion: 'failure' })
    ]) {
      expect(() =>
        selectReleaseCiProvenance({
          runs: [run({ run_attempt: 1 }), latest],
          jobs: jobs(),
          expectedSha: sha,
          requiredJobs,
          repositoryId: 99,
          repositoryFullName: 'owner/repo'
        })
      ).toThrow('RELEASE_CI_RUN_NOT_SUCCESSFUL');
    }
  });

  it('fully paginates runs and jobs with closed GitHub headers', async () => {
    const fetchImpl = vi.fn((url: string | URL, init?: RequestInit): Promise<Response> => {
      const target = new URL(url);
      expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
      expect(init?.headers).toMatchObject({
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'zendio-release-provenance-v1',
        Authorization: 'Bearer token'
      });
      if (target.pathname.endsWith('/runs')) {
        return Promise.resolve(
          new Response(JSON.stringify({ workflow_runs: [run()] }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ jobs: jobs() }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    });
    const record = await queryReleaseCiProvenance(
      {
        expectedSha: sha,
        requiredJobs,
        repositoryId: 99,
        repositoryFullName: 'owner/repo',
        token: 'token'
      },
      { fetchImpl }
    );
    expect(record.runId).toBe(20);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('writes one private byte-canonical authorization record without replacement', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zendio-release-provenance-'));
    roots.push(root);
    await chmod(root, 0o700);
    const record = selectReleaseCiProvenance({
      runs: [run()],
      jobs: jobs(),
      expectedSha: sha,
      requiredJobs,
      repositoryId: 99,
      repositoryFullName: 'owner/repo'
    });
    const path = join(root, 'authorization.json');
    await writeCanonicalAuthorizationRecord(path, record);
    expect(await readFile(path, 'utf8')).toBe(canonicalReleaseProvenanceJson(record));
    await expect(writeCanonicalAuthorizationRecord(path, record)).rejects.toMatchObject({
      code: 'EEXIST'
    });
  });

  it('reauthorizes fresh main and exact REST artifact identity before writing a new record', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zendio-release-provenance-cli-'));
    roots.push(root);
    await chmod(root, 0o700);
    const preparedPath = join(root, 'prepared.json');
    const reauthorizedPath = join(root, 'reauthorized.json');
    const manifestPath = join(root, 'manifest.json');
    const environment = {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: sha,
      GITHUB_TOKEN: 'token',
      GITHUB_RUN_ID: '55',
      ZENDIO_JOB_CLASS: 'chrome-prepare-v1'
    };
    const gitOperation = vi.fn((args: string[]) => {
      const key = args.join(' ');
      if (key === 'rev-parse HEAD') return sha;
      if (key === 'rev-parse refs/remotes/origin/main^{commit}') return sha;
      if (key === 'rev-parse HEAD^{tree}') return 'b'.repeat(40);
      if (key === 'remote get-url origin') return 'https://github.com/owner/repo.git';
      if (key.startsWith('fetch ')) return '';
      throw new Error(`unexpected git call: ${key}`);
    });
    const fetchImpl = vi.fn((url: string | URL): Promise<Response> => {
      const target = new URL(url);
      if (target.pathname.endsWith('/runs')) {
        return Promise.resolve(new Response(JSON.stringify({ workflow_runs: [run()] })));
      }
      if (target.pathname.endsWith('/jobs')) {
        return Promise.resolve(new Response(JSON.stringify({ jobs: jobs() })));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 123,
            digest: `sha256:${'c'.repeat(64)}`,
            expired: false,
            name: 'zendio-chrome-release-v1',
            workflow_run: { id: 55, head_sha: sha }
          })
        )
      );
    });

    const prepared = await runReleaseCiProvenanceCli(
      [
        '--prepare-authorization',
        '--expected-sha',
        sha,
        '--required-jobs-source',
        'scripts/config/releaseRequiredCiJobs.mjs',
        '--authorization-record',
        preparedPath
      ],
      environment,
      { fetchImpl, gitOperation }
    );
    await writeFile(
      manifestPath,
      JSON.stringify({ authorization: { provenance: prepared } }),
      'utf8'
    );
    environment.ZENDIO_JOB_CLASS = 'chrome-publish-v1';
    await expect(
      runReleaseCiProvenanceCli(
        [
          '--reauthorize',
          '--expected-sha',
          sha,
          '--artifact-manifest',
          manifestPath,
          '--artifact-id',
          '123',
          '--artifact-digest',
          `sha256:${'c'.repeat(64)}`,
          '--required-jobs-source',
          'scripts/config/releaseRequiredCiJobs.mjs',
          '--authorization-record',
          reauthorizedPath
        ],
        environment,
        { fetchImpl, gitOperation }
      )
    ).resolves.toEqual(prepared);
    expect(await readFile(reauthorizedPath, 'utf8')).toBe(canonicalReleaseProvenanceJson(prepared));
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('fails before GitHub REST when main advances beyond the requested release SHA', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zendio-release-provenance-main-'));
    roots.push(root);
    await chmod(root, 0o700);
    const fetchImpl = vi.fn();
    const gitOperation = vi.fn((args: string[]) => {
      const key = args.join(' ');
      if (key === 'rev-parse HEAD') return sha;
      if (key === 'rev-parse refs/remotes/origin/main^{commit}') return 'd'.repeat(40);
      if (key.startsWith('fetch ')) return '';
      throw new Error(`unexpected git call: ${key}`);
    });
    await expect(
      runReleaseCiProvenanceCli(
        [
          '--prepare-authorization',
          '--expected-sha',
          sha,
          '--required-jobs-source',
          'scripts/config/releaseRequiredCiJobs.mjs',
          '--authorization-record',
          join(root, 'authorization.json')
        ],
        {
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_REF: 'refs/heads/main',
          GITHUB_SHA: sha,
          GITHUB_TOKEN: 'token',
          ZENDIO_JOB_CLASS: 'chrome-prepare-v1'
        },
        { fetchImpl, gitOperation }
      )
    ).rejects.toThrow('RELEASE_CONTEXT_SHA_MISMATCH');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
