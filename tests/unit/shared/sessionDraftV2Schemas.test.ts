import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SESSION_DRAFT_RETENTION_POLICY,
  DEFAULT_SESSION_DRAFT_STORAGE_POLICY,
  FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE,
  FREE_SESSION_DRAFT_MAX_RESTORABLE_PAGES,
  FREE_SESSION_DRAFT_RETENTION_MS,
  SESSION_DRAFT_INDEX_KEY,
  SESSION_DRAFT_LEASE_DURATION_MS,
  SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS,
  SESSION_DRAFT_MAX_RECEIPTS,
  SESSION_DRAFT_MAX_ENTRIES,
  SESSION_DRAFT_QUARANTINE_KEY,
  SessionDraftEnvelopeMutationResultSchema,
  SessionDraftConflictCodeSchema,
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
  SessionDraftStatusSchema,
  compareSessionDraftText,
  createLegacySessionDraftPageKey,
  createSessionDraftIndex,
  createSessionDraftIndexEntry,
  createSessionDraftPageKey,
  createSessionDraftRemovalTombstone,
  createSessionDraftStorageKey,
  createSessionDraftStoragePolicy,
  filterSessionCommentDraftsForRetainedIds,
  getSessionDraftEffectiveExpiresAt,
  normalizeLegacySessionDraftRecord,
  normalizeSessionDraftRetentionPolicy,
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
const COLLIDING_PAGE_URLS: readonly [string, string] = [
  'https://example.com/reader/1ctg9w7-1jx99je',
  'https://example.com/reader/1d2u5vn-q239ae'
];
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
  it('preserves the frozen URL normalization and storage policy compatibility contract', () => {
    expect(createSessionDraftPageKey('video', 'https://example.com/watch?v=1#t=12')).toBe(
      createSessionDraftPageKey('video', 'https://example.com/watch?v=1#chapter-1')
    );
    expect(
      normalizeSessionDraftPageUrl('reader', 'https://example.com/post#section:~:text=Alpha')
    ).toBe('https://example.com/post#:~:text=Alpha');
    expect(normalizeSessionDraftPageUrl('reader', 'https://example.com/post#section')).toBe(
      'https://example.com/post'
    );
    const custom = createSessionDraftStoragePolicy({
      retentionPolicy: { retentionMs: 123_456, maxRestorablePages: null, maxItemsPerPage: null }
    });
    expect(custom.videoScreenshotCacheTtlMs).toBe(123_456);
    expect(DEFAULT_SESSION_DRAFT_STORAGE_POLICY.videoScreenshotCacheTtlMs).toBe(
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY.retentionMs
    );
    expect(
      filterSessionCommentDraftsForRetainedIds({ retained: 'yes', removed: 'no' }, ['retained'])
    ).toEqual({ retained: 'yes' });
  });
  it('uses collision-resistant physical page identities for the known FNV-1a/32 collision', () => {
    const legacyKeys = COLLIDING_PAGE_URLS.map((pageUrl) =>
      createLegacySessionDraftPageKey('reader', pageUrl)
    );
    const physicalKeys = COLLIDING_PAGE_URLS.map((pageUrl) =>
      createSessionDraftStorageKey({
        mode: 'reader',
        pageKey: createSessionDraftPageKey('reader', pageUrl),
        draftId: 'shared-draft'
      })
    );

    expect(legacyKeys).toEqual(['1kqeq3k', '1kqeq3k']);
    expect(
      COLLIDING_PAGE_URLS.map((pageUrl) => createSessionDraftPageKey('reader', pageUrl))
    ).toEqual([
      '839e89718ebbfa291d1535c3413d5350803cb1fc6a85d7dd32eec4c07a5449ce',
      '35099eec2f2f9107a27819ddba9d577ed0b59c80f64809bf9d0855cc7b46e229'
    ]);
    expect(new Set(physicalKeys).size).toBe(2);
  });

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
    expect(
      SessionDraftEnvelopeSchema.safeParse(createEnvelope({ pageKey: 'legacy-page-key' })).success
    ).toBe(false);
    expect(
      SessionDraftEnvelopeSchema.safeParse(
        createEnvelope({ pageUrl: 'https://example.com/post#section:~:text=Alpha' })
      ).success
    ).toBe(false);
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

describe('S02 deleted-test semantic ledger', () => {
  function legacyRecord(mode: 'reader' | 'video', payload: Record<string, unknown> = {}) {
    return {
      schemaVersion: 1,
      draftId: `${mode}-legacy`,
      mode,
      pageKey: 'legacy-page',
      pageUrl: `https://${mode}.example/item`,
      pageTitle: `${mode} title`,
      createdAt: 1,
      updatedAt: 2,
      expiresAt: 3,
      status: 'restorable',
      payload
    };
  }

  it('S02-K01 normalizes equivalent non-text fragments deterministically', () => {
    expect(createSessionDraftPageKey('video', 'https://example.com/watch?v=1#t=12')).toBe(
      createSessionDraftPageKey('video', 'https://example.com/watch?v=1#chapter')
    );
  });

  it('S02-K02 preserves reader text fragments while stripping unrelated fragments', () => {
    expect(
      normalizeSessionDraftPageUrl('reader', 'https://example.com/post#section:~:text=Alpha')
    ).toBe('https://example.com/post#:~:text=Alpha');
    expect(normalizeSessionDraftPageUrl('reader', 'https://example.com/post#section')).toBe(
      'https://example.com/post'
    );
    expect(createSessionDraftPageKey('reader', 'https://example.com/post#:~:text=Alpha')).not.toBe(
      createSessionDraftPageKey('reader', 'https://example.com/post#:~:text=Beta')
    );
  });

  it('S02-K03 keeps raw page URLs out of physical storage keys', () => {
    const pageUrl = 'https://example.com/private/path?token=secret#:~:text=Alpha';
    const key = createSessionDraftStorageKey({
      mode: 'reader',
      pageKey: createSessionDraftPageKey('reader', pageUrl),
      draftId: 'draft'
    });
    expect(key).not.toContain(pageUrl);
    expect(key).not.toContain('private/path');
    expect(parseSessionDraftStorageKey(key)).toMatchObject({ mode: 'reader', draftId: 'draft' });
  });

  it('S02-S01 preserves reader/video mode discrimination during legacy decode', () => {
    expect(normalizeLegacySessionDraftRecord(legacyRecord('reader'))?.mode).toBe('reader');
    expect(normalizeLegacySessionDraftRecord(legacyRecord('video'))?.mode).toBe('video');
    expect(normalizeLegacySessionDraftRecord({ ...legacyRecord('reader'), mode: 'audio' })).toBe(
      undefined
    );
  });

  it('S02-S02 accepts safe comment-draft and passthrough payload extension points', () => {
    expect(
      SessionDraftPayloadSchema.safeParse({
        commentDrafts: { item: 'note' },
        extension: { screenshotRequested: true }
      }).success
    ).toBe(true);
  });

  it('S02-S03 freezes the owner-context rejection code', () => {
    expect(SessionDraftConflictCodeSchema.safeParse('OWNER_CONTEXT_INVALID').success).toBe(true);
    expect(SessionDraftConflictCodeSchema.safeParse('OWNER_MAYBE').success).toBe(false);
  });

  it('S02-S04 restores legacy records without owner context', () => {
    const normalized = normalizeLegacySessionDraftRecord(
      legacyRecord('reader', { commentDrafts: { item: 'note' } })
    );
    expect(normalized).toMatchObject({ mode: 'reader', revision: 0, status: 'restorable' });
    expect(normalized?.legacyOwnerContext).toBeUndefined();
  });

  it('S02-S05 requires undefined optional payload fields to be omitted before persistence', () => {
    expect(
      SessionDraftPayloadSchema.safeParse({ commentDrafts: {}, mode: undefined }).success
    ).toBe(false);
    const canonical: unknown = JSON.parse(JSON.stringify({ commentDrafts: {}, mode: undefined }));
    expect(SessionDraftPayloadSchema.safeParse(canonical).success).toBe(true);
    expect(canonical).not.toHaveProperty('mode');
  });

  it('S02-S06 validates index entries and rejects unknown record schema versions', () => {
    const valid = createSessionDraftIndex();
    valid.entries = [createEntry('valid', NOW)];
    expect(SessionDraftIndexSchema.safeParse(valid).success).toBe(true);
    expect(
      SessionDraftIndexSchema.safeParse({
        ...valid,
        entries: [{ ...valid.entries[0], recordSchemaVersion: 99 }]
      }).success
    ).toBe(false);
  });

  it('S02-S07 accepts both terminal statuses and rejects unknown status strings', () => {
    expect(SessionDraftStatusSchema.safeParse('discarded').success).toBe(true);
    expect(SessionDraftStatusSchema.safeParse('exported').success).toBe(true);
    expect(SessionDraftStatusSchema.safeParse('terminal').success).toBe(false);
  });

  it('S02-P01 freezes the Free 48h, five-page, twenty-item defaults', () => {
    expect(DEFAULT_SESSION_DRAFT_RETENTION_POLICY).toEqual({
      retentionMs: FREE_SESSION_DRAFT_RETENTION_MS,
      maxRestorablePages: FREE_SESSION_DRAFT_MAX_RESTORABLE_PAGES,
      maxItemsPerPage: FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE
    });
    expect(FREE_SESSION_DRAFT_RETENTION_MS).toBe(48 * 60 * 60 * 1000);
    expect(FREE_SESSION_DRAFT_MAX_RESTORABLE_PAGES).toBe(5);
    expect(FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE).toBe(20);
  });

  it('S02-P02 maps default storage policy to the complete Free retention policy', () => {
    expect(DEFAULT_SESSION_DRAFT_STORAGE_POLICY.retentionPolicy).toEqual(
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY
    );
    expect(DEFAULT_SESSION_DRAFT_STORAGE_POLICY.videoScreenshotCacheTtlMs).toBe(
      FREE_SESSION_DRAFT_RETENTION_MS
    );
  });

  it('S02-P03 maps injected retention to screenshot cache TTL', () => {
    expect(
      createSessionDraftStoragePolicy({
        retentionPolicy: { retentionMs: 1234, maxRestorablePages: 2, maxItemsPerPage: 3 }
      })
    ).toMatchObject({
      retentionPolicy: { retentionMs: 1234, maxRestorablePages: 2, maxItemsPerPage: 3 },
      videoScreenshotCacheTtlMs: 1234
    });
  });

  it('S02-P04 normalizes invalid injected policy values to Free defaults', () => {
    expect(
      normalizeSessionDraftRetentionPolicy({
        retentionMs: Number.NaN,
        maxRestorablePages: 0,
        maxItemsPerPage: -1
      })
    ).toEqual(DEFAULT_SESSION_DRAFT_RETENTION_POLICY);
  });

  it('S02-P05 uses the shorter stored expiry and retention window', () => {
    const policy = { retentionMs: 100, maxRestorablePages: 5, maxItemsPerPage: 20 };
    expect(getSessionDraftEffectiveExpiresAt({ updatedAt: 10, expiresAt: 50 }, policy)).toBe(50);
    expect(getSessionDraftEffectiveExpiresAt({ updatedAt: 10, expiresAt: 500 }, policy)).toBe(110);
  });

  it('S02-P06 keeps only the five newest restorable page identities', () => {
    const entries = Array.from({ length: 6 }, (_, index) =>
      createEntry(`draft-${index}`, NOW + index, `page-${index}`)
    );
    const result = selectSessionDraftRetentionRemovals(
      entries,
      NOW - 1,
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY
    );
    expect(result.retained.map((entry) => entry.pageKey)).toEqual([
      'page-5',
      'page-4',
      'page-3',
      'page-2',
      'page-1'
    ]);
  });

  it('S02-P07 prunes stale updatedAt despite a future stored expiry', () => {
    const stale = createEntry('stale', NOW - FREE_SESSION_DRAFT_RETENTION_MS - 1);
    stale.expiresAt = NOW + FREE_SESSION_DRAFT_RETENTION_MS;
    const result = selectSessionDraftRetentionRemovals(
      [stale],
      NOW,
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY
    );
    expect(result.retained).toEqual([]);
    expect(result.removed).toEqual([stale]);
  });

  it('S02-P08 removes every restorable entry for an over-limit page', () => {
    const entries = [
      ...Array.from({ length: 5 }, (_, index) =>
        createEntry(`new-${index}`, NOW + index + 10, `page-${index}`)
      ),
      createEntry('old-a', NOW, 'old-page'),
      createEntry('old-b', NOW + 1, 'old-page')
    ];
    const result = selectSessionDraftRetentionRemovals(
      entries,
      NOW - 1,
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY
    );
    expect(result.removed.filter((entry) => entry.pageKey === 'old-page')).toHaveLength(2);
    expect(result.retained.some((entry) => entry.pageKey === 'old-page')).toBe(false);
  });

  it('S02-P09 excludes terminal drafts from the restorable page quota', () => {
    const restorable = Array.from({ length: 5 }, (_, index) =>
      createEntry(`active-${index}`, NOW + index, `active-page-${index}`)
    );
    const terminal = Array.from(
      { length: 3 },
      (_, index): SessionDraftIndexEntry => ({
        ...createEntry(`terminal-${index}`, NOW - index, `terminal-page-${index}`),
        status: 'exported'
      })
    );
    const result = selectSessionDraftRetentionRemovals(
      [...restorable, ...terminal],
      NOW - 1,
      DEFAULT_SESSION_DRAFT_RETENTION_POLICY
    );
    expect(result.retained).toHaveLength(8);
  });

  it('S02-P10 applies the technical entry cap after policy pruning', () => {
    const unlimited = { retentionMs: 1000, maxRestorablePages: null, maxItemsPerPage: null };
    const entries = Array.from({ length: SESSION_DRAFT_MAX_ENTRIES + 1 }, (_, index) =>
      createEntry(`entry-${index}`, NOW + index, `page-${index}`)
    );
    expect(selectSessionDraftRetentionRemovals(entries, NOW - 1, unlimited).retained).toHaveLength(
      SESSION_DRAFT_MAX_ENTRIES
    );
  });

  it('S02-P11 selects the newest item window while preserving retained order', () => {
    const items = Array.from({ length: 25 }, (_, index) => ({ id: index, createdAt: index }));
    expect(
      selectRetainedSessionDraftItems(items, DEFAULT_SESSION_DRAFT_RETENTION_POLICY).map(
        (item) => item.id
      )
    ).toEqual(Array.from({ length: 20 }, (_, index) => index + 5));
  });

  it('S02-P12 treats a null item cap as unlimited', () => {
    const policy = { ...DEFAULT_SESSION_DRAFT_RETENTION_POLICY, maxItemsPerPage: null };
    const items = Array.from({ length: 25 }, (_, index) => ({ id: index, createdAt: index }));
    expect(selectRetainedSessionDraftItems(items, policy)).toEqual(items);
  });

  it('S02-P13 treats a null page cap as unlimited', () => {
    const policy = { ...DEFAULT_SESSION_DRAFT_RETENTION_POLICY, maxRestorablePages: null };
    const entries = Array.from({ length: 8 }, (_, index) =>
      createEntry(`entry-${index}`, NOW + index, `page-${index}`)
    );
    expect(selectSessionDraftRetentionRemovals(entries, NOW - 1, policy).retained).toHaveLength(8);
  });

  it('S02-P14 filters comment drafts to retained item IDs', () => {
    expect(
      filterSessionCommentDraftsForRetainedIds({ keep: 'yes', remove: 'no' }, ['keep'])
    ).toEqual({ keep: 'yes' });
  });
});
