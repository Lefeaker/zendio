import type { StorageAreaService } from '../../platform/interfaces/storage';
import * as Draft from '../../shared/sessionDrafts';
import {
  createSessionDraftMutationQueue,
  cleanupInvalidRecords,
  runReadySessionDraftClaim,
  runReadySessionDraftEnvelopeMutation,
  runReadySessionDraftPrune,
  runReadySessionDraftRemove,
  type SessionDraftMutationReadyState,
  type SessionDraftStoreTransactionContext
} from './sessionDraftMutationQueue';
import {
  describeSessionDraftEnvelopeMutation,
  withoutLegacyOwner,
  type SessionDraftEnvelopeMutationRequest
} from './sessionDraftStoreMutations';
import {
  beginSessionDraftMutation,
  formatSessionDraftReceiptReplay
} from './sessionDraftStoreReceipts';
import {
  createSessionDraftStoreStorage,
  isEnumerableSessionDraftStorage,
  type SessionDraftStorageSnapshot
} from './sessionDraftStoreStorage';

type OwnerInput = object | null | undefined;
type MutationRequest =
  | SessionDraftEnvelopeMutationRequest
  | Draft.SessionDraftRemoveExactRequest
  | Draft.SessionDraftPruneRequest
  | Draft.SessionDraftSelectAndClaimRequest;
type MutationResult =
  | Draft.SessionDraftEnvelopeMutationResult
  | Draft.SessionDraftRemoveResult
  | Draft.SessionDraftPruneResult
  | Draft.SessionDraftSelectAndClaimResult;
type MutationIdentity = { operation: Draft.SessionDraftMutationOperation; key?: string };
type Failure = Extract<MutationResult, { outcome: 'conflict' | 'recovery_failed' }>;
function conflict(code: Draft.SessionDraftConflictCode): Failure {
  return { outcome: 'conflict', code };
}
function trustedOwner(value: OwnerInput): Draft.SessionDraftTrustedOwnerContext | undefined {
  const parsed = Draft.SessionDraftTrustedOwnerContextSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
function record(snapshot: SessionDraftStorageSnapshot, key: string) {
  return snapshot.records.find((item) => item.key === key)?.record;
}
function identity(request: MutationRequest): MutationIdentity {
  if (request.operation === 'removeExact') return { operation: 'remove', key: request.key };
  if (request.operation === 'prune')
    return { operation: 'prune', key: Draft.SESSION_DRAFT_INDEX_KEY };
  if (request.operation === 'selectAndClaim') return { operation: 'claim' };
  return { ...describeSessionDraftEnvelopeMutation(request), key: request.key };
}
async function replayResult(
  request: MutationRequest,
  snapshot: SessionDraftStorageSnapshot,
  receipt: Draft.SessionDraftMutationReceipt
): Promise<MutationResult> {
  const current = record(snapshot, receipt.key);
  const replayed = await formatSessionDraftReceiptReplay(
    receipt,
    current?.schemaVersion === 2 ? { key: receipt.key, envelope: current } : undefined
  );
  if (request.operation === 'prune') {
    return receipt.outcome === 'pruned' && receipt.removedCount !== undefined
      ? { outcome: 'pruned', removedCount: receipt.removedCount, replay: replayed.replay }
      : conflict('STORAGE_FAILURE');
  }
  if (request.operation === 'removeExact') {
    return receipt.outcome === 'removed' && receipt.revision !== undefined
      ? {
          outcome: 'removed',
          key: receipt.key,
          revision: receipt.revision,
          replay: replayed.replay
        }
      : conflict('STORAGE_FAILURE');
  }
  if (request.operation === 'selectAndClaim') {
    if (receipt.outcome === 'none' && receipt.invalidRemovedCount === 0) {
      return { outcome: 'none', invalidRemovedCount: 0, replay: replayed.replay };
    }
    if (receipt.outcome === 'invalid_removed' && (receipt.invalidRemovedCount ?? 0) > 0) {
      return {
        outcome: 'invalid_removed',
        invalidRemovedCount: receipt.invalidRemovedCount ?? 0,
        replay: replayed.replay
      };
    }
    return receipt.outcome === 'claimed' &&
      receipt.revision !== undefined &&
      receipt.selectionReason !== undefined &&
      receipt.invalidRemovedCount !== undefined
      ? {
          outcome: 'claimed',
          revision: receipt.revision,
          selectionReason: receipt.selectionReason,
          invalidRemovedCount: receipt.invalidRemovedCount,
          ...replayed
        }
      : conflict('STORAGE_FAILURE');
  }
  const descriptor = describeSessionDraftEnvelopeMutation(request);
  return receipt.outcome === descriptor.outcome && receipt.revision !== undefined
    ? { outcome: descriptor.outcome, revision: receipt.revision, ...replayed }
    : conflict('STORAGE_FAILURE');
}
function mutate(
  context: SessionDraftStoreTransactionContext,
  request: SessionDraftEnvelopeMutationRequest,
  owner: OwnerInput
): Promise<Draft.SessionDraftEnvelopeMutationResult>;
function mutate(
  context: SessionDraftStoreTransactionContext,
  request: Draft.SessionDraftRemoveExactRequest,
  owner: OwnerInput
): Promise<Draft.SessionDraftRemoveResult>;
function mutate(
  context: SessionDraftStoreTransactionContext,
  request: Draft.SessionDraftPruneRequest
): Promise<Draft.SessionDraftPruneResult>;
function mutate(
  context: SessionDraftStoreTransactionContext,
  request: Draft.SessionDraftSelectAndClaimRequest,
  owner: OwnerInput
): Promise<Draft.SessionDraftSelectAndClaimResult>;
async function mutate(
  context: SessionDraftStoreTransactionContext,
  request: MutationRequest,
  value?: OwnerInput
): Promise<MutationResult> {
  const owner = request.operation === 'prune' ? undefined : trustedOwner(value);
  if (request.operation !== 'prune' && !owner) return conflict('OWNER_CONTEXT_INVALID');
  const invalidPayload =
    request.operation === 'save' &&
    !Draft.SessionDraftPayloadSchema.safeParse(request.draft.payload).success;
  if (invalidPayload) return conflict('PAYLOAD_INVALID');
  const target = identity(request);
  const loaded = await context.storage.load();
  if (!loaded.ok) return { outcome: 'recovery_failed', code: loaded.code };
  const started = await beginSessionDraftMutation({
    request,
    operation: target.operation,
    receipts: loaded.snapshot.index.receipts,
    now: context.now(),
    ...(target.key ? { exactKey: target.key } : {}),
    ...(owner ? { owner } : {})
  });
  if (started.kind === 'reuse') return conflict('REQUEST_ID_REUSE');
  if (started.kind === 'replay') return replayResult(request, loaded.snapshot, started.receipt);
  const state: SessionDraftMutationReadyState = { ...started, snapshot: loaded.snapshot };
  if (request.operation === 'prune') return runReadySessionDraftPrune(context, state, request);
  if (!owner) return conflict('OWNER_CONTEXT_INVALID');
  if (request.operation === 'removeExact')
    return runReadySessionDraftRemove(context, state, request, owner);
  if (request.operation === 'selectAndClaim')
    return runReadySessionDraftClaim(context, state, request, owner);
  return runReadySessionDraftEnvelopeMutation(context, state, request, owner);
}
async function read(
  context: SessionDraftStoreTransactionContext,
  request: Draft.SessionDraftReadExactRequest
): Promise<Draft.SessionDraftReadExactResult> {
  const loaded = await context.storage.load();
  if (!loaded.ok) return { outcome: 'recovery_failed', code: loaded.code };
  const found = record(loaded.snapshot, request.key);
  if (found) return { outcome: 'found', envelope: withoutLegacyOwner(found) };
  if (!loaded.snapshot.invalidRemovedKeys.includes(request.key)) return { outcome: 'missing' };
  const cleaned = await cleanupInvalidRecords(context.storage, loaded.snapshot, [request.key]);
  if (!cleaned) return { outcome: 'recovery_failed', code: 'INDEX_RECOVERY_FAILED' };
  return { outcome: 'invalid_removed', invalidRemovedCount: 1 };
}
async function list(
  context: SessionDraftStoreTransactionContext,
  request: Draft.SessionDraftListRequest
): Promise<Draft.SessionDraftListResult> {
  const loaded = await context.storage.load();
  if (!loaded.ok) return { outcome: 'recovery_failed', code: loaded.code };
  const snapshot = loaded.snapshot;
  const cleaned = await cleanupInvalidRecords(
    context.storage,
    snapshot,
    snapshot.invalidRemovedKeys
  );
  if (!cleaned) return { outcome: 'recovery_failed', code: 'INDEX_RECOVERY_FAILED' };
  const pageKey = Draft.createSessionDraftPageKey(request.mode, request.pageUrl);
  return {
    outcome: 'listed',
    envelopes: snapshot.records
      .map((item) => withoutLegacyOwner(item.record))
      .filter((item) => item.mode === request.mode && item.pageKey === pageKey),
    invalidRemovedCount: snapshot.invalidRemovedCount
  };
}

function queuedStore(context: SessionDraftStoreTransactionContext) {
  const queue = createSessionDraftMutationQueue();
  return {
    readExact: (request: Draft.SessionDraftReadExactRequest) =>
      queue.run(() => read(context, request)),
    save: (request: Draft.SessionDraftSaveRequest, owner: OwnerInput) =>
      queue.run(() => mutate(context, request, owner)),
    finalizeExact: (request: Draft.SessionDraftFinalizeExactRequest, owner: OwnerInput) =>
      queue.run(() => mutate(context, request, owner)),
    removeExact: (request: Draft.SessionDraftRemoveExactRequest, owner: OwnerInput) =>
      queue.run(() => mutate(context, request, owner)),
    renewLease: (request: Draft.SessionDraftRenewLeaseRequest, owner: OwnerInput) =>
      queue.run(() => mutate(context, request, owner)),
    releaseLease: (request: Draft.SessionDraftReleaseLeaseRequest, owner: OwnerInput) =>
      queue.run(() => mutate(context, request, owner)),
    prune: (request: Draft.SessionDraftPruneRequest) => queue.run(() => mutate(context, request)),
    list: (request: Draft.SessionDraftListRequest) => queue.run(() => list(context, request)),
    selectAndClaim: (request: Draft.SessionDraftSelectAndClaimRequest, owner: OwnerInput) =>
      queue.run(() => mutate(context, request, owner))
  };
}
export type SessionDraftStore = ReturnType<typeof queuedStore>;
export type SessionDraftStoreCreationResult =
  | { ok: true; store: SessionDraftStore }
  | { ok: false; code: 'SESSION_DRAFT_STORAGE_ENUMERATION_UNAVAILABLE' };

export function createSessionDraftStore(
  area: StorageAreaService,
  options: Draft.SessionDraftStoreOptions
): SessionDraftStoreCreationResult {
  if (!isEnumerableSessionDraftStorage(area))
    return { ok: false, code: 'SESSION_DRAFT_STORAGE_ENUMERATION_UNAVAILABLE' };
  const now = options.now ?? Date.now;
  return {
    ok: true,
    store: queuedStore({
      storage: createSessionDraftStoreStorage(area, now),
      now,
      leaseId: options.createLeaseId ?? (() => globalThis.crypto.randomUUID()),
      probe: options.ownerLivenessProbe,
      retention: Draft.normalizeSessionDraftRetentionPolicy(options.retentionPolicy),
      maxEntries: Draft.boundSessionDraftLimit(options.maxEntries, Draft.SESSION_DRAFT_MAX_ENTRIES),
      maxBytes: Draft.boundSessionDraftLimit(
        options.maxEnvelopeBytes,
        Draft.SESSION_DRAFT_MAX_ENVELOPE_BYTES
      )
    })
  };
}
