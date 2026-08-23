import { describe, expect, it, vi } from 'vitest';
import {
  planAndSelectSessionDraftClaim,
  selectSessionDraftClaimCandidate,
  type SessionDraftSelectionCandidate,
  type SessionDraftSelectionDependencies,
  type SessionDraftSelectionInput
} from '../../../src/background/services/sessionDraftStoreSelection';
import {
  SESSION_DRAFT_LEASE_DURATION_MS,
  createSessionDraftIndexEntry,
  createLegacySessionDraftPageKey,
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  type SessionDraftEnvelope,
  type SessionDraftIndexEntry,
  type SessionDraftLegacyRecord,
  type SessionDraftOwnerLivenessProbe,
  type SessionDraftRecord,
  type SessionDraftTrustedOwnerContext
} from '../../../src/shared/sessionDrafts';

const NOW = 100_000;
const PAGE_URL = 'https://example.com/article?view=full';
const LEGACY_PAGE_KEY = createLegacySessionDraftPageKey('reader', PAGE_URL);
const COLLIDING_PAGE_URLS = [
  'https://example.com/reader/1ctg9w7-1jx99je',
  'https://example.com/reader/1d2u5vn-q239ae'
] as const;
const OWNER: SessionDraftTrustedOwnerContext = { tabId: 7, frameId: 0, windowId: 2 };
const PRIOR_OWNER: SessionDraftTrustedOwnerContext = { tabId: 5, frameId: 3, windowId: 1 };

function v2Record(options: {
  draftId: string;
  status?: SessionDraftEnvelope['status'];
  updatedAt?: number;
  leaseExpiresAt?: number;
  pageUrl?: string;
  mode?: SessionDraftEnvelope['mode'];
}): SessionDraftEnvelope {
  const mode = options.mode ?? 'reader';
  const pageUrl = options.pageUrl ?? PAGE_URL;
  const status = options.status ?? 'restorable';
  const updatedAt = options.updatedAt ?? NOW - 100;
  const leaseExpiresAt = options.leaseExpiresAt ?? NOW - 10_000;
  return {
    schemaVersion: 2,
    revision: 4,
    draftId: options.draftId,
    mode,
    pageKey: createSessionDraftPageKey(mode, pageUrl),
    pageUrl,
    pageTitle: 'Draft',
    createdAt: NOW - 1_000,
    updatedAt,
    expiresAt: NOW + 10_000,
    status,
    payload: { note: options.draftId },
    ...(status === 'restorable'
      ? {}
      : {
          lease: {
            leaseId: `lease-${options.draftId}`,
            owner: PRIOR_OWNER,
            renewedAt: leaseExpiresAt - SESSION_DRAFT_LEASE_DURATION_MS,
            leaseExpiresAt
          }
        })
  };
}

function legacyRecord(options: {
  draftId: string;
  status: SessionDraftLegacyRecord['status'];
  owner?: SessionDraftLegacyRecord['legacyOwnerContext'];
  updatedAt?: number;
  pageUrl?: string;
  pageKey?: string;
}): SessionDraftLegacyRecord {
  return {
    schemaVersion: 1,
    revision: 0,
    draftId: options.draftId,
    mode: 'reader',
    pageKey: options.pageKey ?? LEGACY_PAGE_KEY,
    pageUrl: options.pageUrl ?? PAGE_URL,
    pageTitle: 'Legacy',
    createdAt: NOW - 2_000,
    updatedAt: options.updatedAt ?? NOW - 200,
    expiresAt: NOW + 10_000,
    status: options.status,
    payload: { note: 'legacy' },
    ...(options.owner ? { legacyOwnerContext: options.owner } : {})
  };
}

function candidate(record: SessionDraftRecord): SessionDraftSelectionCandidate {
  return {
    key: createSessionDraftStorageKey({
      mode: record.mode,
      pageKey: record.pageKey,
      draftId: record.draftId
    }),
    record
  };
}

function dependencies(
  records: readonly SessionDraftSelectionCandidate[],
  probe: SessionDraftOwnerLivenessProbe = vi.fn<SessionDraftOwnerLivenessProbe>(() =>
    Promise.resolve('inactive')
  )
): SessionDraftSelectionDependencies {
  const byKey = new Map(records.map((entry) => [entry.key, entry.record]));
  const rereadExact = (key: string): Promise<SessionDraftRecord | undefined> =>
    Promise.resolve(byKey.get(key));
  return {
    now: () => NOW,
    ownerLivenessProbe: probe,
    rereadExact: vi.fn(rereadExact)
  };
}

function input(
  candidates: readonly SessionDraftSelectionCandidate[],
  invalidRemovedCount = 0
): SessionDraftSelectionInput {
  return {
    mode: 'reader',
    pageUrl: PAGE_URL,
    owner: OWNER,
    candidates,
    invalidRemovedCount
  };
}

function indexEntry(key: string, updatedAt: number, expiresAt: number): SessionDraftIndexEntry {
  return {
    key,
    draftId: key,
    mode: 'reader',
    pageKey: key,
    recordSchemaVersion: 2,
    revision: 1,
    updatedAt,
    expiresAt,
    status: 'restorable'
  };
}

describe('session draft store selection', () => {
  it('selects by full normalized identity when legacy page keys collide', async () => {
    const [leftUrl, rightUrl] = COLLIDING_PAGE_URLS;
    const left = candidate(
      legacyRecord({
        draftId: 'left-collision',
        status: 'restorable',
        updatedAt: NOW - 10,
        pageUrl: leftUrl,
        pageKey: '1kqeq3k'
      })
    );
    const right = candidate(
      legacyRecord({
        draftId: 'right-collision',
        status: 'restorable',
        updatedAt: NOW - 20,
        pageUrl: rightUrl,
        pageKey: '1kqeq3k'
      })
    );
    const deps = dependencies([left, right]);

    await expect(
      selectSessionDraftClaimCandidate({ ...input([left, right]), pageUrl: rightUrl }, deps)
    ).resolves.toMatchObject({ outcome: 'selected', key: right.key });
  });

  it('plans deterministic expiry, page, and technical-cap retention', async () => {
    const entries = [
      indexEntry('expired', NOW - 20, NOW),
      indexEntry('b', NOW - 10, NOW + 1_000),
      indexEntry('a', NOW - 10, NOW + 1_000),
      indexEntry('newest', NOW - 1, NOW + 1_000)
    ];

    const result = await planAndSelectSessionDraftClaim(
      {
        ...input([]),
        entries,
        retentionPolicy: {
          retentionMs: 10_000,
          maxRestorablePages: 2,
          maxItemsPerPage: 20
        }
      },
      dependencies([])
    );

    expect(result.plan.retained.map((entry) => entry.key)).toEqual(['newest', 'a']);
    expect(result.plan.removed.map((entry) => entry.key).sort()).toEqual(['b', 'expired']);
    expect(result.decision).toEqual({ outcome: 'none', invalidRemovedCount: 0 });
  });

  it('selects a restorable draft before a newer expired active draft without probing', async () => {
    const restorable = candidate(v2Record({ draftId: 'restorable', updatedAt: NOW - 20 }));
    const active = candidate(v2Record({ draftId: 'active', status: 'active', updatedAt: NOW - 1 }));
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(() => Promise.resolve('inactive'));
    const deps = dependencies([restorable, active], probe);

    const result = await planAndSelectSessionDraftClaim(
      {
        ...input([active, restorable], 2),
        entries: [active, restorable].map((entry) =>
          createSessionDraftIndexEntry(entry.key, entry.record)
        )
      },
      deps
    );

    expect(result.decision).toMatchObject({
      outcome: 'selected',
      key: restorable.key,
      selectionReason: 'restorable',
      invalidRemovedCount: 2
    });
    expect(result.plan.removed).toEqual([]);
    expect(probe).not.toHaveBeenCalled();
    expect(deps.rereadExact).toHaveBeenCalledOnce();
    expect(deps.rereadExact).toHaveBeenCalledWith(restorable.key);
  });

  it('breaks equal-recency restorable ties by exact key', async () => {
    const left = candidate(v2Record({ draftId: 'a', updatedAt: NOW - 1 }));
    const right = candidate(v2Record({ draftId: 'b', updatedAt: NOW - 1 }));
    const expected = [left, right].sort((a, b) => (a.key < b.key ? -1 : 1))[0];
    const deps = dependencies([left, right]);

    const result = await selectSessionDraftClaimCandidate(input([right, left]), deps);

    expect(result).toMatchObject({ outcome: 'selected', key: expected?.key });
  });

  it('never probes or rereads an unexpired active lease', async () => {
    const active = candidate(
      v2Record({ draftId: 'leased', status: 'active', leaseExpiresAt: NOW + 1 })
    );
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(() => Promise.resolve('inactive'));
    const deps = dependencies([active], probe);

    await expect(selectSessionDraftClaimCandidate(input([active]), deps)).resolves.toEqual({
      outcome: 'none',
      invalidRemovedCount: 0
    });
    expect(probe).not.toHaveBeenCalled();
    expect(deps.rereadExact).not.toHaveBeenCalled();
  });

  it('treats the exact lease-expiry boundary as probe eligible', async () => {
    const active = candidate(
      v2Record({ draftId: 'boundary', status: 'active', leaseExpiresAt: NOW })
    );
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(() => Promise.resolve('inactive'));

    await expect(
      selectSessionDraftClaimCandidate(input([active]), dependencies([active], probe))
    ).resolves.toMatchObject({
      outcome: 'selected',
      selectionReason: 'expired_owner_inactive'
    });
    expect(probe).toHaveBeenCalledWith({
      kind: 'leased-v2',
      key: active.key,
      leaseId: 'lease-boundary',
      owner: PRIOR_OWNER
    });
  });

  it('returns OWNER_ACTIVE without rereading or scanning a second expired candidate', async () => {
    const newest = candidate(v2Record({ draftId: 'newest', status: 'active', updatedAt: NOW - 1 }));
    const older = candidate(v2Record({ draftId: 'older', status: 'active', updatedAt: NOW - 2 }));
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(() => Promise.resolve('active'));
    const deps = dependencies([newest, older], probe);

    await expect(selectSessionDraftClaimCandidate(input([older, newest]), deps)).resolves.toEqual({
      outcome: 'conflict',
      code: 'OWNER_ACTIVE'
    });
    expect(probe).toHaveBeenCalledOnce();
    expect(probe).toHaveBeenCalledWith(expect.objectContaining({ key: newest.key }));
    expect(deps.rereadExact).not.toHaveBeenCalled();
  });

  it('fails closed when the sole liveness probe rejects', async () => {
    const active = candidate(v2Record({ draftId: 'reject', status: 'active' }));
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(() =>
      Promise.reject(new Error('probe unavailable'))
    );
    const deps = dependencies([active], probe);

    await expect(selectSessionDraftClaimCandidate(input([active]), deps)).resolves.toEqual({
      outcome: 'conflict',
      code: 'OWNER_LIVENESS_UNAVAILABLE'
    });
    expect(probe).toHaveBeenCalledOnce();
    expect(deps.rereadExact).not.toHaveBeenCalled();
  });

  it('rereads after inactive proof and rejects a changed lease at the same revision', async () => {
    const activeRecord = v2Record({ draftId: 'changed', status: 'active' });
    const active = candidate(activeRecord);
    const originalLease = activeRecord.lease;
    if (!originalLease) throw new Error('active test record must carry a lease');
    const renewed: SessionDraftEnvelope = {
      ...activeRecord,
      lease: { ...originalLease, leaseId: `${originalLease.leaseId}-replacement` }
    };
    const deps = dependencies([active]);
    deps.rereadExact = vi.fn(() => Promise.resolve(renewed));

    await expect(selectSessionDraftClaimCandidate(input([active]), deps)).resolves.toEqual({
      outcome: 'conflict',
      code: 'RECORD_CHANGED'
    });
    expect(renewed.revision).toBe(activeRecord.revision);
    expect(deps.ownerLivenessProbe).toHaveBeenCalledOnce();
    expect(deps.rereadExact).toHaveBeenCalledWith(active.key);
  });

  it('rereads a restorable candidate and rejects a replacement before claim', async () => {
    const restorable = candidate(v2Record({ draftId: 'replaced' }));
    const deps = dependencies([restorable]);
    deps.rereadExact = vi.fn(() => Promise.resolve(undefined));

    await expect(selectSessionDraftClaimCandidate(input([restorable]), deps)).resolves.toEqual({
      outcome: 'conflict',
      code: 'RECORD_CHANGED'
    });
    expect(deps.ownerLivenessProbe).not.toHaveBeenCalled();
  });

  it('claims a legacy restorable record without a liveness probe', async () => {
    const legacy = candidate(legacyRecord({ draftId: 'legacy-restorable', status: 'restorable' }));
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(() => Promise.resolve('active'));

    await expect(
      selectSessionDraftClaimCandidate(input([legacy]), dependencies([legacy], probe))
    ).resolves.toMatchObject({ outcome: 'selected', selectionReason: 'restorable' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('probes a lease-less legacy active record with its complete legacy owner', async () => {
    const legacy = candidate(
      legacyRecord({ draftId: 'legacy-active', status: 'active', owner: PRIOR_OWNER })
    );
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(() => Promise.resolve('inactive'));

    await expect(
      selectSessionDraftClaimCandidate(input([legacy]), dependencies([legacy], probe))
    ).resolves.toMatchObject({
      outcome: 'selected',
      selectionReason: 'legacy_owner_inactive'
    });
    expect(probe).toHaveBeenCalledWith({
      kind: 'legacy-v1',
      key: legacy.key,
      owner: PRIOR_OWNER
    });
  });

  it('keeps a live legacy active record non-claimable', async () => {
    const legacy = candidate(
      legacyRecord({ draftId: 'legacy-live', status: 'active', owner: PRIOR_OWNER })
    );
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(() => Promise.resolve('active'));

    await expect(
      selectSessionDraftClaimCandidate(input([legacy]), dependencies([legacy], probe))
    ).resolves.toEqual({ outcome: 'conflict', code: 'OWNER_ACTIVE' });
  });

  it('fails closed without probing a partial legacy owner', async () => {
    const legacy = candidate(
      legacyRecord({ draftId: 'legacy-partial', status: 'active', owner: { tabId: 5 } })
    );
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(() => Promise.resolve('inactive'));

    await expect(
      selectSessionDraftClaimCandidate(input([legacy]), dependencies([legacy], probe))
    ).resolves.toEqual({ outcome: 'conflict', code: 'OWNER_LIVENESS_UNAVAILABLE' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('isolates terminal, expired, wrong-page, and mismatched-key siblings', async () => {
    const valid = candidate(v2Record({ draftId: 'valid' }));
    const terminal = candidate(v2Record({ draftId: 'terminal', status: 'discarded' }));
    const expiredRecord = { ...v2Record({ draftId: 'expired' }), expiresAt: NOW };
    const wrongPage = candidate(
      v2Record({ draftId: 'wrong-page', pageUrl: 'https://example.com/other' })
    );
    const mismatched = { ...candidate(v2Record({ draftId: 'mismatch' })), key: `${valid.key}.bad` };
    const expired = candidate(expiredRecord);
    const deps = dependencies([valid, terminal, expired, wrongPage, mismatched]);

    await expect(
      selectSessionDraftClaimCandidate(
        input([terminal, expired, wrongPage, mismatched, valid], 4),
        deps
      )
    ).resolves.toMatchObject({
      outcome: 'selected',
      key: valid.key,
      invalidRemovedCount: 4
    });
  });

  it('reports invalid removal only when no valid candidate remains', async () => {
    const deps = dependencies([]);

    await expect(selectSessionDraftClaimCandidate(input([], 3), deps)).resolves.toEqual({
      outcome: 'invalid_removed',
      invalidRemovedCount: 3
    });
    await expect(selectSessionDraftClaimCandidate(input([]), deps)).resolves.toEqual({
      outcome: 'none',
      invalidRemovedCount: 0
    });
  });

  it('rejects incomplete trusted caller identity before reading or probing', async () => {
    const restorable = candidate(v2Record({ draftId: 'owner-invalid' }));
    const deps = dependencies([restorable]);
    const invalidInput = { ...input([restorable]), owner: { tabId: -1, frameId: 0 } };

    await expect(selectSessionDraftClaimCandidate(invalidInput, deps)).resolves.toEqual({
      outcome: 'conflict',
      code: 'OWNER_CONTEXT_INVALID'
    });
    expect(deps.ownerLivenessProbe).not.toHaveBeenCalled();
    expect(deps.rereadExact).not.toHaveBeenCalled();
  });

  it('waits for an inactive proof before performing the exact reread', async () => {
    const active = candidate(v2Record({ draftId: 'deferred', status: 'active' }));
    let resolveProbe: ((state: 'inactive') => void) | undefined;
    const probe = vi.fn<SessionDraftOwnerLivenessProbe>(
      () => new Promise((resolve) => (resolveProbe = resolve))
    );
    const deps = dependencies([active], probe);
    const pending = selectSessionDraftClaimCandidate(input([active]), deps);

    await Promise.resolve();
    expect(deps.rereadExact).not.toHaveBeenCalled();
    resolveProbe?.('inactive');
    await expect(pending).resolves.toMatchObject({ outcome: 'selected' });
    expect(deps.rereadExact).toHaveBeenCalledOnce();
  });
});
