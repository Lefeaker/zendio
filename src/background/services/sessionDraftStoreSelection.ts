import {
  createSessionDraftPageKey,
  createSessionDraftStorageIdentity,
  SESSION_DRAFT_INDEX_KEY
} from '../../shared/sessionDrafts/keys';
import type { SessionDraftPruneRequest } from '../../shared/sessionDrafts/messages';
import {
  getSessionDraftEffectiveExpiresAt,
  normalizeSessionDraftRetentionPolicy,
  selectSessionDraftRetentionRemovals
} from '../../shared/sessionDrafts/retentionPolicy';
import { SessionDraftTrustedOwnerContextSchema } from '../../shared/sessionDrafts/schemas';
import type {
  SessionDraftConflictCode,
  SessionDraftCommitPreparation,
  SessionDraftIndexEntry,
  SessionDraftOwnerLivenessProbe,
  SessionDraftOwnerLivenessTarget,
  SessionDraftRecord,
  SessionDraftRetentionPolicy,
  SessionDraftSelectionReason,
  SessionDraftTrustedOwnerContext
} from '../../shared/sessionDrafts/types';

export interface SessionDraftSelectionCandidate {
  key: string;
  record: SessionDraftRecord;
}

export interface SessionDraftSelectionDependencies {
  now: () => number;
  ownerLivenessProbe: SessionDraftOwnerLivenessProbe;
  rereadExact: (key: string) => Promise<SessionDraftRecord | undefined>;
}

export interface SessionDraftSelectionInput {
  mode: SessionDraftRecord['mode'];
  pageUrl: string;
  owner: SessionDraftTrustedOwnerContext;
  candidates: readonly SessionDraftSelectionCandidate[];
  invalidRemovedCount?: number;
  retentionPolicy?: Partial<SessionDraftRetentionPolicy>;
}

export interface SessionDraftClaimPlanInput extends SessionDraftSelectionInput {
  entries: readonly SessionDraftIndexEntry[];
  maxEntries?: number;
}

export type SessionDraftSelectionDecision =
  | {
      outcome: 'selected';
      key: string;
      record: SessionDraftRecord;
      selectionReason: SessionDraftSelectionReason;
      invalidRemovedCount: number;
    }
  | { outcome: 'none'; invalidRemovedCount: 0 }
  | { outcome: 'invalid_removed'; invalidRemovedCount: number }
  | {
      outcome: 'conflict';
      code: SessionDraftSelectionConflictCode;
    };

type SessionDraftSelectionConflictCode = Extract<
  SessionDraftConflictCode,
  'OWNER_CONTEXT_INVALID' | 'OWNER_ACTIVE' | 'OWNER_LIVENESS_UNAVAILABLE' | 'RECORD_CHANGED'
>;

function isExactCandidate(candidate: SessionDraftSelectionCandidate, pageKey: string): boolean {
  const { record } = candidate;
  const identity = createSessionDraftStorageIdentity(record);
  return (
    record.pageKey === pageKey &&
    identity.pageKey === record.pageKey &&
    identity.key === candidate.key
  );
}

function isSameClaimTarget(left: SessionDraftRecord, right: SessionDraftRecord): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.revision === right.revision &&
    JSON.stringify(left) === JSON.stringify(right)
  );
}

function emptyDecision(invalidRemovedCount: number): SessionDraftSelectionDecision {
  return invalidRemovedCount > 0
    ? { outcome: 'invalid_removed', invalidRemovedCount }
    : { outcome: 'none', invalidRemovedCount: 0 };
}

async function recheckCandidate(
  candidate: SessionDraftSelectionCandidate,
  selectionReason: SessionDraftSelectionReason,
  invalidRemovedCount: number,
  rereadExact: SessionDraftSelectionDependencies['rereadExact']
): Promise<SessionDraftSelectionDecision> {
  const current = await rereadExact(candidate.key);
  if (!current || !isSameClaimTarget(candidate.record, current)) {
    return { outcome: 'conflict', code: 'RECORD_CHANGED' };
  }
  return {
    outcome: 'selected',
    key: candidate.key,
    record: current,
    selectionReason,
    invalidRemovedCount
  };
}

function createProbeTarget(
  candidate: SessionDraftSelectionCandidate
): SessionDraftOwnerLivenessTarget | undefined {
  if (candidate.record.schemaVersion === 1) {
    const parsed = SessionDraftTrustedOwnerContextSchema.safeParse(
      candidate.record.legacyOwnerContext
    );
    return parsed.success
      ? { kind: 'legacy-v1', key: candidate.key, owner: parsed.data }
      : undefined;
  }
  const lease = candidate.record.lease;
  return lease
    ? { kind: 'leased-v2', key: candidate.key, leaseId: lease.leaseId, owner: lease.owner }
    : undefined;
}

async function selectCandidate(
  input: SessionDraftSelectionInput,
  dependencies: SessionDraftSelectionDependencies,
  now: number
): Promise<SessionDraftSelectionDecision> {
  if (!SessionDraftTrustedOwnerContextSchema.safeParse(input.owner).success) {
    return { outcome: 'conflict', code: 'OWNER_CONTEXT_INVALID' };
  }
  const policy = normalizeSessionDraftRetentionPolicy(input.retentionPolicy);
  const pageKey = createSessionDraftPageKey(input.mode, input.pageUrl);
  const invalidRemovedCount = Math.max(0, input.invalidRemovedCount ?? 0);
  const candidates = input.candidates
    .filter(
      (candidate) =>
        candidate.record.mode === input.mode &&
        isExactCandidate(candidate, pageKey) &&
        getSessionDraftEffectiveExpiresAt(candidate.record, policy) > now
    )
    .sort(
      (left, right) =>
        right.record.updatedAt - left.record.updatedAt ||
        (left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
    );
  const restorable = candidates.find((candidate) => candidate.record.status === 'restorable');
  if (restorable) {
    return recheckCandidate(
      restorable,
      'restorable',
      invalidRemovedCount,
      dependencies.rereadExact
    );
  }
  const probeCandidate = candidates.find((candidate) => {
    if (candidate.record.status !== 'active') return false;
    return (
      candidate.record.schemaVersion === 1 ||
      Boolean(candidate.record.lease && candidate.record.lease.leaseExpiresAt <= now)
    );
  });
  if (!probeCandidate) return emptyDecision(invalidRemovedCount);
  const target = createProbeTarget(probeCandidate);
  if (!target) return { outcome: 'conflict', code: 'OWNER_LIVENESS_UNAVAILABLE' };
  let ownerState: 'active' | 'inactive';
  try {
    ownerState = await dependencies.ownerLivenessProbe(target);
  } catch {
    return { outcome: 'conflict', code: 'OWNER_LIVENESS_UNAVAILABLE' };
  }
  if (ownerState !== 'inactive') return { outcome: 'conflict', code: 'OWNER_ACTIVE' };
  return recheckCandidate(
    probeCandidate,
    target.kind === 'legacy-v1' ? 'legacy_owner_inactive' : 'expired_owner_inactive',
    invalidRemovedCount,
    dependencies.rereadExact
  );
}

export function selectSessionDraftClaimCandidate(
  input: SessionDraftSelectionInput,
  dependencies: SessionDraftSelectionDependencies
): Promise<SessionDraftSelectionDecision> {
  return selectCandidate(input, dependencies, dependencies.now());
}

export async function planAndSelectSessionDraftClaim(
  input: SessionDraftClaimPlanInput,
  dependencies: SessionDraftSelectionDependencies
) {
  const now = dependencies.now();
  const plan = selectSessionDraftRetentionRemovals(
    input.entries,
    now,
    normalizeSessionDraftRetentionPolicy(input.retentionPolicy),
    input.maxEntries
  );
  const retainedKeys = new Set(plan.retained.map((entry) => entry.key));
  const decision = await selectCandidate(
    { ...input, candidates: input.candidates.filter((entry) => retainedKeys.has(entry.key)) },
    dependencies,
    now
  );
  return { plan, decision };
}

export function prepareSessionDraftPrune(input: {
  entries: readonly SessionDraftIndexEntry[];
  invalidRemovedCount: number;
  request: SessionDraftPruneRequest;
  now: number;
  policy: SessionDraftRetentionPolicy;
  maxEntries: number;
}): Extract<SessionDraftCommitPreparation, { outcome: 'prepared' }> {
  const plan = selectSessionDraftRetentionRemovals(
    input.entries,
    input.now,
    input.policy,
    input.maxEntries
  );
  const removedCount = plan.removed.length + input.invalidRemovedCount;
  return {
    outcome: 'prepared',
    plan: {
      receipt: {
        requestId: input.request.requestId,
        operation: 'prune',
        key: SESSION_DRAFT_INDEX_KEY,
        outcome: 'pruned',
        removedCount
      },
      entries: plan.retained,
      removedKeys: plan.removed.map((entry) => entry.key)
    }
  };
}
