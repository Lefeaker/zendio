import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SESSION_DRAFT_RETENTION_POLICY,
  SESSION_DRAFT_INDEX_KEY,
  SESSION_DRAFT_LEASE_DURATION_MS,
  SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS,
  SESSION_DRAFT_MAX_RECEIPTS,
  SESSION_DRAFT_QUARANTINE_KEY,
  SessionDraftEnvelopeMutationResultSchema,
  SessionDraftEnvelopeSchema,
  SessionDraftIndexSchema,
  SessionDraftListResultSchema,
  SessionDraftMutationReceiptSchema,
  SessionDraftPayloadSchema,
  SessionDraftPruneResultSchema,
  SessionDraftReadExactResultSchema,
  SessionDraftRemoveResultSchema,
  SessionDraftRemovalTombstoneSchema,
  SessionDraftSaveRequestSchema,
  SessionDraftSelectAndClaimResultSchema,
  compareSessionDraftText,
  createSessionDraftIndex,
  createSessionDraftIndexEntry,
  createSessionDraftPageKey,
  createSessionDraftRemovalTombstone,
  createSessionDraftStorageKey,
  normalizeLegacySessionDraftRecord,
  normalizeSessionDraftPageUrl,
  parseSessionDraftStorageKey,
  selectRetainedSessionDraftItems,
  selectSessionDraftRetentionRemovals,
  type SessionDraftEnvelope,
  type SessionDraftIndexEntry,
  type SessionDraftMutationReceipt,
  type SessionDraftPayload,
  type SessionDraftPendingRemoval
} from '@shared/sessionDrafts';

const NOW = 1_000_000;
const LEASE = {
  leaseId: 'lease-1',
  owner: { tabId: 7, frameId: 0, windowId: 3 },
  renewedAt: NOW,
  leaseExpiresAt: NOW + SESSION_DRAFT_LEASE_DURATION_MS
};

function createEnvelope(overrides: Partial<SessionDraftEnvelope> = {}): SessionDraftEnvelope {
  const pageUrl = 'https://example.com/post#:~:text=Alpha';
  return {
    schemaVersion: 2,
    revision: 1,
    draftId: 'draft-1',
    mode: 'reader',
    pageKey: createSessionDraftPageKey('reader', pageUrl),
    pageUrl,
    pageTitle: 'Title',
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: NOW + DEFAULT_SESSION_DRAFT_RETENTION_POLICY.retentionMs,
    status: 'active',
    lease: LEASE,
    payload: { screenshotRequested: true, screenshotRef: { cacheKey: 'cache-1' } },
    ...overrides
  };
}

function createEntry(id: string, updatedAt: number, pageKey = id): SessionDraftIndexEntry {
  return {
    key: `aiob.sessionDraft.v1.reader.${pageKey}.${id}`,
    draftId: id,
    mode: 'reader',
    pageKey,
    recordSchemaVersion: 2,
    revision: 1,
    updatedAt,
    expiresAt: updatedAt + DEFAULT_SESSION_DRAFT_RETENTION_POLICY.retentionMs,
    status: 'restorable'
  };
}

describe('session draft v2 shared contract', () => {
  it('retains the physical v1 key grammar and parses encoded exact identities', () => {
    const pageUrl = 'https://example.com/post#section:~:text=Alpha';
    const pageKey = createSessionDraftPageKey('reader', pageUrl);
    const key = createSessionDraftStorageKey({
      mode: 'reader',
      pageKey,
      draftId: 'draft.id/with space'
    });

    expect(SESSION_DRAFT_INDEX_KEY).toBe('aiob.sessionDraft.index.v1');
    expect(SESSION_DRAFT_QUARANTINE_KEY).toBe('aiob.sessionDraft.index.v1.quarantine.latest');
    expect(key).toMatch(/^aiob\.sessionDraft\.v1\.reader\.[a-z0-9]+\./);
    expect(parseSessionDraftStorageKey(key)).toEqual({
      mode: 'reader',
      pageKey,
      draftId: 'draft.id/with space'
    });
    expect(
      parseSessionDraftStorageKey('aiob.sessionDraft.v1.reader.page.%E0%A4%A')
    ).toBeUndefined();
    expect(normalizeSessionDraftPageUrl('reader', pageUrl)).toBe(
      'https://example.com/post#:~:text=Alpha'
    );
    expect(['a', '_', 'Z'].sort(compareSessionDraftText)).toEqual(['Z', '_', 'a']);
  });

  it('enforces revision and lease/status invariants with trusted top-level ownership', () => {
    expect(SessionDraftEnvelopeSchema.safeParse(createEnvelope()).success).toBe(true);
    expect(SessionDraftEnvelopeSchema.safeParse(createEnvelope({ revision: 0 })).success).toBe(
      false
    );
    expect(SessionDraftEnvelopeSchema.safeParse(createEnvelope({ lease: undefined })).success).toBe(
      false
    );
    expect(
      SessionDraftEnvelopeSchema.safeParse(
        createEnvelope({ status: 'restorable', lease: undefined })
      ).success
    ).toBe(true);
    expect(
      SessionDraftEnvelopeSchema.safeParse(createEnvelope({ status: 'restorable' })).success
    ).toBe(false);
    expect(
      SessionDraftEnvelopeSchema.safeParse(createEnvelope({ status: 'exported' })).success
    ).toBe(true);
    expect(
      SessionDraftEnvelopeSchema.safeParse(
        createEnvelope({ lease: { ...LEASE, owner: { tabId: -1, frameId: 0 } } })
      ).success
    ).toBe(false);
    expect(
      SessionDraftEnvelopeSchema.safeParse(
        createEnvelope({
          lease: { ...LEASE, leaseExpiresAt: NOW + SESSION_DRAFT_LEASE_DURATION_MS - 1 }
        })
      ).success
    ).toBe(false);
    expect(
      SessionDraftEnvelopeSchema.safeParse(
        createEnvelope({
          lease: { ...LEASE, leaseExpiresAt: NOW + SESSION_DRAFT_LEASE_DURATION_MS + 1 }
        })
      ).success
    ).toBe(false);
    expect(
      SessionDraftEnvelopeSchema.safeParse(createEnvelope({ lease: { ...LEASE, leaseId: '' } }))
        .success
    ).toBe(false);
    expect(
      SessionDraftEnvelopeSchema.safeParse(
        createEnvelope({ lease: { ...LEASE, leaseId: 'x'.repeat(129) } })
      ).success
    ).toBe(false);
    expect(
      SessionDraftEnvelopeSchema.safeParse(
        createEnvelope({ lease: { ...LEASE, leaseId: 'x'.repeat(128) } })
      ).success
    ).toBe(true);
    expect(SESSION_DRAFT_LEASE_DURATION_MS).toBe(30_000);
    expect(SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS).toBe(10_000);
  });

  it('accepts metadata-only screenshot intent but rejects owner, fallback, and binary payloads', () => {
    const valid: SessionDraftPayload = {
      screenshotRequested: true,
      screenshotRef: { cacheKey: 'blob-cache-key', mimeType: 'image/png' }
    };
    const nestedOwner = { nested: { ownerContext: { tabId: 1, frameId: 0 } } };
    const cyclic: SessionDraftPayload = {};
    cyclic.self = cyclic;
    const sparseItems: string[] = [];
    sparseItems.length = 2;
    sparseItems[1] = 'second';
    const accessor = {};
    Object.defineProperty(accessor, 'value', { get: () => 'secret', enumerable: true });
    const hiddenSerializer = { text: 'x'.repeat(600 * 1024) };
    Object.defineProperty(hiddenSerializer, 'toJSON', {
      value: () => ({ text: 'small' }),
      enumerable: false
    });
    const hiddenField = { visible: 'safe' };
    Object.defineProperty(hiddenField, 'secret', { value: 'hidden', enumerable: false });
    const symbolField = { visible: 'safe', [Symbol('secret')]: 'hidden' };
    const hiddenArray = ['visible'];
    Object.defineProperty(hiddenArray, 'secret', { value: 'hidden', enumerable: false });
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, 0, { get: () => 'secret', enumerable: true });

    expect(SessionDraftPayloadSchema.safeParse(valid).success).toBe(true);
    expect(SessionDraftPayloadSchema.safeParse(null).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ ownerContext: { tabId: 1 } }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse(nestedOwner).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ screenshot: 'base64' }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ screenshotFallback: true }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ screenshotBase64: 'AAAA' }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ fallbackScreenshot: true }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ imageBytes: [1, 2] }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ dataUrl: 'base64' }).success).toBe(false);
    expect(
      SessionDraftPayloadSchema.safeParse({ image: 'data:image/png;base64,AAAA' }).success
    ).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ bytes: new Uint8Array([1]) }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ buffer: new ArrayBuffer(4) }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse(new Blob(['bytes'])).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse(cyclic).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ items: sparseItems }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse(accessor).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse(hiddenSerializer).success).toBe(false);
    expect(
      SessionDraftEnvelopeSchema.safeParse(createEnvelope({ payload: hiddenSerializer })).success
    ).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse(hiddenField).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse(symbolField).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ items: hiddenArray }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ items: accessorArray }).success).toBe(false);
    expect(SessionDraftPayloadSchema.safeParse({ score: Number.NaN }).success).toBe(false);
    expect(JSON.parse(JSON.stringify(valid))).toEqual(structuredClone(valid));
  });

  it('rejects an envelope over 512 KiB', () => {
    const oversized = createEnvelope({ payload: { text: 'x'.repeat(512 * 1024) } });
    const parsed = SessionDraftEnvelopeSchema.safeParse(oversized);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toContain(
        'SESSION_DRAFT_PAYLOAD_TOO_LARGE'
      );
    }
  });

  it('normalizes legacy v1 to revision zero without mutating storage input or leaking owner payload', () => {
    const legacy = {
      schemaVersion: 1,
      draftId: 'legacy-1',
      mode: 'video',
      pageKey: 'legacy-page',
      pageUrl: 'https://video.example/watch?v=1',
      pageTitle: 'Legacy',
      createdAt: 1,
      updatedAt: 2,
      expiresAt: 3,
      status: 'active',
      payload: { ownerContext: { tabId: 8, frameId: 2 }, screenshotRequested: true }
    };
    const before = JSON.stringify(legacy);
    const normalized = normalizeLegacySessionDraftRecord(legacy);

    expect(normalized).toEqual({
      ...legacy,
      revision: 0,
      payload: { screenshotRequested: true },
      legacyOwnerContext: { tabId: 8, frameId: 2 }
    });
    expect(JSON.stringify(legacy)).toBe(before);
    expect(normalizeLegacySessionDraftRecord({ ...legacy, payload: { screenshot: 'bytes' } })).toBe(
      undefined
    );
    expect(
      normalizeLegacySessionDraftRecord({
        ...legacy,
        payload: { nested: { ownerContext: { tabId: 8, frameId: 2 } } }
      })
    ).toBeUndefined();
  });

  it('validates bounded receipts, pending removals, and reconstructible physical tombstones', () => {
    const pending: SessionDraftPendingRemoval = {
      key: 'aiob.sessionDraft.v1.reader.page.old',
      requestId: 'request-1',
      operation: 'remove',
      receiptKey: 'aiob.sessionDraft.v1.reader.page.old',
      digest: 'a'.repeat(64),
      outcome: 'removed',
      revision: 3,
      timestamp: NOW
    };
    const tombstone = createSessionDraftRemovalTombstone(pending);
    const receipt: SessionDraftMutationReceipt = {
      requestId: pending.requestId,
      operation: pending.operation,
      key: pending.receiptKey,
      digest: pending.digest,
      outcome: pending.outcome,
      revision: pending.revision,
      timestamp: pending.timestamp
    };
    const index = createSessionDraftIndex();
    index.receipts = Array.from({ length: SESSION_DRAFT_MAX_RECEIPTS }, (_, position) => ({
      ...receipt,
      requestId: `request-${position}`
    }));
    index.pendingRemovals = [pending];

    expect(SessionDraftRemovalTombstoneSchema.safeParse(tombstone).success).toBe(true);
    expect(SessionDraftIndexSchema.safeParse(index).success).toBe(true);
    expect(
      SessionDraftIndexSchema.safeParse({
        ...index,
        receipts: [...index.receipts, { ...receipt, requestId: 'overflow' }]
      }).success
    ).toBe(false);
    expect(
      SessionDraftRemovalTombstoneSchema.safeParse({ ...tombstone, payload: {} }).success
    ).toBe(false);
    expect(JSON.stringify(tombstone)).not.toMatch(/owner|lease|payload|screenshot/i);
  });

  it('correlates receipt operations with exact outcomes and metadata', () => {
    const common = {
      requestId: 'request-correlated',
      key: 'aiob.sessionDraft.v1.reader.page.draft',
      digest: 'c'.repeat(64),
      timestamp: NOW
    };
    const valid = [
      {
        ...common,
        operation: 'save',
        outcome: 'saved',
        revision: 1,
        resultDigest: 'b'.repeat(64)
      },
      { ...common, operation: 'finalize', outcome: 'finalized', revision: 2 },
      { ...common, operation: 'remove', outcome: 'removed', revision: 2 },
      {
        ...common,
        operation: 'claim',
        outcome: 'claimed',
        revision: 3,
        selectionReason: 'restorable',
        invalidRemovedCount: 0
      },
      {
        ...common,
        key: SESSION_DRAFT_INDEX_KEY,
        operation: 'claim',
        outcome: 'none',
        invalidRemovedCount: 0
      },
      {
        ...common,
        key: SESSION_DRAFT_INDEX_KEY,
        operation: 'claim',
        outcome: 'invalid_removed',
        invalidRemovedCount: 2
      },
      { ...common, operation: 'renew', outcome: 'renewed', revision: 4 },
      { ...common, operation: 'release', outcome: 'released', revision: 5 },
      {
        ...common,
        key: SESSION_DRAFT_INDEX_KEY,
        operation: 'prune',
        outcome: 'pruned',
        removedCount: 6
      }
    ];
    const invalid = [
      { ...common, operation: 'save', outcome: 'pruned', revision: 1 },
      { ...common, operation: 'save', outcome: 'saved' },
      { ...common, operation: 'save', outcome: 'saved', revision: 0 },
      { ...common, operation: 'claim', outcome: 'claimed', revision: 1 },
      { ...common, operation: 'claim', outcome: 'none', invalidRemovedCount: 1 },
      { ...common, operation: 'claim', outcome: 'invalid_removed', invalidRemovedCount: 0 },
      { ...common, operation: 'prune', outcome: 'pruned', revision: 1, removedCount: 1 },
      { ...common, operation: 'save', outcome: 'saved', revision: 1, digest: 'G'.repeat(64) },
      {
        ...common,
        operation: 'remove',
        outcome: 'removed',
        revision: 1,
        resultDigest: 'b'.repeat(64)
      },
      {
        ...common,
        key: SESSION_DRAFT_INDEX_KEY,
        operation: 'prune',
        outcome: 'pruned',
        removedCount: 1,
        resultDigest: 'b'.repeat(64)
      },
      {
        ...common,
        key: SESSION_DRAFT_INDEX_KEY,
        operation: 'claim',
        outcome: 'none',
        invalidRemovedCount: 0,
        resultDigest: 'b'.repeat(64)
      }
    ];

    for (const receipt of valid) {
      expect(SessionDraftMutationReceiptSchema.safeParse(receipt).success).toBe(true);
    }
    for (const receipt of invalid) {
      expect(SessionDraftMutationReceiptSchema.safeParse(receipt).success).toBe(false);
    }
  });

  it('keeps message owner metadata out-of-band and accepts only exact operations', () => {
    const envelope = createEnvelope();
    const key = createSessionDraftStorageKey(envelope);
    const request = {
      operation: 'save',
      requestId: 'save-1',
      key,
      expectedRevision: null,
      draft: {
        draftId: envelope.draftId,
        mode: envelope.mode,
        pageUrl: envelope.pageUrl,
        pageTitle: envelope.pageTitle,
        payload: envelope.payload
      }
    };

    expect(SessionDraftSaveRequestSchema.safeParse(request).success).toBe(true);
    expect(
      SessionDraftSaveRequestSchema.safeParse({
        ...request,
        ownerContext: { tabId: 1, frameId: 0 }
      }).success
    ).toBe(false);
    expect(
      SessionDraftSaveRequestSchema.safeParse({ ...request, expectedRevision: 0.5 }).success
    ).toBe(false);
  });

  it('keeps every response variant portable across Chrome and Firefox serialization', () => {
    const envelope = createEnvelope();
    const found = { outcome: 'found', envelope };
    const saved = { outcome: 'saved', revision: envelope.revision, envelope };
    const finalizedEnvelope = createEnvelope({ revision: 2, status: 'exported' });
    const renewedEnvelope = createEnvelope({ revision: 2 });
    const releasedEnvelope = createEnvelope({
      revision: 2,
      status: 'restorable',
      lease: undefined
    });
    const claimed = {
      outcome: 'claimed',
      revision: envelope.revision,
      envelope,
      selectionReason: 'restorable',
      invalidRemovedCount: 0
    };
    const saveReplay = {
      replayed: true,
      commit: {
        operation: 'save',
        outcome: 'saved',
        key: createSessionDraftStorageKey(envelope),
        revision: envelope.revision
      },
      requiresReadExact: true
    };
    const claimReplay = {
      replayed: true,
      commit: {
        operation: 'claim',
        outcome: 'none',
        key: SESSION_DRAFT_INDEX_KEY,
        invalidRemovedCount: 0
      },
      requiresReadExact: true
    };
    const claimedReplay = {
      replayed: true,
      commit: {
        operation: 'claim',
        outcome: 'claimed',
        key: createSessionDraftStorageKey(envelope),
        revision: 1,
        selectionReason: 'restorable',
        invalidRemovedCount: 0
      },
      requiresReadExact: false
    };
    const removeReplay = {
      replayed: true,
      commit: {
        operation: 'remove',
        outcome: 'removed',
        key: createSessionDraftStorageKey(envelope),
        revision: 1
      },
      requiresReadExact: true
    };
    const pruneReplay = {
      replayed: true,
      commit: {
        operation: 'prune',
        outcome: 'pruned',
        key: SESSION_DRAFT_INDEX_KEY,
        removedCount: 2
      },
      requiresReadExact: true
    };
    const invalidReplay = {
      replayed: true,
      commit: {
        operation: 'claim',
        outcome: 'invalid_removed',
        key: SESSION_DRAFT_INDEX_KEY,
        invalidRemovedCount: 1
      },
      requiresReadExact: true
    };
    const conflict = { outcome: 'conflict', code: 'REVISION_CONFLICT' };
    const recoveryFailed = { outcome: 'recovery_failed', code: 'INDEX_RECOVERY_FAILED' };
    const cases = [
      { schema: SessionDraftReadExactResultSchema, value: found },
      { schema: SessionDraftReadExactResultSchema, value: { outcome: 'missing' } },
      {
        schema: SessionDraftReadExactResultSchema,
        value: { outcome: 'invalid_removed', invalidRemovedCount: 1 }
      },
      { schema: SessionDraftReadExactResultSchema, value: recoveryFailed },
      {
        schema: SessionDraftListResultSchema,
        value: { outcome: 'listed', envelopes: [envelope], invalidRemovedCount: 0 }
      },
      { schema: SessionDraftListResultSchema, value: recoveryFailed },
      { schema: SessionDraftEnvelopeMutationResultSchema, value: saved },
      {
        schema: SessionDraftEnvelopeMutationResultSchema,
        value: { outcome: 'finalized', revision: 2, envelope: finalizedEnvelope }
      },
      {
        schema: SessionDraftEnvelopeMutationResultSchema,
        value: { outcome: 'renewed', revision: 2, envelope: renewedEnvelope }
      },
      {
        schema: SessionDraftEnvelopeMutationResultSchema,
        value: { outcome: 'released', revision: 2, envelope: releasedEnvelope }
      },
      {
        schema: SessionDraftEnvelopeMutationResultSchema,
        value: { outcome: 'saved', revision: 1, replay: saveReplay }
      },
      { schema: SessionDraftEnvelopeMutationResultSchema, value: conflict },
      { schema: SessionDraftEnvelopeMutationResultSchema, value: recoveryFailed },
      {
        schema: SessionDraftRemoveResultSchema,
        value: { outcome: 'removed', key: createSessionDraftStorageKey(envelope), revision: 1 }
      },
      {
        schema: SessionDraftRemoveResultSchema,
        value: {
          outcome: 'removed',
          key: createSessionDraftStorageKey(envelope),
          revision: 1,
          replay: removeReplay
        }
      },
      { schema: SessionDraftRemoveResultSchema, value: conflict },
      { schema: SessionDraftRemoveResultSchema, value: recoveryFailed },
      { schema: SessionDraftPruneResultSchema, value: { outcome: 'pruned', removedCount: 2 } },
      {
        schema: SessionDraftPruneResultSchema,
        value: { outcome: 'pruned', removedCount: 2, replay: pruneReplay }
      },
      { schema: SessionDraftPruneResultSchema, value: conflict },
      { schema: SessionDraftPruneResultSchema, value: recoveryFailed },
      { schema: SessionDraftSelectAndClaimResultSchema, value: claimed },
      {
        schema: SessionDraftSelectAndClaimResultSchema,
        value: { ...claimed, replay: claimedReplay }
      },
      {
        schema: SessionDraftSelectAndClaimResultSchema,
        value: {
          outcome: 'none',
          invalidRemovedCount: 0,
          replay: claimReplay
        }
      },
      {
        schema: SessionDraftSelectAndClaimResultSchema,
        value: { outcome: 'invalid_removed', invalidRemovedCount: 1 }
      },
      {
        schema: SessionDraftSelectAndClaimResultSchema,
        value: { outcome: 'invalid_removed', invalidRemovedCount: 1, replay: invalidReplay }
      },
      { schema: SessionDraftSelectAndClaimResultSchema, value: conflict },
      { schema: SessionDraftSelectAndClaimResultSchema, value: recoveryFailed }
    ];

    for (const entry of cases) {
      expect(entry.schema.safeParse(entry.value).success).toBe(true);
      expect(JSON.parse(JSON.stringify(entry.value))).toEqual(entry.value);
      expect(structuredClone(entry.value)).toEqual(entry.value);
    }
    expect(
      SessionDraftEnvelopeMutationResultSchema.safeParse({ outcome: 'saved', revision: 1 }).success
    ).toBe(false);
    expect(
      SessionDraftSelectAndClaimResultSchema.safeParse({
        outcome: 'claimed',
        revision: 1,
        selectionReason: 'restorable',
        invalidRemovedCount: 0
      }).success
    ).toBe(false);
    expect(
      SessionDraftReadExactResultSchema.safeParse({ outcome: 'recovery_failed' }).success
    ).toBe(false);
  });

  it('rejects response/replay correlation mismatches and internal legacy owner metadata', () => {
    const envelope = createEnvelope();
    const key = createSessionDraftStorageKey(envelope);
    const replay = {
      replayed: true,
      commit: { operation: 'save', outcome: 'saved', key, revision: 1 },
      requiresReadExact: false
    };
    const removeReplay = {
      ...replay,
      commit: { operation: 'remove', outcome: 'removed', key, revision: 1 },
      requiresReadExact: true
    };
    const pruneReplay = {
      ...replay,
      commit: {
        operation: 'prune',
        outcome: 'pruned',
        key: SESSION_DRAFT_INDEX_KEY,
        removedCount: 2
      },
      requiresReadExact: true
    };
    const claimReplay = {
      ...replay,
      commit: {
        operation: 'claim',
        outcome: 'none',
        key: SESSION_DRAFT_INDEX_KEY,
        invalidRemovedCount: 0
      },
      requiresReadExact: true
    };
    const invalidReplay = {
      ...replay,
      commit: {
        operation: 'claim',
        outcome: 'invalid_removed',
        key: SESSION_DRAFT_INDEX_KEY,
        invalidRemovedCount: 1
      },
      requiresReadExact: true
    };
    const invalid = [
      {
        schema: SessionDraftEnvelopeMutationResultSchema,
        value: { outcome: 'saved', revision: 2, envelope, replay }
      },
      {
        schema: SessionDraftEnvelopeMutationResultSchema,
        value: { outcome: 'finalized', revision: 1, envelope, replay }
      },
      {
        schema: SessionDraftEnvelopeMutationResultSchema,
        value: {
          outcome: 'saved',
          revision: 1,
          envelope,
          replay: { ...replay, commit: { ...replay.commit, key: `${key}.wrong` } }
        }
      },
      {
        schema: SessionDraftRemoveResultSchema,
        value: {
          outcome: 'removed',
          key,
          revision: 1,
          replay: {
            ...replay,
            requiresReadExact: true,
            commit: { operation: 'remove', outcome: 'removed', key, revision: 2 }
          }
        }
      },
      {
        schema: SessionDraftRemoveResultSchema,
        value: { outcome: 'removed', key: 'arbitrary', revision: 0 }
      },
      ...[
        {
          schema: SessionDraftRemoveResultSchema,
          value: {
            outcome: 'removed',
            key,
            revision: 1,
            replay: { ...removeReplay, requiresReadExact: false }
          }
        },
        {
          schema: SessionDraftPruneResultSchema,
          value: {
            outcome: 'pruned',
            removedCount: 2,
            replay: { ...pruneReplay, requiresReadExact: false }
          }
        },
        {
          schema: SessionDraftSelectAndClaimResultSchema,
          value: {
            outcome: 'none',
            invalidRemovedCount: 0,
            replay: { ...claimReplay, requiresReadExact: false }
          }
        },
        {
          schema: SessionDraftSelectAndClaimResultSchema,
          value: {
            outcome: 'invalid_removed',
            invalidRemovedCount: 1,
            replay: { ...invalidReplay, requiresReadExact: false }
          }
        }
      ],
      {
        schema: SessionDraftPruneResultSchema,
        value: {
          outcome: 'pruned',
          removedCount: 2,
          replay: {
            ...replay,
            requiresReadExact: true,
            commit: {
              operation: 'prune',
              outcome: 'pruned',
              key: SESSION_DRAFT_INDEX_KEY,
              removedCount: 1
            }
          }
        }
      },
      {
        schema: SessionDraftSelectAndClaimResultSchema,
        value: {
          outcome: 'none',
          invalidRemovedCount: 0,
          replay: {
            ...replay,
            requiresReadExact: true,
            commit: { operation: 'claim', outcome: 'none', key, invalidRemovedCount: 0 }
          }
        }
      },
      {
        schema: SessionDraftSelectAndClaimResultSchema,
        value: {
          outcome: 'invalid_removed',
          invalidRemovedCount: 2,
          replay: {
            ...replay,
            requiresReadExact: true,
            commit: {
              operation: 'claim',
              outcome: 'invalid_removed',
              key: SESSION_DRAFT_INDEX_KEY,
              invalidRemovedCount: 1
            }
          }
        }
      },
      ...[
        { revision: 2 },
        { key: `${key}.wrong` },
        { selectionReason: 'expired_owner_inactive' },
        { invalidRemovedCount: 1 }
      ].map((commitOverride) => ({
        schema: SessionDraftSelectAndClaimResultSchema,
        value: {
          outcome: 'claimed',
          revision: 1,
          envelope,
          selectionReason: 'restorable',
          invalidRemovedCount: 0,
          replay: {
            replayed: true,
            requiresReadExact: false,
            commit: {
              operation: 'claim',
              outcome: 'claimed',
              key,
              revision: 1,
              selectionReason: 'restorable',
              invalidRemovedCount: 0,
              ...commitOverride
            }
          }
        }
      }))
    ];
    for (const entry of invalid) expect(entry.schema.safeParse(entry.value).success).toBe(false);

    const legacy = normalizeLegacySessionDraftRecord({
      schemaVersion: 1,
      draftId: 'legacy-secret',
      mode: 'reader',
      pageKey: 'legacy-page',
      pageUrl: 'https://example.com/legacy-secret',
      pageTitle: 'Legacy',
      createdAt: 1,
      updatedAt: 2,
      expiresAt: 3,
      status: 'active',
      payload: { ownerContext: { tabId: 8, frameId: 2 }, text: 'public' }
    });
    expect(legacy).toBeDefined();
    expect(
      SessionDraftReadExactResultSchema.safeParse({ outcome: 'found', envelope: legacy }).success
    ).toBe(false);
    if (legacy) {
      const { legacyOwnerContext, ...publicLegacy } = legacy;
      expect(legacyOwnerContext).toEqual({ tabId: 8, frameId: 2 });
      expect(
        SessionDraftReadExactResultSchema.safeParse({ outcome: 'found', envelope: publicLegacy })
          .success
      ).toBe(true);
    }
  });

  it('applies deterministic 48h/5-page/20-item retention without draft-id deletion', () => {
    const entries = Array.from({ length: 6 }, (_, position) =>
      createEntry(`draft-${position}`, NOW + position, `page-${position}`)
    );
    const selection = selectSessionDraftRetentionRemovals(
      entries,
      NOW - 1,
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY
    );
    const items = Array.from({ length: 25 }, (_, position) => ({
      id: `item-${position}`,
      createdAt: position
    }));
    const tiedPages = Array.from({ length: 6 }, (_, position) =>
      createEntry(`tied-${position}`, NOW, `tied-page-${position}`)
    );
    const protectedEntry = [...tiedPages].sort((left, right) =>
      compareSessionDraftText(`${left.mode}:${left.pageKey}`, `${right.mode}:${right.pageKey}`)
    )[tiedPages.length - 1];
    if (!protectedEntry) throw new Error('Expected a protected retention entry.');
    const protectedSelection = selectSessionDraftRetentionRemovals(
      tiedPages,
      NOW - 1,
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY,
      undefined,
      protectedEntry.key
    );

    expect(selection.retained.map((entry) => entry.draftId)).toEqual([
      'draft-5',
      'draft-4',
      'draft-3',
      'draft-2',
      'draft-1'
    ]);
    expect(selection.removed.map((entry) => entry.draftId)).toEqual(['draft-0']);
    expect(
      selectRetainedSessionDraftItems(items, DEFAULT_SESSION_DRAFT_RETENTION_POLICY).map(
        (item) => item.id
      )
    ).toEqual(Array.from({ length: 20 }, (_, position) => `item-${position + 5}`));
    expect(createSessionDraftIndexEntry(entries[0]?.key ?? '', createEnvelope()).key).toBe(
      entries[0]?.key
    );
    expect(protectedSelection.retained).toHaveLength(5);
    expect(protectedSelection.retained.map((entry) => entry.key)).toContain(protectedEntry.key);
    expect(protectedSelection.removed.map((entry) => entry.key)).not.toContain(protectedEntry.key);
  });
});
