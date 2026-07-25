import { z, type ZodType } from 'zod';
import {
  compareSessionDraftText,
  createSessionDraftIndexEntry,
  isExactSessionDraftStorageKey,
  SESSION_DRAFT_INDEX_KEY
} from './keys';
import {
  SessionDraftIndexEntrySchema,
  SessionDraftMutationReceiptSchema,
  SessionDraftPendingRemovalSchema
} from './schemas';
import {
  SESSION_DRAFT_LEGACY_SCHEMA_VERSION,
  SESSION_DRAFT_MAX_ENTRIES,
  SESSION_DRAFT_MAX_INDEX_BYTES,
  SESSION_DRAFT_MAX_PENDING_REMOVALS,
  SESSION_DRAFT_MAX_RECEIPTS,
  SESSION_DRAFT_SCHEMA_VERSION,
  type SessionDraftIndex,
  type SessionDraftIndexEntry,
  type SessionDraftMutationReceipt,
  type SessionDraftPendingRemoval,
  type SessionDraftRecord,
  type SessionDraftRetentionPolicy
} from './types';
import { selectSessionDraftRetentionRemovals } from './retentionPolicy';

export type SessionDraftStoredValue = object | string | number | boolean | null | undefined;

export const SessionDraftIndexSchema = z
  .object({
    schemaVersion: z.literal(SESSION_DRAFT_SCHEMA_VERSION),
    entries: z.array(SessionDraftIndexEntrySchema).max(SESSION_DRAFT_MAX_ENTRIES),
    receipts: z.array(SessionDraftMutationReceiptSchema).max(SESSION_DRAFT_MAX_RECEIPTS),
    pendingRemovals: z
      .array(SessionDraftPendingRemovalSchema)
      .max(SESSION_DRAFT_MAX_PENDING_REMOVALS)
  })
  .strict();

export function normalizeSessionDraftStoredValue<Value>(value: Value): SessionDraftStoredValue {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  return undefined;
}

export function measureSessionDraftStoredValueBytes(
  value: SessionDraftStoredValue
): number | undefined {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? undefined : new TextEncoder().encode(text).length;
  } catch {
    return undefined;
  }
}

function ownData(value: SessionDraftStoredValue, key: string): SessionDraftStoredValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor)) return;
  return normalizeSessionDraftStoredValue(descriptor.value);
}

function storedItems(value: SessionDraftStoredValue): SessionDraftStoredValue[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeSessionDraftStoredValue(entry));
}

function parseItems<T>(values: readonly SessionDraftStoredValue[], schema: ZodType<T>): T[] {
  return values.flatMap((value) => {
    const parsed = schema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

export function normalizeSessionDraftIndexEntries(
  values: readonly SessionDraftStoredValue[]
): SessionDraftIndexEntry[] {
  const seen = new Set<string>();
  return parseItems(values, SessionDraftIndexEntrySchema)
    .filter((entry) => isExactSessionDraftStorageKey(entry.key))
    .sort(
      (left, right) =>
        right.updatedAt - left.updatedAt || compareSessionDraftText(left.key, right.key)
    )
    .filter((entry) => !seen.has(entry.key) && Boolean(seen.add(entry.key)))
    .slice(0, SESSION_DRAFT_MAX_ENTRIES);
}

export function normalizeSessionDraftPendingRemovals(
  values: readonly SessionDraftStoredValue[]
): SessionDraftPendingRemoval[] {
  const seen = new Set<string>();
  return parseItems(values, SessionDraftPendingRemovalSchema)
    .filter((pending) => isExactSessionDraftStorageKey(pending.key))
    .sort(
      (left, right) =>
        right.timestamp - left.timestamp || compareSessionDraftText(left.key, right.key)
    )
    .filter((pending) => !seen.has(pending.key) && Boolean(seen.add(pending.key)))
    .slice(0, SESSION_DRAFT_MAX_PENDING_REMOVALS);
}

export function decodeSessionDraftStoredIndex(value: SessionDraftStoredValue) {
  const bytes = measureSessionDraftStoredValueBytes(value);
  const entriesValue = ownData(value, 'entries');
  const entries = storedItems(entriesValue);
  const version = ownData(value, 'schemaVersion');
  if (entriesValue === undefined || !Array.isArray(entriesValue)) return;
  if (bytes === undefined || bytes > SESSION_DRAFT_MAX_INDEX_BYTES) return;
  if (version === SESSION_DRAFT_LEGACY_SCHEMA_VERSION) {
    const keys = [
      ...new Set(
        entries
          .map((entry) => ownData(entry, 'key'))
          .filter((key): key is string => typeof key === 'string')
          .filter(isExactSessionDraftStorageKey)
      )
    ];
    if (keys.length > SESSION_DRAFT_MAX_ENTRIES) return;
    return {
      index: createSessionDraftIndex(),
      keys,
      readOnly: true
    };
  }
  if (version !== SESSION_DRAFT_SCHEMA_VERSION) return;
  const pendingItems = storedItems(ownData(value, 'pendingRemovals'));
  if (pendingItems.length > SESSION_DRAFT_MAX_PENDING_REMOVALS) return;
  const index: SessionDraftIndex = {
    schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
    entries: normalizeSessionDraftIndexEntries(entries),
    receipts: parseItems(
      storedItems(ownData(value, 'receipts')),
      SessionDraftMutationReceiptSchema
    ),
    pendingRemovals: normalizeSessionDraftPendingRemovals(pendingItems)
  };
  const keys = [...index.entries, ...index.pendingRemovals].map((entry) => entry.key);
  return { index, keys: [...new Set(keys)], readOnly: false };
}

function createRecoveryPendingRemoval(key: string, timestamp: number): SessionDraftPendingRemoval {
  return {
    key,
    requestId: 'index-recovery',
    operation: 'prune',
    receiptKey: SESSION_DRAFT_INDEX_KEY,
    digest: '0'.repeat(64),
    outcome: 'pruned',
    removedCount: 1,
    timestamp
  };
}

export function repairSessionDraftIndex<
  RecordType extends { key: string; record: SessionDraftRecord }
>(
  base: SessionDraftIndex,
  found: {
    records: RecordType[];
    pending: SessionDraftPendingRemoval[];
    invalidKeys: string[];
  },
  timestamp: number
) {
  const removalKeys = new Set([...found.pending.map((item) => item.key), ...found.invalidKeys]);
  if (removalKeys.size > SESSION_DRAFT_MAX_PENDING_REMOVALS) {
    throw new Error('SESSION_DRAFT_PENDING_REMOVAL_CAPACITY_EXCEEDED');
  }
  const records = found.records.slice(0, SESSION_DRAFT_MAX_ENTRIES);
  const pending = normalizeSessionDraftPendingRemovals(found.pending);
  const invalidRemovedKeys = [...new Set(found.invalidKeys)].sort();
  const entries = records.map(({ key, record }) => createSessionDraftIndexEntry(key, record));
  const repairs = invalidRemovedKeys.map((key) => createRecoveryPendingRemoval(key, timestamp));
  const index = {
    ...base,
    entries,
    pendingRemovals: normalizeSessionDraftPendingRemovals([...pending, ...repairs])
  };
  return { index, records, invalidRemovedKeys, invalidRemovedCount: invalidRemovedKeys.length };
}

export function createSessionDraftIndex(entries: SessionDraftIndexEntry[] = []): SessionDraftIndex {
  return {
    schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
    entries,
    receipts: [],
    pendingRemovals: []
  };
}

export function replaceSessionDraftIndexEntries(
  index: SessionDraftIndex,
  entries: SessionDraftIndexEntry[],
  receipts: SessionDraftMutationReceipt[]
): SessionDraftIndex {
  return { ...index, entries, receipts };
}

export function planSessionDraftEnvelopeIndex(input: {
  index: SessionDraftIndex;
  key: string;
  record: SessionDraftRecord;
  receipts: SessionDraftMutationReceipt[];
  retention?: {
    now: number;
    policy: SessionDraftRetentionPolicy;
    maxEntries: number;
  };
}): { index: SessionDraftIndex; removedKeys: string[] } {
  const entries = [
    createSessionDraftIndexEntry(input.key, input.record),
    ...input.index.entries.filter((entry) => entry.key !== input.key)
  ];
  const plan = input.retention
    ? selectSessionDraftRetentionRemovals(
        entries,
        input.retention.now,
        input.retention.policy,
        input.retention.maxEntries,
        input.key
      )
    : { retained: entries, removed: [] };
  return {
    index: replaceSessionDraftIndexEntries(input.index, plan.retained, input.receipts),
    removedKeys: plan.removed.map((entry) => entry.key).filter((key) => key !== input.key)
  };
}

export * from './keys';
export * from './messages';
export * from './retentionPolicy';
export * from './schemas';
export * from './types';
