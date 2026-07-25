import { describe, expect, it } from 'vitest';

import type {
  EnumerableStorageAreaService,
  StorageValueMap
} from '../../../src/platform/interfaces/storage';
import {
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  compareSessionDraftText,
  SESSION_DRAFT_INDEX_KEY,
  SESSION_DRAFT_QUARANTINE_KEY
} from '../../../src/shared/sessionDrafts/keys';
import {
  createSessionDraftIndex,
  createSessionDraftIndexEntry,
  createSessionDraftRemovalTombstone,
  SessionDraftIndexSchema
} from '../../../src/shared/sessionDrafts/index';
import { measureSessionDraftValueBytes } from '../../../src/shared/sessionDrafts/retentionPolicy';
import {
  SESSION_DRAFT_MAX_ENTRIES,
  SESSION_DRAFT_MAX_INDEX_BYTES,
  SESSION_DRAFT_MAX_QUARANTINE_BYTES,
  type SessionDraftEnvelope,
  type SessionDraftMutationReceipt,
  type SessionDraftPendingRemoval
} from '../../../src/shared/sessionDrafts/types';
import { createSessionDraftStoreStorage } from '../../../src/background/services/sessionDraftStoreStorage';

type FailurePoint = 'get' | 'getMany' | 'getAll' | 'setMany' | 'remove';

class FakeEnumerableStorage {
  readonly area: EnumerableStorageAreaService;
  readonly setManyAttempts: StorageValueMap[] = [];
  readonly removeAttempts: string[][] = [];
  getAllCalls = 0;
  private readonly values: StorageValueMap;
  private readonly failures: FailurePoint[] = [];

  constructor(initial: StorageValueMap = {}) {
    this.values = { ...initial };
    this.area = {
      get: <T>(key: string): Promise<T | undefined> => {
        this.consumeFailure('get');
        return Promise.resolve(this.values[key] as T | undefined);
      },
      set: <T>(key: string, value: T): Promise<void> => {
        this.values[key] = value;
        return Promise.resolve();
      },
      getMany: <T>(keys: string[]): Promise<Record<string, T | undefined>> => {
        this.consumeFailure('getMany');
        const values = Object.fromEntries(keys.map((key) => [key, this.values[key]])) as Record<
          string,
          T | undefined
        >;
        return Promise.resolve(values);
      },
      setMany: <T>(entries: Record<string, T>): Promise<void> => {
        this.setManyAttempts.push({ ...entries });
        this.consumeFailure('setMany');
        Object.assign(this.values, entries);
        return Promise.resolve();
      },
      remove: (keyOrKeys: string | string[]): Promise<void> => {
        const keys = Array.isArray(keyOrKeys) ? [...keyOrKeys] : [keyOrKeys];
        this.removeAttempts.push(keys);
        this.consumeFailure('remove');
        for (const key of keys) delete this.values[key];
        return Promise.resolve();
      },
      clear: (): Promise<void> => {
        for (const key of Object.keys(this.values)) delete this.values[key];
        return Promise.resolve();
      },
      watchKey: () => () => undefined,
      watchAll: () => () => undefined,
      getAll: (): Promise<StorageValueMap> => {
        this.getAllCalls += 1;
        this.consumeFailure('getAll');
        return Promise.resolve({ ...this.values });
      }
    };
  }

  failNext(point: FailurePoint): void {
    this.failures.push(point);
  }

  value(key: string): StorageValueMap[string] {
    return this.values[key];
  }

  private consumeFailure(point: FailurePoint): void {
    const index = this.failures.indexOf(point);
    if (index === -1) return;
    this.failures.splice(index, 1);
    throw new Error(`forced ${point} failure`);
  }
}

const BASE_TIME = 2_000_000;

function envelope(overrides: Partial<SessionDraftEnvelope> = {}): SessionDraftEnvelope {
  const mode = overrides.mode ?? 'reader';
  const pageUrl = overrides.pageUrl ?? 'https://example.com/article';
  return {
    schemaVersion: 2,
    revision: 1,
    draftId: 'draft-1',
    mode,
    pageKey: createSessionDraftPageKey(mode, pageUrl),
    pageUrl,
    pageTitle: 'Article',
    createdAt: BASE_TIME - 100,
    updatedAt: BASE_TIME,
    expiresAt: BASE_TIME + 10_000,
    status: 'restorable',
    payload: {},
    ...overrides
  };
}

function keyFor(record: SessionDraftEnvelope): string {
  return createSessionDraftStorageKey(record);
}

function pendingRemoval(
  key: string,
  overrides: Partial<SessionDraftPendingRemoval> = {}
): SessionDraftPendingRemoval {
  return {
    key,
    requestId: 'remove-request-1',
    operation: 'remove',
    receiptKey: key,
    digest: 'a'.repeat(64),
    outcome: 'removed',
    revision: 1,
    timestamp: BASE_TIME,
    ...overrides
  };
}

function parsePersistedIndex(storage: FakeEnumerableStorage) {
  const parsed = SessionDraftIndexSchema.safeParse(storage.value(SESSION_DRAFT_INDEX_KEY));
  if (!parsed.success) throw new Error('Expected a persisted v2 session draft index.');
  return parsed.data;
}

function storageAdapter(storage: FakeEnumerableStorage, now = BASE_TIME) {
  return createSessionDraftStoreStorage(storage.area, () => now);
}

describe('sessionDraftStoreStorage', () => {
  it('salvages valid top-level index members without enumerating or deleting an orphan', async () => {
    const indexed = envelope();
    const indexedKey = keyFor(indexed);
    const orphan = envelope({ draftId: 'orphan', updatedAt: BASE_TIME + 1 });
    const orphanKey = keyFor(orphan);
    const receipt: SessionDraftMutationReceipt = {
      requestId: 'receipt-1',
      operation: 'save',
      key: indexedKey,
      digest: 'b'.repeat(64),
      outcome: 'saved',
      revision: 1,
      timestamp: BASE_TIME
    };
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 2,
        entries: [createSessionDraftIndexEntry(indexedKey, indexed), { key: 7 }],
        receipts: [
          receipt,
          { requestId: false },
          {
            requestId: 'forged-none',
            operation: 'claim',
            key: indexedKey,
            digest: 'c'.repeat(64),
            outcome: 'none',
            invalidRemovedCount: 0,
            timestamp: BASE_TIME
          },
          {
            requestId: 'forged-revision-zero',
            operation: 'save',
            key: indexedKey,
            digest: 'd'.repeat(64),
            outcome: 'saved',
            revision: 0,
            timestamp: BASE_TIME
          }
        ],
        pendingRemovals: []
      },
      [indexedKey]: indexed,
      [orphanKey]: orphan
    });

    const result = await storageAdapter(storage).load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.records).toEqual([{ key: indexedKey, record: indexed }]);
    expect(result.snapshot.index.receipts).toEqual([receipt]);
    expect(storage.getAllCalls).toBe(0);
    expect(storage.value(orphanKey)).toEqual(orphan);
  });

  it.each([
    ['missing', undefined],
    ['wholly malformed', { schemaVersion: 2, entries: 'not-an-array' }]
  ])(
    'reconstructs a %s index from exact draft keys and ignores unrelated keys',
    async (_, rawIndex) => {
      const record = envelope();
      const key = keyFor(record);
      const unrelatedDraftLikeKey = 'aiob.sessionDraft.v1x.reader.page-1.unrelated';
      const initial: StorageValueMap = {
        [key]: record,
        [unrelatedDraftLikeKey]: envelope({ draftId: 'wrong-key' }),
        'other.feature.value': { updatedAt: BASE_TIME + 100 }
      };
      if (rawIndex !== undefined) initial[SESSION_DRAFT_INDEX_KEY] = rawIndex;
      const storage = new FakeEnumerableStorage(initial);

      const result = await storageAdapter(storage).load();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.snapshot.records).toEqual([{ key, record }]);
      expect(result.snapshot.index.entries).toEqual([createSessionDraftIndexEntry(key, record)]);
      expect(storage.getAllCalls).toBe(1);
      expect(storage.value('other.feature.value')).toEqual({ updatedAt: BASE_TIME + 100 });
      expect(storage.value(unrelatedDraftLikeKey)).toBeDefined();
      expect(storage.value(SESSION_DRAFT_QUARANTINE_KEY) !== undefined).toBe(
        rawIndex !== undefined
      );
    }
  );

  it('bounds reconstruction to the deterministic newest 100 records', async () => {
    const initial: StorageValueMap = {};
    for (let index = 0; index < SESSION_DRAFT_MAX_ENTRIES + 2; index += 1) {
      const record = envelope({
        draftId: `draft-${String(index).padStart(3, '0')}`,
        updatedAt: BASE_TIME + Math.floor(index / 2)
      });
      initial[keyFor(record)] = record;
    }
    const storage = new FakeEnumerableStorage(initial);

    const result = await storageAdapter(storage).load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.records).toHaveLength(SESSION_DRAFT_MAX_ENTRIES);
    const ordered = result.snapshot.index.entries;
    expect(ordered).toHaveLength(SESSION_DRAFT_MAX_ENTRIES);
    expect(ordered).toEqual(
      [...ordered].sort(
        (left, right) =>
          right.updatedAt - left.updatedAt || compareSessionDraftText(left.key, right.key)
      )
    );
    expect(storage.removeAttempts).toEqual([]);
  });

  it('keeps quarantine and reconstructed-index values within their byte bounds', async () => {
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: `malformed-${'x'.repeat(SESSION_DRAFT_MAX_INDEX_BYTES + 1)}`
    });

    const result = await storageAdapter(storage).load();

    expect(result.ok).toBe(true);
    const quarantine = storage.value(SESSION_DRAFT_QUARANTINE_KEY);
    if (typeof quarantine !== 'object' || quarantine === null) {
      throw new Error('Expected a bounded quarantine object.');
    }
    expect(measureSessionDraftValueBytes(quarantine)).toBeLessThanOrEqual(
      SESSION_DRAFT_MAX_QUARANTINE_BYTES
    );
    expect(measureSessionDraftValueBytes(parsePersistedIndex(storage))).toBeLessThanOrEqual(
      SESSION_DRAFT_MAX_INDEX_BYTES
    );
  });

  it('normalizes a legacy v1 record to revision zero without rewriting its physical value', async () => {
    const legacy = {
      schemaVersion: 1,
      draftId: 'legacy-draft',
      mode: 'video',
      pageUrl: 'https://example.com/video',
      pageKey: createSessionDraftPageKey('video', 'https://example.com/video'),
      pageTitle: 'Legacy video',
      createdAt: BASE_TIME - 500,
      updatedAt: BASE_TIME - 100,
      expiresAt: BASE_TIME + 10_000,
      status: 'active',
      payload: { ownerContext: { tabId: 3, frameId: 0 }, captures: [] }
    };
    const key = createSessionDraftStorageKey({
      mode: 'video',
      pageKey: legacy.pageKey,
      draftId: legacy.draftId
    });
    const storage = new FakeEnumerableStorage({ [key]: legacy });

    const result = await storageAdapter(storage).load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.records[0]?.record).toMatchObject({
      schemaVersion: 1,
      revision: 0,
      legacyOwnerContext: { tabId: 3, frameId: 0 },
      payload: { captures: [] }
    });
    expect(storage.value(key)).toEqual(legacy);
    expect(storage.setManyAttempts).toEqual([]);
  });

  it('salvages exact members from a legacy v1 index without getAll or envelope rewrite', async () => {
    const legacy = {
      schemaVersion: 1,
      draftId: 'legacy-index-draft',
      mode: 'reader',
      pageUrl: 'https://example.com/legacy-index',
      pageKey: createSessionDraftPageKey('reader', 'https://example.com/legacy-index'),
      pageTitle: 'Legacy index article',
      createdAt: BASE_TIME - 500,
      updatedAt: BASE_TIME - 100,
      expiresAt: BASE_TIME + 10_000,
      status: 'restorable',
      payload: { highlights: [] }
    };
    const key = createSessionDraftStorageKey({
      mode: 'reader',
      pageKey: legacy.pageKey,
      draftId: legacy.draftId
    });
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 1,
        entries: [
          {
            key,
            draftId: legacy.draftId,
            mode: legacy.mode,
            pageKey: legacy.pageKey,
            updatedAt: legacy.updatedAt,
            expiresAt: legacy.expiresAt,
            status: legacy.status
          },
          { key: 42 }
        ]
      },
      [key]: legacy
    });

    const result = await storageAdapter(storage).load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restored = result.snapshot.records[0];
    if (!restored) throw new Error('Expected the indexed legacy record to be restored.');
    expect(restored.record).toMatchObject({ schemaVersion: 1, revision: 0 });
    expect(result.snapshot.index.entries).toEqual([
      createSessionDraftIndexEntry(key, restored.record)
    ]);
    expect(storage.getAllCalls).toBe(0);
    expect(storage.value(key)).toEqual(legacy);
    expect(storage.setManyAttempts).toEqual([]);
  });

  it('deduplicates legacy index keys before the 100-key cap without enumerating', async () => {
    const first = envelope({ draftId: 'legacy-duplicate-first' });
    const second = envelope({ draftId: 'legacy-duplicate-second', updatedAt: BASE_TIME + 1 });
    const firstKey = keyFor(first);
    const secondKey = keyFor(second);
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 1,
        entries: [
          ...Array.from({ length: SESSION_DRAFT_MAX_ENTRIES }, () => ({ key: firstKey })),
          { key: secondKey }
        ]
      },
      [firstKey]: first,
      [secondKey]: second
    });

    const result = await storageAdapter(storage).load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.records.map((item) => item.key)).toEqual([secondKey, firstKey]);
    expect(storage.getAllCalls).toBe(0);
    expect(storage.setManyAttempts).toEqual([]);
  });

  it('routes 101 unique legacy keys through getAll and keeps the deterministic newest 100', async () => {
    const entries = Array.from({ length: SESSION_DRAFT_MAX_ENTRIES + 1 }, (_, position) => {
      const record = envelope({
        draftId: `legacy-overflow-${String(position).padStart(3, '0')}`,
        updatedAt: BASE_TIME + position
      });
      return { key: keyFor(record), record };
    });
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 1,
        entries: entries.map(({ key }) => ({ key }))
      },
      ...Object.fromEntries(entries.map(({ key, record }) => [key, record]))
    });

    const result = await storageAdapter(storage).load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storage.getAllCalls).toBe(1);
    expect(result.snapshot.records).toHaveLength(SESSION_DRAFT_MAX_ENTRIES);
    expect(result.snapshot.records.map((item) => item.key)).toEqual(
      entries
        .slice(1)
        .sort((left, right) => right.record.updatedAt - left.record.updatedAt)
        .map(({ key }) => key)
    );
    expect(storage.value(SESSION_DRAFT_QUARANTINE_KEY)).toBeDefined();
  });

  it('retains the deterministic newest 128 receipts regardless of stored order', async () => {
    const receipts = Array.from(
      { length: 129 },
      (_, position): SessionDraftMutationReceipt => ({
        requestId: `receipt-${String(position).padStart(3, '0')}`,
        operation: 'save',
        key: `aiob.sessionDraft.v1.reader.page.receipt-${position}`,
        digest: position.toString(16).padStart(64, '0'),
        outcome: 'saved',
        revision: 1,
        timestamp: BASE_TIME - 500 + position
      })
    );
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: {
        schemaVersion: 2,
        entries: [],
        receipts,
        pendingRemovals: []
      }
    });

    const result = await storageAdapter(storage).load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.index.receipts).toHaveLength(128);
    expect(result.snapshot.index.receipts.map((item) => item.requestId)).toEqual(
      [...receipts]
        .reverse()
        .slice(0, 128)
        .map((item) => item.requestId)
    );
  });

  it('classifies an identity-invalid value without erasing either physical sibling', async () => {
    const invalidRecord = envelope({ draftId: 'invalid-page-key' });
    const invalidKey = keyFor(invalidRecord);
    const validRecord = envelope({ draftId: 'valid-sibling' });
    const validKey = keyFor(validRecord);
    const unrelatedKey = 'aiob.sessionDraft.v1x.reader.page-1.invalid';
    const invalidValue = { ...invalidRecord, pageKey: 'does-not-match-url' };
    const storage = new FakeEnumerableStorage({
      [invalidKey]: invalidValue,
      [validKey]: validRecord,
      [unrelatedKey]: { malformed: true }
    });

    const result = await storageAdapter(storage).load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.invalidRemovedCount).toBe(1);
    expect(result.snapshot.invalidRemovedKeys).toEqual([invalidKey]);
    expect(result.snapshot.records).toEqual([{ key: validKey, record: validRecord }]);
    expect(result.snapshot.index.pendingRemovals.map((item) => item.key)).toEqual([invalidKey]);
    expect(storage.value(invalidKey)).toEqual(invalidValue);
    expect(storage.value(validKey)).toEqual(validRecord);
    expect(storage.value(unrelatedKey)).toEqual({ malformed: true });
    expect(storage.removeAttempts).toEqual([]);
  });

  it('reconstructs a tombstone and resumes its pending removal after restart', async () => {
    const record = envelope();
    const key = keyFor(record);
    const pending = pendingRemoval(key);
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: { wholly: 'malformed' },
      [key]: createSessionDraftRemovalTombstone(pending)
    });
    storage.failNext('remove');

    const first = await storageAdapter(storage).load();

    expect(first).toEqual({ ok: false, code: 'INDEX_RECOVERY_FAILED' });
    expect(storage.value(key)).toEqual(createSessionDraftRemovalTombstone(pending));
    expect(parsePersistedIndex(storage).pendingRemovals).toEqual([pending]);

    const restarted = await storageAdapter(storage).load();

    expect(restarted.ok).toBe(true);
    if (!restarted.ok) return;
    expect(restarted.snapshot.index.pendingRemovals).toEqual([]);
    expect(storage.value(key)).toBeUndefined();
  });

  it('fails closed without writes when 101 distinct tombstones exceed recovery capacity', async () => {
    const initial: StorageValueMap = { [SESSION_DRAFT_INDEX_KEY]: { malformed: true } };
    for (let position = 0; position < 101; position += 1) {
      const record = envelope({ draftId: `pending-overflow-${position}` });
      const key = keyFor(record);
      initial[key] = createSessionDraftRemovalTombstone(
        pendingRemoval(key, { requestId: `remove-${position}` })
      );
    }
    const storage = new FakeEnumerableStorage(initial);
    const before = structuredClone(storage.area.getAll ? await storage.area.getAll() : {});
    storage.getAllCalls = 0;

    const result = await storageAdapter(storage).load();

    expect(result).toEqual({ ok: false, code: 'INDEX_RECOVERY_FAILED' });
    expect(storage.setManyAttempts).toEqual([]);
    expect(storage.removeAttempts).toEqual([]);
    await expect(storage.area.getAll()).resolves.toEqual(before);
  });

  it('reconstructs a user receipt from a tombstone before drain and excludes synthetic receipts', async () => {
    const removedRecord = envelope({ draftId: 'receipt-tombstone' });
    const removedKey = keyFor(removedRecord);
    const claimedRecord = envelope({ draftId: 'claimed-receipt' });
    const claimedKey = keyFor(claimedRecord);
    const invalidRecord = envelope({ draftId: 'recovery-invalid' });
    const invalidKey = keyFor(invalidRecord);
    const pending = pendingRemoval(removedKey, {
      requestId: 'claim-user-request',
      operation: 'claim',
      receiptKey: claimedKey,
      digest: 'd'.repeat(64),
      resultDigest: 'e'.repeat(64),
      outcome: 'claimed',
      revision: 1,
      selectionReason: 'restorable',
      invalidRemovedCount: 1
    });
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: { malformed: true },
      [removedKey]: createSessionDraftRemovalTombstone(pending),
      [invalidKey]: { ...invalidRecord, pageKey: 'wrong-page' }
    });

    const result = await storageAdapter(storage).load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.index.receipts).toHaveLength(1);
    expect(result.snapshot.index.receipts[0]).toMatchObject({
      requestId: pending.requestId,
      operation: 'claim',
      key: claimedKey,
      digest: pending.digest,
      resultDigest: pending.resultDigest,
      outcome: 'claimed',
      revision: 1,
      selectionReason: 'restorable',
      invalidRemovedCount: 1
    });
    expect(result.snapshot.index.receipts.map((item) => item.requestId)).not.toContain(
      'index-recovery'
    );
    expect(storage.value(removedKey)).toBeUndefined();
    expect(storage.value(invalidKey)).toBeDefined();

    const restarted = await storageAdapter(storage).load();
    expect(restarted.ok).toBe(true);
    if (!restarted.ok) return;
    expect(restarted.snapshot.index.receipts).toEqual(result.snapshot.index.receipts);
  });

  it.each([
    ['enumeration', 'getAll'],
    ['quarantine/rebuild setMany', 'setMany']
  ] as const)('fails closed on %s failure', async (_, failure) => {
    const initial =
      failure === 'getAll' ? {} : { [SESSION_DRAFT_INDEX_KEY]: { wholly: 'malformed' } };
    const storage = new FakeEnumerableStorage(initial);
    storage.failNext(failure);

    const result = await storageAdapter(storage).load();

    expect(result).toEqual({ ok: false, code: 'INDEX_RECOVERY_FAILED' });
    expect(storage.removeAttempts).toEqual([]);
  });

  it('atomically writes an envelope, exact removal tombstone, and index before cleanup', async () => {
    const oldRecord = envelope({ draftId: 'old' });
    const oldKey = keyFor(oldRecord);
    const newRecord = envelope({ draftId: 'new', revision: 2, updatedAt: BASE_TIME + 1 });
    const newKey = keyFor(newRecord);
    const oldIndex = createSessionDraftIndex([createSessionDraftIndexEntry(oldKey, oldRecord)]);
    const nextIndex = createSessionDraftIndex([createSessionDraftIndexEntry(newKey, newRecord)]);
    const pending = pendingRemoval(oldKey);
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: oldIndex,
      [oldKey]: oldRecord
    });

    const result = await storageAdapter(storage).commit({
      index: nextIndex,
      envelope: { key: newKey, value: newRecord },
      removals: [pending]
    });

    expect(result.ok).toBe(true);
    const atomicAttempt = storage.setManyAttempts[0];
    expect(atomicAttempt?.[newKey]).toEqual(newRecord);
    expect(atomicAttempt?.[oldKey]).toEqual(createSessionDraftRemovalTombstone(pending));
    expect(atomicAttempt?.[SESSION_DRAFT_INDEX_KEY]).toMatchObject({
      entries: [createSessionDraftIndexEntry(newKey, newRecord)],
      pendingRemovals: [pending]
    });
    expect(storage.removeAttempts).toEqual([[oldKey]]);
    expect(storage.value(newKey)).toEqual(newRecord);
    expect(storage.value(oldKey)).toBeUndefined();
    expect(parsePersistedIndex(storage).pendingRemovals).toEqual([]);
  });

  it('rejects noncanonical envelopes and absent or incongruent index entries without writes', async () => {
    const record = envelope({ draftId: 'commit-validation' });
    const key = keyFor(record);
    const entry = createSessionDraftIndexEntry(key, record);
    const cases = [
      {
        name: 'noncanonical record identity',
        index: createSessionDraftIndex([{ ...entry, pageKey: 'wrong-page' }]),
        value: { ...record, pageKey: 'wrong-page' }
      },
      { name: 'missing index entry', index: createSessionDraftIndex(), value: record },
      {
        name: 'incongruent index entry',
        index: createSessionDraftIndex([{ ...entry, revision: entry.revision + 1 }]),
        value: record
      }
    ];

    for (const entryCase of cases) {
      const storage = new FakeEnumerableStorage();
      const result = await storageAdapter(storage).commit({
        index: entryCase.index,
        envelope: { key, value: entryCase.value }
      });
      expect(result, entryCase.name).toEqual({ ok: false, code: 'STORAGE_FAILURE' });
      expect(storage.setManyAttempts, entryCase.name).toEqual([]);
      expect(storage.removeAttempts, entryCase.name).toEqual([]);
    }
  });

  it('does not issue cleanup when the atomic setMany fails', async () => {
    const record = envelope();
    const key = keyFor(record);
    const index = createSessionDraftIndex([createSessionDraftIndexEntry(key, record)]);
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: index,
      [key]: record
    });
    storage.failNext('setMany');

    const result = await storageAdapter(storage).commit({
      index: createSessionDraftIndex(),
      removals: [pendingRemoval(key)]
    });

    expect(result).toEqual({ ok: false, code: 'STORAGE_FAILURE' });
    expect(storage.removeAttempts).toEqual([]);
    expect(storage.value(key)).toEqual(record);
    expect(storage.value(SESSION_DRAFT_INDEX_KEY)).toEqual(index);
  });

  it('preserves the retained envelope and resumes cleanup after a post-commit remove failure', async () => {
    const oldRecord = envelope({ draftId: 'cleanup-old' });
    const oldKey = keyFor(oldRecord);
    const retained = envelope({ draftId: 'cleanup-retained', revision: 2 });
    const retainedKey = keyFor(retained);
    const pending = pendingRemoval(oldKey);
    const storage = new FakeEnumerableStorage({
      [SESSION_DRAFT_INDEX_KEY]: createSessionDraftIndex([
        createSessionDraftIndexEntry(oldKey, oldRecord)
      ]),
      [oldKey]: oldRecord
    });
    storage.failNext('remove');

    const failed = await storageAdapter(storage).commit({
      index: createSessionDraftIndex([createSessionDraftIndexEntry(retainedKey, retained)]),
      envelope: { key: retainedKey, value: retained },
      removals: [pending]
    });

    expect(failed).toEqual({ ok: false, code: 'STORAGE_FAILURE' });
    expect(storage.value(retainedKey)).toEqual(retained);
    expect(storage.value(oldKey)).toEqual(createSessionDraftRemovalTombstone(pending));
    expect(parsePersistedIndex(storage).pendingRemovals).toEqual([pending]);

    const restarted = await storageAdapter(storage).load();
    expect(restarted.ok).toBe(true);
    if (!restarted.ok) return;
    expect(restarted.snapshot.records).toEqual([{ key: retainedKey, record: retained }]);
    expect(storage.value(retainedKey)).toEqual(retained);
    expect(storage.value(oldKey)).toBeUndefined();
  });
});
