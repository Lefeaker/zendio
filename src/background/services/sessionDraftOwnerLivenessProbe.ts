import * as Draft from '../../shared/sessionDrafts';
import {
  commitSessionDraftMutation,
  type SessionDraftStorageSnapshot,
  type SessionDraftStoreStorage
} from './sessionDraftStoreStorage';
export {
  createSessionDraftOwnerLivenessProbe,
  SESSION_DRAFT_OWNER_PROBE_TIMEOUT_MS
} from '../listeners/runtimeMessageContracts';
export type { SessionDraftOwnerLivenessProbeOptions } from '../listeners/runtimeMessageContracts';
export interface SessionDraftTransactionContext<Storage> {
  storage: Storage;
  documentId?: string | undefined;
  now: () => number;
  leaseId: () => string;
  probe: Draft.SessionDraftOwnerLivenessProbe;
  retention: Draft.SessionDraftRetentionPolicy;
  maxEntries: number;
  maxBytes: number;
}
type SessionDraftStoreTransactionContext = SessionDraftTransactionContext<SessionDraftStoreStorage>;
export interface SessionDraftSelectionCandidate {
  key: string;
  record: Draft.SessionDraftRecord;
}
export interface SessionDraftSelectionDependencies {
  now: () => number;
  ownerLivenessProbe: Draft.SessionDraftOwnerLivenessProbe;
  rereadExact: (key: string) => Promise<Draft.SessionDraftRecord | undefined>;
}
export interface SessionDraftSelectionInput {
  mode: Draft.SessionDraftMode;
  pageUrl: string;
  owner: Draft.SessionDraftTrustedOwnerContext;
  candidates: readonly SessionDraftSelectionCandidate[];
  invalidRemovedCount?: number;
  retentionPolicy?: Partial<Draft.SessionDraftRetentionPolicy>;
}
export interface SessionDraftClaimPlanInput extends SessionDraftSelectionInput {
  entries: readonly Draft.SessionDraftIndexEntry[];
  maxEntries?: number;
}
type SessionDraftSelectionConflictCode = Extract<
  Draft.SessionDraftConflictCode,
  'OWNER_CONTEXT_INVALID' | 'OWNER_ACTIVE' | 'OWNER_LIVENESS_UNAVAILABLE' | 'RECORD_CHANGED'
>;
export type SessionDraftSelectionDecision =
  | {
      outcome: 'selected';
      key: string;
      record: Draft.SessionDraftRecord;
      selectionReason: Draft.SessionDraftSelectionReason;
      invalidRemovedCount: number;
    }
  | { outcome: 'none'; invalidRemovedCount: 0 }
  | { outcome: 'invalid_removed'; invalidRemovedCount: number }
  | { outcome: 'conflict'; code: SessionDraftSelectionConflictCode };

function isExactCandidate(
  candidate: SessionDraftSelectionCandidate,
  input: Pick<SessionDraftSelectionInput, 'mode' | 'pageUrl'>
): boolean {
  return (
    Draft.matchesSessionDraftStorageRecord(candidate.key, candidate.record) &&
    Draft.matchesSessionDraftPageIdentity(candidate.record, input)
  );
}

function emptyDecision(invalidRemovedCount: number): SessionDraftSelectionDecision {
  return invalidRemovedCount > 0
    ? { outcome: 'invalid_removed', invalidRemovedCount }
    : { outcome: 'none', invalidRemovedCount: 0 };
}

async function recheckCandidate(
  candidate: SessionDraftSelectionCandidate,
  selectionReason: Draft.SessionDraftSelectionReason,
  invalidRemovedCount: number,
  rereadExact: SessionDraftSelectionDependencies['rereadExact']
): Promise<SessionDraftSelectionDecision> {
  const current = await rereadExact(candidate.key);
  if (
    !current ||
    current.schemaVersion !== candidate.record.schemaVersion ||
    current.revision !== candidate.record.revision ||
    JSON.stringify(current) !== JSON.stringify(candidate.record)
  )
    return { outcome: 'conflict', code: 'RECORD_CHANGED' };
  return {
    outcome: 'selected',
    key: candidate.key,
    record: current,
    selectionReason,
    invalidRemovedCount
  };
}

function createProbeTarget(
  candidate: SessionDraftSelectionCandidate,
  now: number
): Draft.SessionDraftOwnerLivenessTarget | undefined {
  if (candidate.record.schemaVersion === 1) {
    const parsed = Draft.SessionDraftTrustedOwnerContextSchema.safeParse(
      candidate.record.legacyOwnerContext
    );
    return parsed.success
      ? { kind: 'legacy-v1', key: candidate.key, owner: parsed.data }
      : undefined;
  }
  const lease = candidate.record.lease;
  const documentId = lease && Draft.getSessionDraftLeaseDocumentId(lease.leaseId);
  return lease
    ? {
        kind: 'leased-v2',
        key: candidate.key,
        leaseId: lease.leaseId,
        owner: lease.owner,
        ...(documentId ? { documentId } : {}),
        ...(lease.leaseExpiresAt > now ? { requirePositiveInactiveEvidence: true } : {})
      }
    : undefined;
}

export async function selectSessionDraftCandidate(
  input: SessionDraftSelectionInput,
  dependencies: SessionDraftSelectionDependencies,
  now = dependencies.now()
): Promise<SessionDraftSelectionDecision> {
  if (!Draft.SessionDraftTrustedOwnerContextSchema.safeParse(input.owner).success)
    return { outcome: 'conflict', code: 'OWNER_CONTEXT_INVALID' };
  const policy = Draft.normalizeSessionDraftRetentionPolicy(input.retentionPolicy);
  const invalidRemovedCount = Math.max(0, input.invalidRemovedCount ?? 0);
  const candidates = input.candidates
    .filter(
      (candidate) =>
        isExactCandidate(candidate, input) &&
        Draft.getSessionDraftEffectiveExpiresAt(candidate.record, policy) > now
    )
    .sort(
      (left, right) =>
        right.record.updatedAt - left.record.updatedAt ||
        Draft.compareSessionDraftText(left.key, right.key)
    );
  const restorable = candidates.find((candidate) => candidate.record.status === 'restorable');
  if (restorable)
    return recheckCandidate(
      restorable,
      'restorable',
      invalidRemovedCount,
      dependencies.rereadExact
    );
  const candidate = candidates.find(
    ({ record }) =>
      record.status === 'active' &&
      (record.schemaVersion === 1 ||
        Boolean(
          record.lease &&
          (record.lease.leaseExpiresAt <= now ||
            Draft.getSessionDraftLeaseDocumentId(record.lease.leaseId))
        ))
  );
  if (!candidate) return emptyDecision(invalidRemovedCount);
  const target = createProbeTarget(candidate, now);
  if (!target) return { outcome: 'conflict', code: 'OWNER_LIVENESS_UNAVAILABLE' };
  let ownerState: 'active' | 'inactive';
  try {
    ownerState = await dependencies.ownerLivenessProbe(target);
  } catch {
    return { outcome: 'conflict', code: 'OWNER_LIVENESS_UNAVAILABLE' };
  }
  if (ownerState !== 'inactive') return { outcome: 'conflict', code: 'OWNER_ACTIVE' };
  return recheckCandidate(
    candidate,
    // Keep the existing receipt tag for both timed-out and positively revoked lease ownership.
    target.kind === 'legacy-v1' ? 'legacy_owner_inactive' : 'expired_owner_inactive',
    invalidRemovedCount,
    dependencies.rereadExact
  );
}

export async function planAndSelectSessionDraftClaim(
  input: SessionDraftClaimPlanInput,
  dependencies: SessionDraftSelectionDependencies
) {
  const now = dependencies.now();
  const plan = Draft.selectSessionDraftRetentionRemovals(
    input.entries,
    now,
    Draft.normalizeSessionDraftRetentionPolicy(input.retentionPolicy),
    input.maxEntries
  );
  const retainedKeys = new Set(plan.retained.map((entry) => entry.key));
  const decision = await selectSessionDraftCandidate(
    { ...input, candidates: input.candidates.filter((entry) => retainedKeys.has(entry.key)) },
    dependencies,
    now
  );
  return { plan, decision };
}

async function clearLegacyCleanup(
  context: SessionDraftStoreTransactionContext,
  snapshot: SessionDraftStorageSnapshot,
  key: string,
  envelope: Draft.SessionDraftEnvelope
): Promise<boolean> {
  const obligation = envelope.legacyCleanup;
  if (!obligation || obligation.v2Key !== key) return true;
  const raw = await context.storage.readLegacyValue(obligation.legacyKey);
  if (raw !== undefined) {
    const decoded = Draft.decodeLegacyVideoCapture(raw);
    const [rawDigest, canonicalDigest] = decoded.ok
      ? await Promise.all([
          Draft.digestLegacyVideoCaptureJson(decoded.rawCanonicalJson),
          Draft.digestLegacyVideoCaptureJson(decoded.canonicalJson)
        ])
      : [];
    if (
      !decoded.ok ||
      rawDigest !== obligation.rawDigest ||
      canonicalDigest !== obligation.canonicalDigest
    )
      return false;
    if (!(await context.storage.removeLegacyValue(obligation.legacyKey))) return false;
  }
  const cleared = { ...envelope };
  delete cleared.legacyCleanup;
  return (
    await commitSessionDraftMutation(context.storage, {
      snapshot,
      digest: obligation.requestDigest,
      receipts: snapshot.index.receipts,
      plan: {
        receipt: {
          requestId: `migration-recovery-${obligation.requestDigest.slice(0, 48)}`,
          operation: 'migrate',
          key,
          outcome: 'migrated',
          revision: cleared.revision
        },
        envelope: cleared
      },
      now: context.now(),
      retention: context.retention,
      maxEntries: context.maxEntries
    })
  ).ok;
}

export async function retrySessionDraftLegacyCleanup(
  context: SessionDraftStoreTransactionContext,
  snapshot: SessionDraftStorageSnapshot
): Promise<{ snapshot: SessionDraftStorageSnapshot; blocked: boolean }> {
  let current = snapshot;
  for (const item of [...current.records]) {
    if (item.record.schemaVersion !== 2 || !item.record.legacyCleanup) continue;
    if (!(await clearLegacyCleanup(context, current, item.key, item.record)))
      return { snapshot: current, blocked: true };
    const reloaded = await context.storage.load();
    if (!reloaded.ok) return { snapshot: current, blocked: true };
    current = reloaded.snapshot;
  }
  return { snapshot: current, blocked: false };
}
