import {
  SESSION_DRAFT_SCHEMA_VERSION,
  type SessionDraftRemovalTombstone,
  type SessionDraftCommitMetadata,
  type SessionDraftIndexEntry,
  type SessionDraftMode,
  type SessionDraftMutationOperation,
  type SessionDraftMutationOutcome,
  type SessionDraftMutationReceipt,
  type SessionDraftPendingRemoval,
  type SessionDraftRecord
} from './types';
import {
  createLegacySessionDraftPageKey,
  createSessionDraftPageIdentity,
  matchesSessionDraftPageIdentity,
  type SessionDraftIdentityRequest
} from './pageIdentity';

const SESSION_DRAFT_KEY_PREFIX = 'aiob.sessionDraft';
const SESSION_DRAFT_VALUE_PREFIX = `${SESSION_DRAFT_KEY_PREFIX}.v1.`;
export const SESSION_DRAFT_INDEX_KEY = `${SESSION_DRAFT_KEY_PREFIX}.index.v1`;
export const SESSION_DRAFT_QUARANTINE_KEY = `${SESSION_DRAFT_INDEX_KEY}.quarantine.latest`;

export {
  createSessionDraftCanonicalPageFields,
  createLegacySessionDraftPageKey,
  createSessionDraftPageIdentity,
  createSessionDraftPageKey,
  hasCanonicalSessionDraftPageIdentity,
  matchesSessionDraftPageIdentity,
  matchesSessionDraftRecordPageIdentity,
  normalizeSessionDraftPageUrl
} from './pageIdentity';

export function createSessionDraftStorageKey(input: {
  mode: SessionDraftMode;
  pageKey: string;
  draftId: string;
}): string {
  return `${SESSION_DRAFT_VALUE_PREFIX}${input.mode}.${input.pageKey}.${encodeURIComponent(input.draftId)}`;
}

export function createSessionDraftStorageIdentity(input: {
  mode: SessionDraftMode;
  pageUrl: string;
  draftId: string;
}): { key: string; pageKey: string; normalizedPageUrl: string } {
  const identity = createSessionDraftPageIdentity(input.mode, input.pageUrl);
  return {
    pageKey: identity.pageKey,
    normalizedPageUrl: identity.normalizedPageUrl,
    key: createSessionDraftStorageKey({ ...input, pageKey: identity.pageKey })
  };
}

export function resolveSessionDraftRecord(
  records: readonly { key: string; record: SessionDraftRecord }[],
  request: SessionDraftIdentityRequest
): readonly [SessionDraftRecord | undefined, string | undefined] {
  const exact = records.find((item) => item.key === request.key);
  if (exact || request.operation !== 'save' || !request.draft) {
    return [exact?.record, undefined];
  }
  const draft = request.draft;
  const legacy = records.find(
    (item) =>
      item.record.schemaVersion === 1 &&
      item.record.draftId === draft.draftId &&
      matchesSessionDraftPageIdentity(item.record, draft)
  );
  return [legacy?.record, legacy?.key];
}

export function resolveClaimRekey(
  sourceKey: string,
  source: SessionDraftRecord,
  target: { mode: SessionDraftMode; pageUrl: string; draftId: string }
): { key: string; removedKeys: string[] } | undefined {
  const identity = createSessionDraftStorageIdentity(target);
  if (source.schemaVersion === 2 && identity.key !== sourceKey) return undefined;
  return { key: identity.key, removedKeys: identity.key === sourceKey ? [] : [sourceKey] };
}

export function matchesSessionDraftStorageIdentity(input: {
  key: string;
  mode: SessionDraftMode;
  pageUrl: string;
  pageKey?: string;
  draftId: string;
}): boolean {
  const identity = createSessionDraftStorageIdentity(input);
  return (
    input.key === identity.key &&
    (input.pageKey === undefined || input.pageKey === identity.pageKey)
  );
}

export function matchesSessionDraftStorageRecord(key: string, record: SessionDraftRecord): boolean {
  if (record.schemaVersion === 1) {
    const pageKey = createLegacySessionDraftPageKey(record.mode, record.pageUrl);
    return (
      record.pageKey === pageKey &&
      key === createSessionDraftStorageKey({ mode: record.mode, pageKey, draftId: record.draftId })
    );
  }
  return matchesSessionDraftStorageIdentity({
    key,
    mode: record.mode,
    pageUrl: record.pageUrl,
    pageKey: record.pageKey,
    draftId: record.draftId
  });
}

export function parseSessionDraftStorageKey(
  value: string
): { mode: SessionDraftMode; pageKey: string; draftId: string } | undefined {
  if (!value.startsWith(SESSION_DRAFT_VALUE_PREFIX)) return undefined;
  const [mode, pageKey, ...draftParts] = value.slice(SESSION_DRAFT_VALUE_PREFIX.length).split('.');
  if ((mode !== 'reader' && mode !== 'video') || !pageKey || draftParts.length === 0) {
    return undefined;
  }
  try {
    const draftId = decodeURIComponent(draftParts.join('.'));
    return draftId ? { mode, pageKey, draftId } : undefined;
  } catch {
    return undefined;
  }
}

export function isSessionDraftStorageKey(value: string): boolean {
  return parseSessionDraftStorageKey(value) !== undefined;
}

export function isExactSessionDraftStorageKey(key: string): boolean {
  if (key.length > 1024) return false;
  const parsed = parseSessionDraftStorageKey(key);
  return parsed !== undefined && createSessionDraftStorageKey(parsed) === key;
}

export function compareSessionDraftText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

export function compareSessionDraftStoredRecords(
  left: { key: string; record: Pick<SessionDraftRecord, 'updatedAt'> },
  right: { key: string; record: Pick<SessionDraftRecord, 'updatedAt'> }
): number {
  return (
    right.record.updatedAt - left.record.updatedAt || compareSessionDraftText(left.key, right.key)
  );
}

export function createSessionDraftIndexEntry(
  key: string,
  record: SessionDraftRecord
): SessionDraftIndexEntry {
  return {
    key,
    draftId: record.draftId,
    mode: record.mode,
    pageKey: record.pageKey,
    recordSchemaVersion: record.schemaVersion,
    revision: record.revision,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    status: record.status
  };
}

export function createSessionDraftRemovalTombstone(
  pending: SessionDraftPendingRemoval
): SessionDraftRemovalTombstone {
  return {
    ...pending,
    schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
    kind: 'session-draft-removal-tombstone'
  };
}

const EXACT_MUTATION_OUTCOMES: Partial<
  Record<SessionDraftMutationOperation, SessionDraftMutationOutcome>
> = {
  save: 'saved',
  finalize: 'finalized',
  remove: 'removed',
  renew: 'renewed',
  release: 'released'
};
export function isValidSessionDraftMutationMetadata(value: SessionDraftCommitMetadata): boolean {
  const exactOutcome = EXACT_MUTATION_OUTCOMES[value.operation];
  const exactRecord = isExactSessionDraftStorageKey(value.key);
  const hasRevision = value.revision !== undefined && value.revision >= 1;
  if (exactOutcome !== undefined) {
    return (
      exactRecord &&
      value.outcome === exactOutcome &&
      hasRevision &&
      value.removedCount === undefined &&
      value.selectionReason === undefined &&
      value.invalidRemovedCount === undefined
    );
  }
  if (value.operation === 'prune') {
    return (
      value.key === SESSION_DRAFT_INDEX_KEY &&
      value.outcome === 'pruned' &&
      value.revision === undefined &&
      value.removedCount !== undefined &&
      value.selectionReason === undefined &&
      value.invalidRemovedCount === undefined
    );
  }
  if (value.operation !== 'claim' || value.removedCount !== undefined) return false;
  if (value.outcome === 'claimed') {
    return (
      exactRecord &&
      hasRevision &&
      value.selectionReason !== undefined &&
      value.invalidRemovedCount !== undefined
    );
  }
  return (
    value.key === SESSION_DRAFT_INDEX_KEY &&
    value.revision === undefined &&
    value.selectionReason === undefined &&
    ((value.outcome === 'none' && value.invalidRemovedCount === 0) ||
      (value.outcome === 'invalid_removed' && (value.invalidRemovedCount ?? 0) > 0))
  );
}

export function isValidSessionDraftMutationReceipt(value: SessionDraftMutationReceipt): boolean {
  const envelopeOutcome = ['saved', 'finalized', 'claimed', 'renewed', 'released'].includes(
    value.outcome
  );
  return (
    isValidSessionDraftMutationMetadata(value) &&
    (value.resultDigest === undefined || envelopeOutcome)
  );
}

export function isValidSessionDraftPendingRemoval(value: SessionDraftPendingRemoval): boolean {
  const { receiptKey, ...metadata } = value;
  return (
    isExactSessionDraftStorageKey(value.key) &&
    isValidSessionDraftMutationReceipt({ ...metadata, key: receiptKey })
  );
}
