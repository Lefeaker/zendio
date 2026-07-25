import type * as Storage from '../../platform/interfaces/storage';
import * as Draft from '../../shared/sessionDrafts';
import {
  addSessionDraftMutationReceipt,
  createSessionDraftMutationReceipt,
  createSessionDraftPendingRemovals,
  createSessionDraftValueDigest,
  pruneSessionDraftMutationReceipts
} from './sessionDraftStoreReceipts';
type StoredValue = Draft.SessionDraftStoredValue;
type StorageArea = Storage.EnumerableStorageAreaService;
export function isEnumerableSessionDraftStorage(
  area: Storage.StorageAreaService
): area is StorageArea {
  return 'getAll' in area && typeof area.getAll === 'function';
}
export type SessionDraftStoredRecord = { key: string; record: Draft.SessionDraftRecord };
export type SessionDraftStorageCommit = {
  index: Draft.SessionDraftIndex;
  envelope?: { key: string; value: Draft.SessionDraftEnvelope };
  removals?: Draft.SessionDraftPendingRemoval[];
};
function quarantine(value: StoredValue, capturedAt: number): Draft.SessionDraftIndexQuarantine {
  const text = JSON.stringify(value);
  const byteLength = text === undefined ? 0 : new TextEncoder().encode(text).length;
  const retained =
    text !== undefined && text.length <= Draft.SESSION_DRAFT_MAX_QUARANTINE_BYTES / 16;
  return {
    capturedAt,
    byteLength,
    truncated: !retained,
    ...(retained ? { value: text } : {})
  };
}
function tombstoneWrites(
  index: Draft.SessionDraftIndex,
  removals: readonly Draft.SessionDraftPendingRemoval[] = index.pendingRemovals
): Storage.StorageValueMap {
  const writes: Storage.StorageValueMap = { [Draft.SESSION_DRAFT_INDEX_KEY]: index };
  for (const pending of removals)
    writes[pending.key] = Draft.createSessionDraftRemovalTombstone(pending);
  return writes;
}
function classify(values: readonly (readonly [string, StoredValue])[]) {
  const records: SessionDraftStoredRecord[] = [];
  const pending: Draft.SessionDraftPendingRemoval[] = [];
  const receipts: Draft.SessionDraftMutationReceipt[] = [];
  const invalidKeys: string[] = [];
  for (const [key, raw] of values) {
    if (!Draft.isExactSessionDraftStorageKey(key) || raw === undefined) continue;
    const tombstone = Draft.SessionDraftRemovalTombstoneSchema.safeParse(raw);
    if (tombstone.success && tombstone.data.key === key) {
      const { schemaVersion, kind, ...removal } = tombstone.data;
      void schemaVersion;
      void kind;
      pending.push(removal);
      const { receiptKey, ...receipt } = removal;
      if (receipt.requestId !== 'index-recovery' || receipt.digest !== '0'.repeat(64)) {
        receipts.push({ ...receipt, key: receiptKey });
      }
      continue;
    }
    const record = Draft.parseSessionDraftRecord(raw);
    if (record && Draft.matchesSessionDraftStorageRecord(key, record)) {
      records.push({ key, record });
    } else {
      invalidKeys.push(key);
    }
  }
  records.sort(Draft.compareSessionDraftStoredRecords);
  invalidKeys.sort(Draft.compareSessionDraftText);
  return { records, pending, receipts, invalidKeys };
}
export type SessionDraftStorageSnapshot = ReturnType<
  typeof Draft.repairSessionDraftIndex<SessionDraftStoredRecord>
>;
export type SessionDraftStorageLoadResult =
  | { ok: true; snapshot: SessionDraftStorageSnapshot }
  | { ok: false; code: 'INDEX_RECOVERY_FAILED' };
export type SessionDraftStorageCommitResult =
  | { ok: true; index: Draft.SessionDraftIndex }
  | { ok: false; code: 'STORAGE_FAILURE' };
interface SessionDraftMutationCommitInput {
  snapshot: SessionDraftStorageSnapshot;
  digest: string;
  receipts: Draft.SessionDraftMutationReceipt[];
  plan: Draft.SessionDraftMutationCommitPlan;
  now: number;
  retention: Draft.SessionDraftRetentionPolicy;
  maxEntries: number;
}
export function createSessionDraftStoreStorage(area: StorageArea, now: () => number = Date.now) {
  async function drain(
    index: Draft.SessionDraftIndex,
    removals: readonly Draft.SessionDraftPendingRemoval[] = index.pendingRemovals
  ): Promise<Draft.SessionDraftIndex> {
    if (removals.length === 0) return index;
    const removed = new Set(removals.map((pending) => pending.key));
    await area.setMany(tombstoneWrites(index, removals));
    await area.remove([...removed]);
    const drained = {
      ...index,
      pendingRemovals: index.pendingRemovals.filter((pending) => !removed.has(pending.key))
    };
    await area.setMany({ [Draft.SESSION_DRAFT_INDEX_KEY]: drained });
    return drained;
  }
  async function hydrate(index: Draft.SessionDraftIndex, keys: string[]) {
    const raw = await area.getMany<StoredValue>(keys);
    const values = keys.map((key): [string, StoredValue] => [key, raw[key]]);
    const found = classify(values);
    const base = {
      ...index,
      receipts: pruneSessionDraftMutationReceipts([...index.receipts, ...found.receipts], now())
    };
    const repaired = Draft.repairSessionDraftIndex(base, found, now());
    repaired.index = await drain(repaired.index, found.pending);
    return repaired;
  }
  async function rebuild(rawIndex: StoredValue): Promise<SessionDraftStorageSnapshot> {
    const all = await area.getAll();
    const values = Object.entries(all).map(([key, value]): [string, StoredValue] => [
      key,
      Draft.normalizeSessionDraftStoredValue(value)
    ]);
    const found = classify(values);
    const base = Draft.createSessionDraftIndex();
    base.receipts = pruneSessionDraftMutationReceipts(found.receipts, now());
    const repaired = Draft.repairSessionDraftIndex(base, found, now());
    const legacyOnly =
      repaired.records.length > 0 &&
      repaired.records.every(
        ({ record }) => record.schemaVersion === Draft.SESSION_DRAFT_LEGACY_SCHEMA_VERSION
      );
    const clean =
      repaired.invalidRemovedKeys.length === 0 && repaired.index.pendingRemovals.length === 0;
    if (rawIndex === undefined && legacyOnly && clean) {
      return repaired;
    }
    const writes: Storage.StorageValueMap = { [Draft.SESSION_DRAFT_INDEX_KEY]: repaired.index };
    if (rawIndex !== undefined)
      writes[Draft.SESSION_DRAFT_QUARANTINE_KEY] = quarantine(rawIndex, now());
    await area.setMany(writes);
    repaired.index = await drain(repaired.index, found.pending);
    return repaired;
  }
  return {
    async load(): Promise<SessionDraftStorageLoadResult> {
      try {
        const rawIndex = await area.get<StoredValue>(Draft.SESSION_DRAFT_INDEX_KEY);
        const normalized = Draft.decodeSessionDraftStoredIndex(rawIndex);
        if (!normalized) return { ok: true, snapshot: await rebuild(rawIndex) };
        const snapshot = await hydrate(normalized.index, normalized.keys);
        return { ok: true, snapshot };
      } catch {
        return { ok: false, code: 'INDEX_RECOVERY_FAILED' };
      }
    },
    async commit(input: SessionDraftStorageCommit): Promise<SessionDraftStorageCommitResult> {
      try {
        const requested = [...(input.removals ?? []), ...input.index.pendingRemovals];
        const removals = Draft.normalizeSessionDraftPendingRemovals(requested);
        const removalKeys = new Set(requested.map((pending) => pending.key));
        const explicitKeys = new Set((input.removals ?? []).map((pending) => pending.key));
        const explicit = removals.filter((pending) => explicitKeys.has(pending.key));
        const removed = new Set(removals.map((pending) => pending.key));
        const retained = input.index.entries.filter((entry) => !removed.has(entry.key));
        const entries = Draft.normalizeSessionDraftIndexEntries(retained);
        const index = { ...input.index, entries, pendingRemovals: removals };
        if (
          removalKeys.size > Draft.SESSION_DRAFT_MAX_PENDING_REMOVALS ||
          removals.length !== removalKeys.size ||
          entries.length !== retained.length ||
          !Draft.SessionDraftIndexSchema.safeParse(index).success ||
          (Draft.measureSessionDraftStoredValueBytes(index) ?? Infinity) >
            Draft.SESSION_DRAFT_MAX_INDEX_BYTES
        ) {
          return { ok: false, code: 'STORAGE_FAILURE' };
        }
        if (input.envelope) {
          const parsed = Draft.SessionDraftEnvelopeSchema.safeParse(input.envelope.value);
          const entry = index.entries.find((candidate) => candidate.key === input.envelope?.key);
          const expected = parsed.success
            ? Draft.createSessionDraftIndexEntry(input.envelope.key, parsed.data)
            : undefined;
          if (
            !parsed.success ||
            !Draft.matchesSessionDraftStorageRecord(input.envelope.key, parsed.data) ||
            JSON.stringify(entry) !== JSON.stringify(expected) ||
            removed.has(input.envelope.key)
          )
            return { ok: false, code: 'STORAGE_FAILURE' };
        }
        const writes = tombstoneWrites(index, explicit);
        if (input.envelope) writes[input.envelope.key] = input.envelope.value;
        await area.setMany(writes);
        return { ok: true, index: await drain(index, explicit) };
      } catch {
        return { ok: false, code: 'STORAGE_FAILURE' };
      }
    }
  };
}
export type SessionDraftStoreStorage = ReturnType<typeof createSessionDraftStoreStorage>;

export async function commitSessionDraftMutation(
  storage: SessionDraftStoreStorage,
  input: SessionDraftMutationCommitInput
): Promise<SessionDraftStorageCommitResult> {
  const resultDigest = input.plan.envelope
    ? await createSessionDraftValueDigest(input.plan.envelope)
    : undefined;
  const receipt = createSessionDraftMutationReceipt(
    {
      ...input.plan.receipt,
      digest: input.digest,
      ...(resultDigest === undefined ? {} : { resultDigest })
    },
    input.now
  );
  const receipts =
    input.plan.keepReceipt === false
      ? input.receipts
      : addSessionDraftMutationReceipt(input.receipts, receipt, input.now);
  const base = Draft.replaceSessionDraftIndexEntries(
    input.snapshot.index,
    input.plan.entries ?? input.snapshot.index.entries,
    receipts
  );
  const envelopePlan = input.plan.envelope
    ? Draft.planSessionDraftEnvelopeIndex({
        index: base,
        key: input.plan.receipt.key,
        record: input.plan.envelope,
        receipts,
        ...(input.plan.applyRetention
          ? { retention: { now: input.now, policy: input.retention, maxEntries: input.maxEntries } }
          : {})
      })
    : { index: base, removedKeys: [] };
  const removedKeys = [...(input.plan.removedKeys ?? []), ...envelopePlan.removedKeys];
  return storage.commit({
    index: envelopePlan.index,
    ...(input.plan.envelope
      ? { envelope: { key: input.plan.receipt.key, value: input.plan.envelope } }
      : {}),
    removals: createSessionDraftPendingRemovals(receipt, removedKeys)
  });
}
