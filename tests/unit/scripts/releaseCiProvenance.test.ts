import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalReleaseProvenanceJson,
  queryReleaseCiProvenance,
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
  'Package extension'
];

function run(overrides: Record<string, unknown> = {}) {
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
});
