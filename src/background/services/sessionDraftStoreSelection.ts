import * as Draft from '../../shared/sessionDrafts';
import { SESSION_DRAFT_INDEX_KEY } from '../../shared/sessionDrafts/keys';
import {
  selectSessionDraftRetentionRemovals,
  type SessionDraftRetentionPolicy
} from '../../shared/sessionDrafts/retentionPolicy';
import type {
  SessionDraftCommitPreparation,
  SessionDraftIndexEntry
} from '../../shared/sessionDrafts/types';
import type { SessionDraftPruneRequest } from '../../shared/sessionDrafts/messages';
import {
  selectSessionDraftCandidate,
  type SessionDraftTransactionContext,
  type SessionDraftSelectionDecision,
  type SessionDraftSelectionDependencies,
  type SessionDraftSelectionInput
} from './sessionDraftOwnerLivenessProbe';
export { planAndSelectSessionDraftClaim } from './sessionDraftOwnerLivenessProbe';
import {
  commitSessionDraftMutation,
  type SessionDraftStorageSnapshot,
  type SessionDraftStoreStorage
} from './sessionDraftStoreStorage';
import {
  saveSessionDraftTransition,
  type SessionDraftMutationCommitInput,
  type SessionDraftStorageCommit
} from './sessionDraftStoreMutations';
import { createSessionDraftValueDigest } from './sessionDraftStoreReceipts';

type SessionDraftStoreTransactionContext = SessionDraftTransactionContext<SessionDraftStoreStorage>;

export type {
  SessionDraftClaimPlanInput,
  SessionDraftSelectionCandidate,
  SessionDraftSelectionDecision,
  SessionDraftSelectionDependencies,
  SessionDraftSelectionInput
} from './sessionDraftOwnerLivenessProbe';
export type { SessionDraftMutationCommitInput, SessionDraftStorageCommit };

export function validateSessionDraftEnvelope(
  envelope: Draft.SessionDraftEnvelope,
  maxBytes: number
): Draft.SessionDraftTransitionResult {
  const parsed = Draft.SessionDraftEnvelopeSchema.safeParse(envelope);
  const tooLarge =
    parsed.success ||
    parsed.error.issues.some((issue) => issue.message === 'SESSION_DRAFT_PAYLOAD_TOO_LARGE');
  if (!parsed.success)
    return { outcome: 'conflict', code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'STORAGE_FAILURE' };
  if (Draft.measureSessionDraftValueBytes(parsed.data) > maxBytes)
    return { outcome: 'conflict', code: 'PAYLOAD_TOO_LARGE' };
  return { outcome: 'success', envelope: parsed.data };
}

function snapshotRecord(snapshot: SessionDraftStorageSnapshot, key: string) {
  return snapshot.records.find((item) => item.key === key)?.record;
}

export async function commitSessionDraftLegacyMigration(
  context: SessionDraftStoreTransactionContext,
  input: {
    request: Draft.SessionDraftMigrateLegacyVideoCaptureRequest;
    owner: Draft.SessionDraftTrustedOwnerContext;
    snapshot: SessionDraftStorageSnapshot;
    digest: string;
    receipts: Draft.SessionDraftMutationReceipt[];
    expectedPayloadDigest: string;
    rawExists: boolean;
  }
): Promise<Draft.SessionDraftEnvelopeMutationResult> {
  const { request } = input;
  let snapshot = input.snapshot;
  let current = snapshotRecord(snapshot, request.key);
  if (!input.rawExists && (current?.schemaVersion !== 2 || !current.legacyCleanup))
    return { outcome: 'conflict', code: 'MIGRATION_SOURCE_CHANGED' };
  if (current?.schemaVersion === 1) return { outcome: 'conflict', code: 'DRAFT_EXISTS' };
  if (!current) {
    if (!input.rawExists) return { outcome: 'conflict', code: 'MIGRATION_SOURCE_CHANGED' };
    if (snapshot.records.length >= context.maxEntries)
      return { outcome: 'conflict', code: 'CAPACITY_EXCEEDED' };
    const transitioned = saveSessionDraftTransition(
      undefined,
      {
        operation: 'save',
        requestId: request.requestId,
        key: request.key,
        expectedRevision: null,
        draft: request.draft
      },
      {
        now: context.now(),
        retentionMs: context.retention.retentionMs,
        owner: input.owner,
        newLeaseId: context.leaseId()
      }
    );
    if (transitioned.outcome === 'conflict') return transitioned;
    const obligation: Draft.SessionDraftLegacyCleanupObligation = {
      state: 'pending',
      legacyKey: request.legacyKey,
      v2Key: request.key,
      rawDigest: request.rawDigest,
      canonicalDigest: request.canonicalDigest,
      v2PayloadDigest: input.expectedPayloadDigest,
      requestDigest: input.digest
    };
    const pending = { ...transitioned.envelope, legacyCleanup: obligation };
    const accepted = validateSessionDraftEnvelope(pending, context.maxBytes);
    if (accepted.outcome === 'conflict') return accepted;
    const planned = Draft.planSessionDraftEnvelopeIndex({
      index: snapshot.index,
      key: request.key,
      record: accepted.envelope,
      receipts: input.receipts
    });
    const committed = await context.storage.commit({
      index: planned.index,
      envelope: { key: request.key, value: accepted.envelope }
    });
    if (!committed.ok || !(await context.storage.verifyMigrationCommit(request.key, obligation)))
      return { outcome: 'conflict', code: 'STORAGE_FAILURE' };
    const reloaded = await context.storage.load();
    if (!reloaded.ok) return { outcome: 'recovery_failed', code: reloaded.code };
    snapshot = reloaded.snapshot;
    current = snapshotRecord(snapshot, request.key);
  }
  if (current?.schemaVersion !== 2) return { outcome: 'conflict', code: 'MIGRATION_INPUT_INVALID' };
  if (
    (await createSessionDraftValueDigest(current.payload)) !== input.expectedPayloadDigest ||
    (current.legacyCleanup &&
      (current.legacyCleanup.requestDigest !== input.digest ||
        current.legacyCleanup.legacyKey !== request.legacyKey ||
        current.legacyCleanup.rawDigest !== request.rawDigest ||
        current.legacyCleanup.canonicalDigest !== request.canonicalDigest ||
        current.legacyCleanup.v2PayloadDigest !== input.expectedPayloadDigest))
  )
    return { outcome: 'conflict', code: 'MIGRATION_SOURCE_CHANGED' };
  if (input.rawExists && !(await context.storage.removeLegacyValue(request.legacyKey)))
    return { outcome: 'conflict', code: 'MIGRATION_CLEANUP_PENDING' };
  const cleared = { ...current };
  delete cleared.legacyCleanup;
  const saved = await commitSessionDraftMutation(context.storage, {
    snapshot,
    digest: input.digest,
    receipts: input.receipts,
    plan: {
      receipt: {
        requestId: request.requestId,
        operation: 'migrate',
        key: request.key,
        outcome: 'migrated',
        revision: cleared.revision
      },
      envelope: cleared
    },
    now: context.now(),
    retention: context.retention,
    maxEntries: context.maxEntries
  });
  return saved.ok
    ? { outcome: 'migrated', revision: cleared.revision, envelope: cleared }
    : { outcome: 'conflict', code: 'MIGRATION_CLEANUP_PENDING' };
}

export function selectSessionDraftClaimCandidate(
  input: SessionDraftSelectionInput,
  dependencies: SessionDraftSelectionDependencies
): Promise<SessionDraftSelectionDecision> {
  return selectSessionDraftCandidate(input, dependencies);
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
