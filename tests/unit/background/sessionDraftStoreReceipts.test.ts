import { describe, expect, it } from 'vitest';

import {
  addSessionDraftMutationReceipt,
  beginSessionDraftMutation,
  checkSessionDraftMutationReceipt,
  createSessionDraftMutationReceipt,
  createSessionDraftPendingRemovals,
  createSessionDraftRequestDigest,
  createSessionDraftValueDigest,
  formatSessionDraftReceiptReplay,
  pruneSessionDraftMutationReceipts
} from '../../../src/background/services/sessionDraftStoreReceipts';
import {
  SESSION_DRAFT_LEASE_DURATION_MS,
  SESSION_DRAFT_MAX_RECEIPTS,
  SESSION_DRAFT_RECEIPT_TTL_MS,
  type SessionDraftEnvelope,
  type SessionDraftMutationOperation,
  type SessionDraftMutationReceipt,
  type SessionDraftMutationSuccessOutcome
} from '../../../src/shared/sessionDrafts';

const NOW = 2_000_000;
const KEY = 'aiob.sessionDraft.v1.reader.page.draft-1';

function digest(character = 'a'): string {
  return character.repeat(64);
}

function receipt(
  overrides: Partial<SessionDraftMutationReceipt> = {}
): SessionDraftMutationReceipt {
  return {
    requestId: 'request-1',
    operation: 'save',
    key: KEY,
    digest: digest(),
    outcome: 'saved',
    revision: 1,
    timestamp: NOW,
    ...overrides
  };
}

function envelope(revision: number): SessionDraftEnvelope {
  return {
    schemaVersion: 2,
    revision,
    draftId: 'draft-1',
    mode: 'reader',
    pageKey: 'page',
    pageUrl: 'https://example.com/article',
    pageTitle: 'Article',
    createdAt: NOW - 100,
    updatedAt: NOW,
    expiresAt: NOW + 10_000,
    status: 'active',
    payload: { text: 'draft body' },
    lease: {
      leaseId: 'lease-1',
      owner: { tabId: 7, frameId: 0, windowId: 11 },
      renewedAt: NOW,
      leaseExpiresAt: NOW + SESSION_DRAFT_LEASE_DURATION_MS
    }
  };
}

describe('sessionDraftStoreReceipts request digest', () => {
  it('canonicalizes nested object keys and binds the complete semantic request', async () => {
    const leftRequest = {
      operation: 'save',
      requestId: 'request-1',
      key: KEY,
      draft: {
        pageTitle: 'Article',
        payload: { z: 3, nested: { beta: true, alpha: ['first', 'second'] } }
      }
    };
    const rightRequest = {
      draft: {
        payload: { nested: { alpha: ['first', 'second'], beta: true }, z: 3 },
        pageTitle: 'Article'
      },
      key: KEY,
      requestId: 'request-1',
      operation: 'save'
    };
    const owner = { tabId: 7, frameId: 0, windowId: 11 };

    const [left, reordered, changed] = await Promise.all([
      createSessionDraftRequestDigest(leftRequest, owner),
      createSessionDraftRequestDigest(rightRequest, owner),
      createSessionDraftRequestDigest(
        {
          ...rightRequest,
          draft: { ...rightRequest.draft, pageTitle: 'Changed title' }
        },
        owner
      )
    ]);

    expect(left).toMatch(/^[a-f0-9]{64}$/u);
    expect(reordered).toBe(left);
    expect(changed).not.toBe(left);
  });

  it('binds stable tab and frame identity while excluding mutable window identity', async () => {
    const request = { operation: 'prune', requestId: 'request-1' };
    const [original, movedWindow, changedTab, changedFrame, ownerless] = await Promise.all([
      createSessionDraftRequestDigest(request, { tabId: 7, frameId: 0, windowId: 11 }),
      createSessionDraftRequestDigest(request, { tabId: 7, frameId: 0, windowId: 99 }),
      createSessionDraftRequestDigest(request, { tabId: 8, frameId: 0, windowId: 11 }),
      createSessionDraftRequestDigest(request, { tabId: 7, frameId: 1, windowId: 11 }),
      createSessionDraftRequestDigest(request)
    ]);

    expect(movedWindow).toBe(original);
    expect(changedTab).not.toBe(original);
    expect(changedFrame).not.toBe(original);
    expect(ownerless).not.toBe(original);
  });

  it('rejects sparse arrays instead of digesting them as explicit null values', async () => {
    const sparse = new Array(1);
    await expect(
      createSessionDraftRequestDigest({ operation: 'save', requestId: 'sparse', sparse })
    ).rejects.toThrow('Sparse JSON arrays are not supported.');
    await expect(
      createSessionDraftRequestDigest({ operation: 'save', requestId: 'sparse', sparse: [null] })
    ).resolves.toMatch(/^[a-f0-9]{64}$/u);
  });

  it('normalizes explicitly undefined optional fields to their JSON-omitted form', async () => {
    const request = { operation: 'save', requestId: 'optional' };
    await expect(createSessionDraftRequestDigest({ ...request, leaseId: undefined })).resolves.toBe(
      await createSessionDraftRequestDigest(request)
    );
  });

  it('rejects hidden and symbol request fields instead of omitting their semantics', async () => {
    const hidden = { operation: 'save', requestId: 'hidden' };
    Object.defineProperty(hidden, 'payload', { value: { text: 'secret' }, enumerable: false });
    const symbol = { operation: 'save', requestId: 'symbol', [Symbol('payload')]: 'secret' };
    const extraArray = ['visible'];
    Object.defineProperty(extraArray, 'hidden', { value: 'secret', enumerable: false });
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, 0, { get: () => 'secret', enumerable: true });

    await expect(createSessionDraftRequestDigest(hidden)).rejects.toThrow(
      'JSON objects cannot contain hidden or symbol fields.'
    );
    await expect(createSessionDraftRequestDigest(symbol)).rejects.toThrow(
      'JSON objects cannot contain hidden or symbol fields.'
    );
    await expect(
      createSessionDraftRequestDigest({ operation: 'save', requestId: 'array', extraArray })
    ).rejects.toThrow('JSON arrays cannot contain extra fields.');
    await expect(
      createSessionDraftRequestDigest({ operation: 'save', requestId: 'accessor', accessorArray })
    ).rejects.toThrow('JSON arrays cannot contain accessors.');
  });
});

describe('sessionDraftStoreReceipts mutation start', () => {
  it('returns a digest and pruned receipts when the request is ready to mutate', async () => {
    const request = { operation: 'save', requestId: 'request-ready', key: KEY, revision: 1 };
    const owner = { tabId: 7, frameId: 0, windowId: 11 };
    const active = receipt({ requestId: 'active', timestamp: NOW - 1 });
    const expired = receipt({
      requestId: 'expired',
      timestamp: NOW - SESSION_DRAFT_RECEIPT_TTL_MS
    });
    const expectedDigest = await createSessionDraftRequestDigest(request, owner);

    await expect(
      beginSessionDraftMutation({
        request,
        operation: 'save',
        exactKey: KEY,
        receipts: [expired, active],
        now: NOW,
        owner
      })
    ).resolves.toEqual({ kind: 'ready', digest: expectedDigest, receipts: [active] });
  });

  it('replays a matching persisted claim without requiring its selected key as input', async () => {
    const request = {
      operation: 'selectAndClaim',
      requestId: 'request-claim',
      mode: 'reader',
      pageUrl: 'https://example.com/article'
    };
    const owner = { tabId: 7, frameId: 0, windowId: 11 };
    const committed = receipt({
      requestId: request.requestId,
      operation: 'claim',
      outcome: 'claimed',
      digest: await createSessionDraftRequestDigest(request, owner),
      selectionReason: 'restorable',
      invalidRemovedCount: 0
    });

    await expect(
      beginSessionDraftMutation({
        request,
        operation: 'claim',
        receipts: structuredClone([committed]),
        now: NOW + 1,
        owner
      })
    ).resolves.toEqual({ kind: 'replay', receipt: committed });
  });

  it('returns reuse when a persisted request ID belongs to different semantics', async () => {
    const original = { operation: 'save', requestId: 'request-reused', key: KEY, revision: 1 };
    const changed = { ...original, revision: 2 };
    const committed = receipt({
      requestId: original.requestId,
      digest: await createSessionDraftRequestDigest(original)
    });

    await expect(
      beginSessionDraftMutation({
        request: changed,
        operation: 'save',
        exactKey: KEY,
        receipts: [committed],
        now: NOW + 1
      })
    ).resolves.toEqual({ kind: 'reuse' });
  });
});

describe('sessionDraftStoreReceipts durable lookup', () => {
  const operationCases: readonly [
    SessionDraftMutationOperation,
    SessionDraftMutationSuccessOutcome
  ][] = [
    ['save', 'saved'],
    ['finalize', 'finalized'],
    ['remove', 'removed'],
    ['claim', 'claimed'],
    ['renew', 'renewed'],
    ['release', 'released'],
    ['prune', 'pruned']
  ];

  it.each(operationCases)(
    'replays a persisted %s outcome after a restart without creating another receipt',
    (operation, outcome) => {
      const committed = receipt({
        requestId: `request-${operation}`,
        operation,
        outcome,
        ...(operation === 'prune' ? { key: 'aiob.sessionDraft.index.v1' } : {}),
        ...(operation === 'prune' ? { revision: undefined, removedCount: 3 } : {}),
        ...(operation === 'claim' ? { selectionReason: 'restorable', invalidRemovedCount: 2 } : {})
      });
      const persisted = addSessionDraftMutationReceipt([], committed, NOW);
      const restartedIndexReceipts = structuredClone(persisted);

      const checked = checkSessionDraftMutationReceipt(
        restartedIndexReceipts,
        {
          requestId: committed.requestId,
          operation,
          key: committed.key,
          digest: committed.digest
        },
        NOW + 1
      );

      expect(checked).toEqual({ kind: 'replay', receipt: committed });
      expect(restartedIndexReceipts).toHaveLength(1);
    }
  );

  it.each([
    ['digest', receipt({ digest: digest('b') })],
    ['operation', receipt({ operation: 'renew' })],
    ['key', receipt({ key: `${KEY}:other` })]
  ])('rejects request ID reuse with a changed %s', (_, changed) => {
    const committed = receipt();
    const checked = checkSessionDraftMutationReceipt(
      [committed],
      {
        requestId: committed.requestId,
        operation: changed.operation,
        key: changed.key,
        digest: changed.digest
      },
      NOW + 1
    );

    expect(checked).toEqual({ kind: 'conflict', code: 'REQUEST_ID_REUSE' });
  });

  it('returns pruned receipts on a miss so the next successful write can persist cleanup', () => {
    const active = receipt({ requestId: 'active', timestamp: NOW - 1 });
    const expired = receipt({
      requestId: 'expired',
      timestamp: NOW - SESSION_DRAFT_RECEIPT_TTL_MS
    });

    expect(
      checkSessionDraftMutationReceipt(
        [expired, active],
        { requestId: 'new', operation: 'save', key: KEY, digest: digest('c') },
        NOW
      )
    ).toEqual({ kind: 'miss', receipts: [active] });
  });
});

describe('sessionDraftStoreReceipts retention', () => {
  it('drops malformed, expired, future-dated, and older duplicate receipts', () => {
    const newest = receipt({ requestId: 'duplicate', digest: digest('b'), timestamp: NOW - 1 });
    const older = receipt({ requestId: 'duplicate', timestamp: NOW - 2 });
    const active = receipt({ requestId: 'active', timestamp: NOW - 3 });
    const expired = receipt({
      requestId: 'expired',
      timestamp: NOW - SESSION_DRAFT_RECEIPT_TTL_MS
    });
    const malformed = { ...receipt({ requestId: 'malformed' }), payload: { secret: true } };
    const future = receipt({ requestId: 'future', timestamp: NOW + 1 });

    expect(
      pruneSessionDraftMutationReceipts([older, expired, malformed, future, active, newest], NOW)
    ).toEqual([newest, active]);
  });

  it('keeps at most the deterministic newest 128 receipts', () => {
    const candidates = Array.from({ length: SESSION_DRAFT_MAX_RECEIPTS + 3 }, (_, index) =>
      receipt({
        requestId: `request-${String(index).padStart(3, '0')}`,
        timestamp: NOW - index
      })
    );

    const pruned = pruneSessionDraftMutationReceipts([...candidates].reverse(), NOW);

    expect(pruned).toHaveLength(SESSION_DRAFT_MAX_RECEIPTS);
    expect(pruned.map((entry) => entry.requestId)).toEqual(
      candidates.slice(0, SESSION_DRAFT_MAX_RECEIPTS).map((entry) => entry.requestId)
    );
  });

  it('uses stable lexical receipt fields to order equal timestamps', () => {
    const alpha = receipt({ requestId: 'alpha' });
    const omega = receipt({ requestId: 'omega' });

    expect(pruneSessionDraftMutationReceipts([omega, alpha], NOW)).toEqual([alpha, omega]);
    expect(pruneSessionDraftMutationReceipts([alpha, omega], NOW)).toEqual([alpha, omega]);
  });

  it('stores metadata only and rejects receipt-shaped values carrying user data', () => {
    const committed = receipt({
      key: 'aiob.sessionDraft.index.v1',
      operation: 'prune',
      outcome: 'pruned',
      revision: undefined,
      removedCount: 1
    });
    const [stored] = addSessionDraftMutationReceipt([], committed, NOW);
    if (!stored) throw new Error('Expected a stored receipt.');

    expect(Object.keys(stored).sort()).toEqual([
      'digest',
      'key',
      'operation',
      'outcome',
      'removedCount',
      'requestId',
      'revision',
      'timestamp'
    ]);
    expect(JSON.stringify(stored)).not.toMatch(
      /payload|pageTitle|pageUrl|owner|lease|screenshot|userData/iu
    );
    expect(() =>
      addSessionDraftMutationReceipt(
        [],
        {
          ...committed,
          payload: { secret: 'user text' },
          pageTitle: 'Secret title',
          pageUrl: 'https://secret.example/',
          owner: { tabId: 7, frameId: 0 },
          lease: { leaseId: 'secret' },
          screenshot: 'secret image',
          userData: 'secret metadata'
        },
        NOW
      )
    ).toThrow();
  });
});

describe('sessionDraftStoreReceipts builders', () => {
  it('builds a strict non-secret receipt while preserving optional claim metadata', () => {
    const { timestamp, ...input } = receipt({
      operation: 'claim',
      outcome: 'claimed',
      revision: 3,
      selectionReason: 'legacy_owner_inactive',
      invalidRemovedCount: 2
    });

    expect(timestamp).toBe(NOW);
    expect(createSessionDraftMutationReceipt(input, NOW + 1)).toEqual({
      ...input,
      timestamp: NOW + 1
    });
    const unsafeInput = { ...input, payload: { secret: 'user text' } };
    expect(() => createSessionDraftMutationReceipt(unsafeInput, NOW + 1)).toThrow();
  });

  it('maps exact removal keys with the receipt key and all optional metadata intact', () => {
    const committed = receipt({
      key: KEY,
      operation: 'claim',
      outcome: 'claimed',
      revision: 4,
      resultDigest: digest('d'),
      selectionReason: 'restorable',
      invalidRemovedCount: 1
    });
    const exactKeys = [KEY, 'aiob.sessionDraft.v1.reader.page.draft-2'];

    expect(createSessionDraftPendingRemovals(committed, exactKeys)).toEqual(
      exactKeys.map((key) => ({
        requestId: committed.requestId,
        operation: committed.operation,
        digest: committed.digest,
        resultDigest: committed.resultDigest,
        outcome: committed.outcome,
        revision: committed.revision,
        selectionReason: committed.selectionReason,
        invalidRemovedCount: committed.invalidRemovedCount,
        timestamp: committed.timestamp,
        key,
        receiptKey: committed.key
      }))
    );
    expect(() => createSessionDraftPendingRemovals(committed, [''])).toThrow();
  });
});

describe('sessionDraftStoreReceipts replay formatting', () => {
  it('returns an exact reread envelope only while the recorded generation is current', async () => {
    const current = envelope(4);
    const committed = receipt({
      operation: 'renew',
      outcome: 'renewed',
      revision: 4,
      resultDigest: await createSessionDraftValueDigest(current)
    });

    await expect(
      formatSessionDraftReceiptReplay(committed, { key: KEY, envelope: current })
    ).resolves.toEqual({
      replay: {
        replayed: true,
        commit: {
          operation: 'renew',
          outcome: 'renewed',
          key: KEY,
          revision: 4
        },
        requiresReadExact: false
      },
      envelope: current
    });
  });

  it.each([
    ['superseded revision', { key: KEY, envelope: envelope(5) }],
    ['wrong key', { key: 'aiob.sessionDraft.v1.reader.page.draft-2', envelope: envelope(4) }],
    ['recreated generation', { key: KEY, envelope: { ...envelope(4), payload: { text: 'new' } } }],
    ['missing', undefined]
  ])('returns metadata only when the committed envelope is %s', async (_, current) => {
    const committedEnvelope = envelope(4);
    const committed = receipt({
      operation: 'finalize',
      outcome: 'finalized',
      revision: 4,
      resultDigest: await createSessionDraftValueDigest(committedEnvelope)
    });
    const formatted = await formatSessionDraftReceiptReplay(committed, current);

    expect(formatted).toEqual({
      replay: {
        replayed: true,
        commit: {
          operation: 'finalize',
          outcome: 'finalized',
          key: KEY,
          revision: 4
        },
        requiresReadExact: true
      }
    });
    expect('envelope' in formatted).toBe(false);
    expect('code' in formatted).toBe(false);
  });

  it('preserves metadata-only prune outcomes without inventing a revision', async () => {
    const committed = receipt({
      key: 'aiob.sessionDraft.index.v1',
      operation: 'prune',
      outcome: 'pruned',
      revision: undefined,
      removedCount: 6
    });

    await expect(formatSessionDraftReceiptReplay(committed)).resolves.toEqual({
      replay: {
        replayed: true,
        commit: {
          operation: 'prune',
          outcome: 'pruned',
          key: 'aiob.sessionDraft.index.v1',
          removedCount: 6
        },
        requiresReadExact: true
      }
    });
  });

  it('preserves the recorded claim reason and invalid-removal count', async () => {
    const committed = receipt({
      operation: 'claim',
      outcome: 'claimed',
      revision: 3,
      selectionReason: 'expired_owner_inactive',
      invalidRemovedCount: 2
    });

    await expect(formatSessionDraftReceiptReplay(committed)).resolves.toEqual({
      replay: {
        replayed: true,
        commit: {
          operation: 'claim',
          outcome: 'claimed',
          key: KEY,
          revision: 3,
          selectionReason: 'expired_owner_inactive',
          invalidRemovedCount: 2
        },
        requiresReadExact: true
      }
    });
  });
});
