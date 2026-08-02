import type * as Draft from '../../shared/sessionDrafts';
import * as Identity from '../../shared/sessionDrafts/keys';
import {
  claimSessionDraftTransition,
  describeSessionDraftEnvelopeMutation,
  mutateSessionDraftLeaseTransition,
  saveSessionDraftTransition,
  validateSessionDraftEnvelope,
  validateSessionDraftRemoveTransition,
  type SessionDraftEnvelopeMutationRequest
} from './sessionDraftStoreMutations';
import {
  planAndSelectSessionDraftClaim,
  prepareSessionDraftPrune
} from './sessionDraftStoreSelection';
import {
  commitSessionDraftMutation,
  type SessionDraftStorageSnapshot,
  type SessionDraftStoreStorage
} from './sessionDraftStoreStorage';
export interface SessionDraftMutationQueue {
  run<Result>(operation: () => Promise<Result>): Promise<Result>;
}
export interface SessionDraftStoreTransactionContext {
  storage: SessionDraftStoreStorage;
  now: () => number;
  leaseId: () => string;
  probe: Draft.SessionDraftOwnerLivenessProbe;
  retention: Draft.SessionDraftRetentionPolicy;
  maxEntries: number;
  maxBytes: number;
}
export interface SessionDraftMutationReadyState {
  snapshot: SessionDraftStorageSnapshot;
  digest: string;
  receipts: Draft.SessionDraftMutationReceipt[];
}
const conflict = (code: Draft.SessionDraftConflictCode) => ({ outcome: 'conflict' as const, code });
export function createSessionDraftMutationQueue(): SessionDraftMutationQueue {
  let tail: Promise<void> = Promise.resolve();
  const settle = () => undefined;
  return {
    run<Result>(operation: () => Promise<Result>): Promise<Result> {
      const result = tail.then(operation);
      tail = result.then(settle, settle);
      return result;
    }
  };
}
export async function cleanupInvalidRecords(
  storage: SessionDraftStoreStorage,
  snapshot: SessionDraftStorageSnapshot,
  keys: readonly string[]
): Promise<boolean> {
  const targets = new Set(keys);
  if (targets.size === 0) return true;
  const removals = snapshot.index.pendingRemovals.filter((item) => targets.has(item.key));
  if (removals.length !== targets.size) return false;
  return (await storage.commit({ index: snapshot.index, removals })).ok;
}
async function commit(
  context: SessionDraftStoreTransactionContext,
  state: SessionDraftMutationReadyState,
  plan: Parameters<typeof commitSessionDraftMutation>[1]['plan']
) {
  return commitSessionDraftMutation(context.storage, {
    snapshot: state.snapshot,
    digest: state.digest,
    receipts: state.receipts,
    plan,
    now: context.now(),
    retention: context.retention,
    maxEntries: context.maxEntries
  });
}
export async function runReadySessionDraftEnvelopeMutation(
  context: SessionDraftStoreTransactionContext,
  state: SessionDraftMutationReadyState,
  request: SessionDraftEnvelopeMutationRequest,
  owner: Draft.SessionDraftTrustedOwnerContext
): Promise<Draft.SessionDraftEnvelopeMutationResult> {
  const [current, migratedKey] = Identity.resolveSessionDraftRecord(
    state.snapshot.records,
    request
  );
  const mutationContext = {
    now: context.now(),
    retentionMs: context.retention.retentionMs,
    owner,
    newLeaseId: context.leaseId()
  };
  const transitioned =
    request.operation === 'save'
      ? saveSessionDraftTransition(current, request, mutationContext)
      : mutateSessionDraftLeaseTransition(current, request, mutationContext);
  if (transitioned.outcome === 'conflict') return transitioned;
  const accepted = validateSessionDraftEnvelope(transitioned.envelope, context.maxBytes);
  if (accepted.outcome === 'conflict') return accepted;
  const descriptor = describeSessionDraftEnvelopeMutation(request);
  const saved = await commit(context, state, {
    receipt: {
      requestId: request.requestId,
      key: request.key,
      ...descriptor,
      revision: accepted.envelope.revision
    },
    envelope: accepted.envelope,
    ...(migratedKey && migratedKey !== request.key ? { removedKeys: [migratedKey] } : {}),
    applyRetention: request.operation === 'save'
  });
  return saved.ok
    ? {
        outcome: descriptor.outcome,
        revision: accepted.envelope.revision,
        envelope: accepted.envelope
      }
    : conflict('STORAGE_FAILURE');
}
export async function runReadySessionDraftRemove(
  context: SessionDraftStoreTransactionContext,
  state: SessionDraftMutationReadyState,
  request: Draft.SessionDraftRemoveExactRequest,
  owner: Draft.SessionDraftTrustedOwnerContext
): Promise<Draft.SessionDraftRemoveResult> {
  const current = state.snapshot.records.find((item) => item.key === request.key)?.record;
  const invalid = validateSessionDraftRemoveTransition(current, request, owner);
  if (invalid || !current) return conflict(invalid ?? 'DRAFT_NOT_FOUND');
  const saved = await commit(context, state, {
    receipt: {
      requestId: request.requestId,
      operation: 'remove',
      key: request.key,
      outcome: 'removed',
      revision: current.revision
    },
    entries: state.snapshot.index.entries.filter((entry) => entry.key !== request.key),
    removedKeys: [request.key]
  });
  return saved.ok
    ? { outcome: 'removed', key: request.key, revision: request.expectedRevision }
    : conflict('STORAGE_FAILURE');
}
export async function runReadySessionDraftPrune(
  context: SessionDraftStoreTransactionContext,
  state: SessionDraftMutationReadyState,
  request: Draft.SessionDraftPruneRequest
): Promise<Draft.SessionDraftPruneResult> {
  const prepared = prepareSessionDraftPrune({
    entries: state.snapshot.index.entries,
    invalidRemovedCount: state.snapshot.invalidRemovedCount,
    request,
    now: context.now(),
    policy: context.retention,
    maxEntries: context.maxEntries
  });
  prepared.plan.removedKeys = [
    ...(prepared.plan.removedKeys ?? []),
    ...state.snapshot.invalidRemovedKeys
  ];
  const saved = await commit(context, state, prepared.plan);
  const removedCount = prepared.plan.removedKeys?.length ?? 0;
  return saved.ok ? { outcome: 'pruned', removedCount } : conflict('STORAGE_FAILURE');
}
export async function runReadySessionDraftClaim(
  context: SessionDraftStoreTransactionContext,
  state: SessionDraftMutationReadyState,
  request: Draft.SessionDraftSelectAndClaimRequest,
  owner: Draft.SessionDraftTrustedOwnerContext
): Promise<Draft.SessionDraftSelectAndClaimResult> {
  let rereadFailed = false;
  const { plan, decision } = await planAndSelectSessionDraftClaim(
    {
      mode: request.mode,
      pageUrl: request.pageUrl,
      owner,
      entries: state.snapshot.index.entries,
      candidates: state.snapshot.records,
      invalidRemovedCount: state.snapshot.invalidRemovedCount,
      retentionPolicy: context.retention,
      maxEntries: context.maxEntries
    },
    {
      now: context.now,
      ownerLivenessProbe: context.probe,
      rereadExact: async (key) => {
        const loaded = await context.storage.load();
        if (!loaded.ok) rereadFailed = true;
        return loaded.ok
          ? loaded.snapshot.records.find((item) => item.key === key)?.record
          : undefined;
      }
    }
  );
  if (rereadFailed) return { outcome: 'recovery_failed', code: 'INDEX_RECOVERY_FAILED' };
  if (decision.outcome === 'conflict') return conflict(decision.code);
  const removedKeys = [
    ...plan.removed.map((entry) => entry.key),
    ...state.snapshot.invalidRemovedKeys
  ];
  if (decision.outcome !== 'selected') {
    const saved = await commit(context, state, {
      receipt: {
        requestId: request.requestId,
        operation: 'claim',
        key: Identity.SESSION_DRAFT_INDEX_KEY,
        outcome: decision.outcome,
        invalidRemovedCount: decision.invalidRemovedCount
      },
      entries: plan.retained,
      removedKeys
    });
    return saved.ok ? decision : conflict('STORAGE_FAILURE');
  }
  const transitioned = claimSessionDraftTransition(decision.record, {
    now: context.now(),
    retentionMs: context.retention.retentionMs,
    owner,
    newLeaseId: context.leaseId()
  });
  if (transitioned.outcome === 'conflict') return transitioned;
  const accepted = validateSessionDraftEnvelope(transitioned.envelope, context.maxBytes);
  if (accepted.outcome === 'conflict') return accepted;
  const target = Identity.resolveClaimRekey(decision.key, decision.record, accepted.envelope);
  if (!target) return conflict('STORAGE_KEY_MISMATCH');
  removedKeys.push(...target.removedKeys);
  const saved = await commit(context, state, {
    receipt: {
      requestId: request.requestId,
      operation: 'claim',
      key: target.key,
      outcome: 'claimed',
      revision: accepted.envelope.revision,
      selectionReason: decision.selectionReason,
      invalidRemovedCount: decision.invalidRemovedCount
    },
    entries: plan.retained,
    envelope: accepted.envelope,
    removedKeys
  });
  return saved.ok
    ? {
        outcome: 'claimed',
        revision: accepted.envelope.revision,
        envelope: accepted.envelope,
        selectionReason: decision.selectionReason,
        invalidRemovedCount: decision.invalidRemovedCount
      }
    : conflict('STORAGE_FAILURE');
}
