import type { MessageSenderInfo } from '../../platform/interfaces/messaging';
import * as Draft from '../../shared/sessionDrafts';
import {
  beginSessionDraftMutation,
  createSessionDraftValueDigest,
  formatSessionDraftReceiptReplay
} from '../services/sessionDraftStoreReceipts';
import { commitSessionDraftLegacyMigration } from '../services/sessionDraftStoreSelection';
import { retrySessionDraftLegacyCleanup } from '../services/sessionDraftOwnerLivenessProbe';
import type {
  SessionDraftStorageSnapshot,
  SessionDraftStoreStorage
} from '../services/sessionDraftStoreStorage';
import type { SessionDraftTransactionContext } from '../services/sessionDraftOwnerLivenessProbe';
type SessionDraftStoreTransactionContext = SessionDraftTransactionContext<SessionDraftStoreStorage>;
export type SessionDraftMessageResult =
  | Draft.SessionDraftReadExactResult
  | Draft.SessionDraftListResult
  | Draft.SessionDraftEnvelopeMutationResult
  | Draft.SessionDraftRemoveResult
  | Draft.SessionDraftPruneResult
  | Draft.SessionDraftSelectAndClaimResult;
export interface SessionDraftMessageStore {
  readExact(
    request: Draft.SessionDraftReadExactRequest
  ): Promise<Draft.SessionDraftReadExactResult>;
  save(
    request: Draft.SessionDraftSaveRequest,
    owner: Draft.SessionDraftTrustedOwnerContext
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  finalizeExact(
    request: Draft.SessionDraftFinalizeExactRequest,
    owner: Draft.SessionDraftTrustedOwnerContext
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  removeExact(
    request: Draft.SessionDraftRemoveExactRequest,
    owner: Draft.SessionDraftTrustedOwnerContext
  ): Promise<Draft.SessionDraftRemoveResult>;
  renewLease(
    request: Draft.SessionDraftRenewLeaseRequest,
    owner: Draft.SessionDraftTrustedOwnerContext
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  releaseLease(
    request: Draft.SessionDraftReleaseLeaseRequest,
    owner: Draft.SessionDraftTrustedOwnerContext
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  migrateLegacyVideoCapture(
    request: Draft.SessionDraftMigrateLegacyVideoCaptureRequest,
    owner: Draft.SessionDraftTrustedOwnerContext,
    senderUrl: string | undefined
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  prune(request: Draft.SessionDraftPruneRequest): Promise<Draft.SessionDraftPruneResult>;
  list(request: Draft.SessionDraftListRequest): Promise<Draft.SessionDraftListResult>;
  selectAndClaim(
    request: Draft.SessionDraftSelectAndClaimRequest,
    owner: Draft.SessionDraftTrustedOwnerContext
  ): Promise<Draft.SessionDraftSelectAndClaimResult>;
}
export interface SessionDraftRuntimeDependencies {
  sessionDraftStore: SessionDraftMessageStore;
  resolveSessionDraftOwner(
    sender: MessageSenderInfo
  ): Promise<Draft.SessionDraftTrustedOwnerContext | null>;
}
const mutationOperationByRequest = {
  save: 'save',
  finalizeExact: 'finalize',
  renewLease: 'renew',
  releaseLease: 'release'
} as const;
export function sessionDraftMutationIdentity(
  request:
    | Draft.SessionDraftSaveRequest
    | Draft.SessionDraftFinalizeExactRequest
    | Draft.SessionDraftRenewLeaseRequest
    | Draft.SessionDraftReleaseLeaseRequest
    | Draft.SessionDraftRemoveExactRequest
    | Draft.SessionDraftPruneRequest
    | Draft.SessionDraftSelectAndClaimRequest
): { operation: Draft.SessionDraftMutationOperation; key?: string } {
  if (request.operation === 'removeExact') return { operation: 'remove', key: request.key };
  if (request.operation === 'prune')
    return { operation: 'prune', key: Draft.SESSION_DRAFT_INDEX_KEY };
  if (request.operation === 'selectAndClaim') return { operation: 'claim' };
  return { operation: mutationOperationByRequest[request.operation], key: request.key };
}
function migrationConflict(
  code: Draft.SessionDraftConflictCode
): Draft.SessionDraftEnvelopeMutationResult {
  return { outcome: 'conflict', code };
}
function snapshotRecord(snapshot: SessionDraftStorageSnapshot, key: string) {
  return snapshot.records.find((item) => item.key === key)?.record;
}
export async function migrateLegacyVideoCapture(
  context: SessionDraftStoreTransactionContext,
  request: Draft.SessionDraftMigrateLegacyVideoCaptureRequest,
  ownerInput: object | null | undefined,
  senderUrl: string | undefined
): Promise<Draft.SessionDraftEnvelopeMutationResult> {
  const owner = Draft.SessionDraftTrustedOwnerContextSchema.safeParse(ownerInput);
  const legacyIdentity = Draft.parseLegacyVideoCaptureIdentity(senderUrl);
  if (!owner.success) return migrationConflict('OWNER_CONTEXT_INVALID');
  if (
    !legacyIdentity ||
    legacyIdentity.storageKey !== request.legacyKey ||
    request.draft.mode !== 'video' ||
    request.draft.pageUrl !== senderUrl ||
    Draft.createSessionDraftStorageIdentity(request.draft).key !== request.key
  )
    return migrationConflict('MIGRATION_INPUT_INVALID');
  const canonical = Draft.decodeLegacyVideoCapture(
    Draft.normalizeSessionDraftStoredValue(request.canonicalLegacy)
  );
  if (!canonical.ok || canonical.value.entries.length === 0)
    return migrationConflict('MIGRATION_INPUT_INVALID');
  if (
    (await Draft.digestLegacyVideoCaptureJson(canonical.canonicalJson)) !== request.canonicalDigest
  )
    return migrationConflict('MIGRATION_INPUT_INVALID');
  const payload = request.draft.payload as Record<string, unknown>;
  if (
    (await createSessionDraftValueDigest({ captures: canonical.value.entries })) !==
    (await createSessionDraftValueDigest({ captures: payload.captures }))
  )
    return migrationConflict('MIGRATION_INPUT_INVALID');
  const loaded = await context.storage.load();
  if (!loaded.ok) return { outcome: 'recovery_failed', code: loaded.code };
  const cleanup = await retrySessionDraftLegacyCleanup(context, loaded.snapshot);
  if (cleanup.blocked) return migrationConflict('MIGRATION_CLEANUP_PENDING');
  const snapshot = cleanup.snapshot;
  const started = await beginSessionDraftMutation({
    request,
    operation: 'migrate',
    exactKey: request.key,
    receipts: snapshot.index.receipts,
    now: context.now(),
    owner: owner.data
  });
  if (started.kind === 'reuse') return migrationConflict('REQUEST_ID_REUSE');
  if (started.kind === 'replay') {
    const current = snapshotRecord(snapshot, request.key);
    const replayed = await formatSessionDraftReceiptReplay(
      started.receipt,
      current?.schemaVersion === 2 ? { key: request.key, envelope: current } : undefined
    );
    return started.receipt.outcome === 'migrated' && started.receipt.revision !== undefined
      ? { outcome: 'migrated', revision: started.receipt.revision, ...replayed }
      : migrationConflict('STORAGE_FAILURE');
  }

  const recovered = snapshot.index.receipts.find(
    (receipt) =>
      receipt.operation === 'migrate' &&
      receipt.outcome === 'migrated' &&
      receipt.key === request.key &&
      receipt.digest === started.digest &&
      receipt.revision !== undefined
  );
  if (recovered?.revision !== undefined) {
    const current = snapshotRecord(snapshot, request.key);
    return {
      outcome: 'migrated',
      revision: recovered.revision,
      ...(await formatSessionDraftReceiptReplay(
        recovered,
        current?.schemaVersion === 2 ? { key: request.key, envelope: current } : undefined
      ))
    };
  }

  const raw = await context.storage.readLegacyValue(request.legacyKey);
  if (raw !== undefined) {
    const decoded = Draft.decodeLegacyVideoCapture(raw);
    if (!decoded.ok || decoded.value.entries.length === 0)
      return migrationConflict('MIGRATION_INPUT_INVALID');
    const [rawDigest, canonicalDigest] = await Promise.all([
      Draft.digestLegacyVideoCaptureJson(decoded.rawCanonicalJson),
      Draft.digestLegacyVideoCaptureJson(decoded.canonicalJson)
    ]);
    if (
      rawDigest !== request.rawDigest ||
      canonicalDigest !== request.canonicalDigest ||
      decoded.canonicalJson !== canonical.canonicalJson
    )
      return migrationConflict('MIGRATION_SOURCE_CHANGED');
  }
  return commitSessionDraftLegacyMigration(context, {
    request,
    owner: owner.data,
    snapshot,
    digest: started.digest,
    receipts: started.receipts,
    expectedPayloadDigest: await createSessionDraftValueDigest(request.draft.payload),
    rawExists: raw !== undefined
  });
}

export function trustedSessionDraftOwner(
  sender: MessageSenderInfo
): Draft.SessionDraftTrustedOwnerContext | null {
  const parsed = Draft.SessionDraftTrustedOwnerContextSchema.safeParse({
    tabId: sender.tabId,
    frameId: sender.frameId,
    ...(sender.windowId === undefined ? {} : { windowId: sender.windowId })
  });
  return parsed.success ? parsed.data : null;
}

export function isSessionDraftMessageCandidate(value: Draft.SessionDraftStoredValue): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === Draft.SESSION_DRAFT_RUNTIME_MESSAGE_TYPE
  );
}

export async function handleSessionDraftMessage(
  store: SessionDraftMessageStore,
  rawMessage: Draft.SessionDraftStoredValue,
  sender: MessageSenderInfo,
  resolveOwner: (
    sender: MessageSenderInfo
  ) => Promise<Draft.SessionDraftTrustedOwnerContext | null> = (value) =>
    Promise.resolve(trustedSessionDraftOwner(value))
): Promise<SessionDraftMessageResult | undefined> {
  if (!isSessionDraftMessageCandidate(rawMessage)) return undefined;

  const parsed = Draft.SessionDraftRuntimeMessageSchema.safeParse(rawMessage);
  if (!parsed.success) throw new Error('SESSION_DRAFT_REQUEST_INVALID');
  const request = parsed.data.request;

  if (request.operation === 'readExact') return store.readExact(request);
  if (request.operation === 'list') return store.list(request);
  if (request.operation === 'prune') return store.prune(request);

  const owner = await resolveOwner(sender);
  if (!owner) return { outcome: 'conflict', code: 'OWNER_CONTEXT_INVALID' };
  if (request.operation === 'save') return store.save(request, owner);
  if (request.operation === 'finalizeExact') return store.finalizeExact(request, owner);
  if (request.operation === 'removeExact') return store.removeExact(request, owner);
  if (request.operation === 'renewLease') return store.renewLease(request, owner);
  if (request.operation === 'releaseLease') return store.releaseLease(request, owner);
  if (request.operation === 'migrateLegacyVideoCapture') {
    return store.migrateLegacyVideoCapture(request, owner, sender.url);
  }
  return store.selectAndClaim(request, owner);
}
