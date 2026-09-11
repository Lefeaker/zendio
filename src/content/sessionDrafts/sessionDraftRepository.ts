import type { RuntimeMessageSender } from '../../platform/interfaces/runtime';
import type { StorageAreaService } from '../../platform/interfaces/storage';
import { isMessageListenerFailureMarker } from '../../platform/shared/messageListenerInvocation';
import * as Draft from '../../shared/sessionDrafts';
import { getSessionDraftRuntimeMessenger } from './sessionDraftTabContext';
import { createSessionDraftClientState } from './sessionDraftClientState';
import { reportExtensionContextInvalidated } from '../../platform/shared/extensionContext';

type LegacySessionDraftEnvelope = Draft.SessionDraftClientEnvelope;
type LegacySessionDraftMode = Draft.SessionDraftMode;
type SessionDraftRemovalTarget = string | { key: string };
interface LegacySessionDraftRepository {
  loadLatest(
    mode: LegacySessionDraftMode,
    pageUrl: string,
    legacyPageKey?: string,
    options?: { ownerContext?: Draft.SessionDraftOwnerContext | null }
  ): Promise<LegacySessionDraftEnvelope | null>;
  save<TEnvelope extends LegacySessionDraftEnvelope>(
    envelope: TEnvelope,
    options?: { requestId?: string; ownerContext?: Draft.SessionDraftOwnerContext | null }
  ): Promise<Draft.SessionDraftEnvelope>;
  remove(target: SessionDraftRemovalTarget): Promise<void>;
  listCandidates(
    mode: LegacySessionDraftMode,
    pageUrl: string,
    legacyPageKey?: string,
    options?: { ownerContext?: Draft.SessionDraftOwnerContext | null }
  ): Promise<LegacySessionDraftEnvelope[]>;
  pruneExpired(): Promise<void>;
}

type AnyResult =
  | Draft.SessionDraftReadExactResult
  | Draft.SessionDraftListResult
  | Draft.SessionDraftEnvelopeMutationResult
  | Draft.SessionDraftRemoveResult
  | Draft.SessionDraftPruneResult
  | Draft.SessionDraftSelectAndClaimResult;
type EnvelopeMutationRequest =
  | Draft.SessionDraftSaveRequest
  | Draft.SessionDraftFinalizeExactRequest
  | Draft.SessionDraftRenewLeaseRequest
  | Draft.SessionDraftReleaseLeaseRequest
  | Draft.SessionDraftMigrateLegacyVideoCaptureRequest;
export type SessionDraftLeaseRepository = Pick<
  SessionDraftMessageRepository,
  'renewLease' | 'releaseLease'
>;

interface LegacyRepositoryOptions {
  retentionPolicy?: Draft.SessionDraftRetentionPolicy | undefined;
}

interface PendingCompositeSave {
  request: Draft.SessionDraftSaveRequest;
  terminalStatus: Draft.SessionDraftStatus;
  releaseLeaseRequest?: Draft.SessionDraftReleaseLeaseRequest;
  finalizeExactRequest?: Draft.SessionDraftFinalizeExactRequest;
}

export interface SessionDraftMessageRepository extends LegacySessionDraftRepository {
  adoptClaimed(envelope: Draft.SessionDraftEnvelope): void;
  readExact(
    request: Draft.SessionDraftReadExactRequest
  ): Promise<Draft.SessionDraftReadExactResult>;
  saveExact(
    request: Draft.SessionDraftSaveRequest
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  finalizeExact(
    request: Draft.SessionDraftFinalizeExactRequest
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  removeExact(
    request: Draft.SessionDraftRemoveExactRequest
  ): Promise<Draft.SessionDraftRemoveResult>;
  renewLease(
    request: Draft.SessionDraftRenewLeaseRequest
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  releaseLease(
    request: Draft.SessionDraftReleaseLeaseRequest
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  migrateLegacyVideoCapture(
    request: Draft.SessionDraftMigrateLegacyVideoCaptureRequest
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  prune(request: Draft.SessionDraftPruneRequest): Promise<Draft.SessionDraftPruneResult>;
  list(request: Draft.SessionDraftListRequest): Promise<Draft.SessionDraftListResult>;
  selectAndClaim(
    request: Draft.SessionDraftSelectAndClaimRequest
  ): Promise<Draft.SessionDraftSelectAndClaimResult>;
}

function requestId(operation: string): string {
  const suffix =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${operation}-${suffix}`;
}

function compositeRequestId(operation: 'release' | 'finalize', primary: string) {
  const digestKey = Draft.createSessionDraftPageKey(
    'reader',
    `https://request-id.invalid/${encodeURIComponent(primary)}`
  );
  return `${operation}-${digestKey}`;
}

function resultSchema(request: Draft.SessionDraftRequest) {
  if (request.operation === 'readExact') return Draft.SessionDraftReadExactResultSchema;
  if (request.operation === 'list') return Draft.SessionDraftListResultSchema;
  if (request.operation === 'removeExact') return Draft.SessionDraftRemoveResultSchema;
  if (request.operation === 'prune') return Draft.SessionDraftPruneResultSchema;
  if (request.operation === 'selectAndClaim') return Draft.SessionDraftSelectAndClaimResultSchema;
  return Draft.SessionDraftEnvelopeMutationResultSchema;
}

function exactKey(envelope: LegacySessionDraftEnvelope): string {
  return Draft.createSessionDraftStorageKey({
    mode: envelope.mode,
    pageKey: Draft.createSessionDraftPageKey(envelope.mode, envelope.pageUrl),
    draftId: envelope.draftId
  });
}

function asLegacyEnvelope(envelope: Draft.SessionDraftRecord): LegacySessionDraftEnvelope {
  return envelope as unknown as LegacySessionDraftEnvelope;
}

function conflictError(result: { outcome: string; code?: string }): Error {
  return new Error(result.code ?? `SESSION_DRAFT_${result.outcome.toUpperCase()}`);
}

export function createSessionDraftRepository(
  senderInput?: RuntimeMessageSender | StorageAreaService,
  _legacyOptions?: LegacyRepositoryOptions
): SessionDraftMessageRepository {
  const sender =
    typeof senderInput === 'function' ? senderInput : getSessionDraftRuntimeMessenger();
  if (!sender) throw new Error('SESSION_DRAFT_RUNTIME_MESSENGER_UNAVAILABLE');
  const sendMessage: RuntimeMessageSender = async <Result>(
    message: Parameters<RuntimeMessageSender>[0]
  ) => {
    try {
      return await sender<Result>(message);
    } catch (error) {
      reportExtensionContextInvalidated(error);
      throw error;
    }
  };

  const current = createSessionDraftClientState();
  const pendingCompositeSaves = new Map<string, PendingCompositeSave>();
  const pendingCompositeSaveIdsByKey = new Map<string, string>();

  function clearPendingCompositeSave(requestIdValue: string, key: string): void {
    pendingCompositeSaves.delete(requestIdValue);
    if (pendingCompositeSaveIdsByKey.get(key) === requestIdValue) {
      pendingCompositeSaveIdsByKey.delete(key);
    }
  }

  function send(
    request: Draft.SessionDraftReadExactRequest
  ): Promise<Draft.SessionDraftReadExactResult>;
  function send(request: Draft.SessionDraftListRequest): Promise<Draft.SessionDraftListResult>;
  function send(
    request: Draft.SessionDraftRemoveExactRequest
  ): Promise<Draft.SessionDraftRemoveResult>;
  function send(request: Draft.SessionDraftPruneRequest): Promise<Draft.SessionDraftPruneResult>;
  function send(
    request: Draft.SessionDraftSelectAndClaimRequest
  ): Promise<Draft.SessionDraftSelectAndClaimResult>;
  function send(
    request: EnvelopeMutationRequest
  ): Promise<Draft.SessionDraftEnvelopeMutationResult>;
  async function send(request: Draft.SessionDraftRequest): Promise<AnyResult> {
    const raw = await sendMessage({ type: Draft.SESSION_DRAFT_RUNTIME_MESSAGE_TYPE, request });
    if (isMessageListenerFailureMarker(raw)) {
      throw new Error('SESSION_DRAFT_TRANSPORT_REJECTED');
    }
    const parsed = resultSchema(request).safeParse(raw);
    if (!parsed.success) throw new Error('SESSION_DRAFT_RESPONSE_INVALID');
    return parsed.data;
  }

  function remember(result: AnyResult): void {
    if ('envelope' in result && result.envelope && result.envelope.schemaVersion === 2) {
      current.set(exactKey(asLegacyEnvelope(result.envelope)), result.envelope);
    }
  }

  async function readExact(
    request: Draft.SessionDraftReadExactRequest
  ): Promise<Draft.SessionDraftReadExactResult> {
    const result = await send(request);
    if (result.outcome === 'found' && result.envelope.schemaVersion === 2) {
      current.set(request.key, result.envelope);
    }
    return result;
  }

  async function envelopeMutation(
    request: EnvelopeMutationRequest
  ): Promise<Draft.SessionDraftEnvelopeMutationResult> {
    const result = await send(request);
    remember(result);
    if (result.outcome === 'released' || result.outcome === 'finalized') {
      if (result.envelope) current.set(request.key, result.envelope);
    }
    return result;
  }

  const exactClient = {
    readExact,
    saveExact: (request: Draft.SessionDraftSaveRequest) => envelopeMutation(request),
    finalizeExact: (request: Draft.SessionDraftFinalizeExactRequest) => envelopeMutation(request),
    removeExact: async (request: Draft.SessionDraftRemoveExactRequest) => {
      const result = await send(request);
      if (result.outcome === 'removed') current.delete(request.key);
      return result;
    },
    renewLease: (request: Draft.SessionDraftRenewLeaseRequest) =>
      current.trackLease(request.key, envelopeMutation(request)),
    releaseLease: (request: Draft.SessionDraftReleaseLeaseRequest) =>
      current.trackLease(request.key, envelopeMutation(request)),
    migrateLegacyVideoCapture: (request: Draft.SessionDraftMigrateLegacyVideoCaptureRequest) =>
      envelopeMutation(request),
    prune: (request: Draft.SessionDraftPruneRequest) => send(request),
    list: (request: Draft.SessionDraftListRequest) => send(request),
    selectAndClaim: (request: Draft.SessionDraftSelectAndClaimRequest) =>
      send(request).then((result) => {
        remember(result);
        return result;
      })
  };

  return {
    ...exactClient,
    adoptClaimed(envelope) {
      current.set(exactKey(asLegacyEnvelope(envelope)), envelope);
    },
    async loadLatest(
      mode: LegacySessionDraftMode,
      pageUrl: string,
      _legacyPageKey?: string,
      _options?: { ownerContext?: Draft.SessionDraftOwnerContext | null }
    ) {
      const result = await exactClient.selectAndClaim({
        operation: 'selectAndClaim',
        requestId: requestId('claim'),
        mode,
        pageUrl
      });
      if (result.outcome === 'none' || result.outcome === 'invalid_removed') {
        const listed = await exactClient.list({ operation: 'list', mode, pageUrl });
        if (listed.outcome !== 'listed') throw conflictError(listed);
        const candidate = listed.envelopes[0];
        return candidate ? asLegacyEnvelope(candidate) : null;
      }
      if (result.outcome !== 'claimed' || !result.envelope) throw conflictError(result);
      return asLegacyEnvelope(result.envelope);
    },
    async listCandidates(
      mode: LegacySessionDraftMode,
      pageUrl: string,
      _legacyPageKey?: string,
      _options?: { ownerContext?: Draft.SessionDraftOwnerContext | null }
    ) {
      const result = await exactClient.list({ operation: 'list', mode, pageUrl });
      if (result.outcome !== 'listed') throw conflictError(result);
      return result.envelopes.map(asLegacyEnvelope);
    },
    async save<TEnvelope extends LegacySessionDraftEnvelope>(
      envelope: TEnvelope,
      options?: { requestId?: string; ownerContext?: Draft.SessionDraftOwnerContext | null }
    ) {
      const key = exactKey(envelope);
      if (await current.settleLeases(key)) await readExact({ operation: 'readExact', key });
      const primaryRequestId =
        options?.requestId ?? pendingCompositeSaveIdsByKey.get(key) ?? requestId('save');
      let pending = pendingCompositeSaves.get(primaryRequestId);
      if (!pending) {
        const known = current.get(key);
        pending = {
          request: {
            operation: 'save',
            requestId: primaryRequestId,
            key,
            expectedRevision: known?.revision ?? null,
            ...(known?.lease ? { leaseId: known.lease.leaseId } : {}),
            draft: {
              draftId: envelope.draftId,
              mode: envelope.mode,
              pageUrl: envelope.pageUrl,
              pageTitle: envelope.pageTitle,
              payload: envelope.payload as Draft.SessionDraftPayload
            }
          },
          terminalStatus: envelope.status
        };
        pendingCompositeSaves.set(primaryRequestId, pending);
        pendingCompositeSaveIdsByKey.set(key, primaryRequestId);
      }
      const compositeKey = pending.request.key;
      const result = await exactClient.saveExact(pending.request);
      if (result.outcome !== 'saved' || !result.envelope) {
        clearPendingCompositeSave(primaryRequestId, compositeKey);
        throw conflictError(result);
      }
      let persisted = result.envelope;
      if (pending.terminalStatus === 'restorable') {
        pending.releaseLeaseRequest ??= {
          operation: 'releaseLease',
          requestId: compositeRequestId('release', primaryRequestId),
          key: compositeKey,
          expectedRevision: persisted.revision,
          leaseId: persisted.lease?.leaseId ?? ''
        };
        const released = await exactClient.releaseLease(pending.releaseLeaseRequest);
        if (released.outcome !== 'released' || !released.envelope) {
          clearPendingCompositeSave(primaryRequestId, compositeKey);
          throw conflictError(released);
        }
        persisted = released.envelope;
      } else if (pending.terminalStatus === 'discarded' || pending.terminalStatus === 'exported') {
        pending.finalizeExactRequest ??= {
          operation: 'finalizeExact',
          requestId: compositeRequestId('finalize', primaryRequestId),
          key: compositeKey,
          expectedRevision: persisted.revision,
          leaseId: persisted.lease?.leaseId ?? '',
          status: pending.terminalStatus
        };
        const finalized = await exactClient.finalizeExact(pending.finalizeExactRequest);
        if (finalized.outcome !== 'finalized' || !finalized.envelope) {
          clearPendingCompositeSave(primaryRequestId, compositeKey);
          throw conflictError(finalized);
        }
        persisted = finalized.envelope;
      }
      clearPendingCompositeSave(primaryRequestId, compositeKey);
      current.set(compositeKey, persisted);
      return persisted;
    },
    async remove(target: SessionDraftRemovalTarget) {
      const key = typeof target === 'object' ? target.key : target;
      const read = await readExact({ operation: 'readExact', key });
      if (read.outcome !== 'found' || read.envelope.schemaVersion !== 2) {
        current.delete(key);
        return;
      }
      const found = read.envelope;
      let terminal = found;
      if (terminal.status !== 'discarded' && terminal.status !== 'exported') {
        if (!terminal.lease) throw new Error('LEASE_REQUIRED');
        const finalized = await exactClient.finalizeExact({
          operation: 'finalizeExact',
          requestId: requestId('finalize-remove'),
          key,
          expectedRevision: terminal.revision,
          leaseId: terminal.lease.leaseId,
          status: 'discarded'
        });
        if (finalized.outcome !== 'finalized' || !finalized.envelope) {
          throw conflictError(finalized);
        }
        terminal = finalized.envelope;
      }
      if (!terminal.lease) throw new Error('LEASE_REQUIRED');
      const removed = await exactClient.removeExact({
        operation: 'removeExact',
        requestId: requestId('remove'),
        key,
        expectedRevision: terminal.revision,
        leaseId: terminal.lease.leaseId
      });
      if (removed.outcome !== 'removed') throw conflictError(removed);
      current.delete(key);
    },
    async pruneExpired() {
      const result = await exactClient.prune({ operation: 'prune', requestId: requestId('prune') });
      if (result.outcome !== 'pruned') throw conflictError(result);
    }
  };
}
