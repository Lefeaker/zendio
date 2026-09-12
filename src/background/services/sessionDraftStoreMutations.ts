import { getSessionDraftLeaseDocumentId } from '../../shared/sessionDrafts/leaseDocumentIdentity';
import {
  createSessionDraftCanonicalPageFields,
  createSessionDraftStorageIdentity,
  matchesSessionDraftRecordPageIdentity,
  SESSION_DRAFT_LEASE_DURATION_MS,
  type SessionDraftLease,
  type SessionDraftStatus,
  type SessionDraftTrustedOwnerContext
} from '../../shared/sessionDrafts/keys';
import type { SessionDraftConflictCode } from '../../shared/sessionDrafts/schemas';
import {
  type SessionDraftEnvelope,
  type SessionDraftIndex,
  type SessionDraftMutationCommitPlan,
  type SessionDraftMutationReceipt,
  type SessionDraftPendingRemoval,
  type SessionDraftRecord,
  type SessionDraftRetentionPolicy,
  type SessionDraftTransitionResult
} from '../../shared/sessionDrafts/types';
import type {
  SessionDraftFinalizeExactRequest,
  SessionDraftReleaseLeaseRequest,
  SessionDraftRemoveExactRequest,
  SessionDraftRenewLeaseRequest,
  SessionDraftSaveRequest
} from '../../shared/sessionDrafts/messages';
export interface SessionDraftMutationContext {
  now: number;
  retentionMs: number;
  owner: SessionDraftTrustedOwnerContext;
  newLeaseId: string;
  documentId?: string | undefined;
}
type ExactLeaseRequest =
  | SessionDraftFinalizeExactRequest
  | SessionDraftRenewLeaseRequest
  | SessionDraftReleaseLeaseRequest;
export type SessionDraftEnvelopeMutationRequest = SessionDraftSaveRequest | ExactLeaseRequest;
export interface SessionDraftEnvelopeMutationDescriptor {
  operation: 'save' | 'finalize' | 'renew' | 'release';
  outcome: 'saved' | 'finalized' | 'renewed' | 'released';
}
export type SessionDraftStorageCommit = {
  index: SessionDraftIndex;
  envelope?: { key: string; value: SessionDraftEnvelope };
  removals?: SessionDraftPendingRemoval[];
};
export interface SessionDraftMutationCommitInput<Snapshot> {
  snapshot: Snapshot;
  digest: string;
  receipts: SessionDraftMutationReceipt[];
  plan: SessionDraftMutationCommitPlan;
  now: number;
  retention: SessionDraftRetentionPolicy;
  maxEntries: number;
}
function conflict(code: SessionDraftConflictCode): SessionDraftTransitionResult {
  return { outcome: 'conflict', code };
}
function isSessionDraftTerminalStatus(status: SessionDraftStatus): boolean {
  return status === 'discarded' || status === 'exported';
}
function isSameSessionDraftOwner(
  left: SessionDraftTrustedOwnerContext,
  right: SessionDraftTrustedOwnerContext
): boolean {
  return left.tabId === right.tabId && left.frameId === right.frameId;
}
function createSessionDraftLease(
  leaseId: string,
  owner: SessionDraftTrustedOwnerContext,
  now: number
): SessionDraftLease {
  return {
    leaseId,
    owner: { ...owner },
    renewedAt: now,
    leaseExpiresAt: now + SESSION_DRAFT_LEASE_DURATION_MS
  };
}
export function withoutLegacyOwner(record: SessionDraftRecord) {
  if (record.schemaVersion === 2) return record;
  const base = { ...record };
  delete base.legacyOwnerContext;
  return base;
}
function validateLease(
  record: SessionDraftRecord,
  expectedRevision: number,
  leaseId: string,
  owner: SessionDraftTrustedOwnerContext,
  documentId?: string
): SessionDraftConflictCode | undefined {
  if (record.revision !== expectedRevision) return 'REVISION_CONFLICT';
  if (record.schemaVersion === 1 || record.status === 'restorable' || !record.lease) {
    return 'LEASE_REQUIRED';
  }
  if (record.lease.leaseId !== leaseId) return 'LEASE_CONFLICT';
  const boundDocument = getSessionDraftLeaseDocumentId(leaseId);
  if (boundDocument && boundDocument !== documentId) return 'OWNER_CONFLICT';
  return isSameSessionDraftOwner(record.lease.owner, owner) ? undefined : 'OWNER_CONFLICT';
}

function migrateLegacySave(
  record: SessionDraftRecord,
  request: SessionDraftSaveRequest,
  context: SessionDraftMutationContext
): SessionDraftTransitionResult {
  if (request.expectedRevision !== 0) return conflict('REVISION_CONFLICT');
  if (request.leaseId !== undefined) return conflict('LEASE_CONFLICT');
  if (isSessionDraftTerminalStatus(record.status)) return conflict('TERMINAL_DRAFT');
  const legacyOwner = record.schemaVersion === 1 ? record.legacyOwnerContext : undefined;
  if (
    record.status === 'active' &&
    (legacyOwner?.tabId !== context.owner.tabId || legacyOwner.frameId !== context.owner.frameId)
  ) {
    return conflict('OWNER_CONFLICT');
  }
  return {
    outcome: 'success',
    envelope: {
      ...withoutLegacyOwner(record),
      schemaVersion: 2,
      revision: 1,
      ...createSessionDraftCanonicalPageFields(request.draft.mode, request.draft.pageUrl),
      pageTitle: request.draft.pageTitle,
      updatedAt: context.now,
      expiresAt: context.now + context.retentionMs,
      status: 'active',
      payload: request.draft.payload,
      lease: createSessionDraftLease(context.newLeaseId, context.owner, context.now)
    }
  };
}

export function saveSessionDraftTransition(
  record: SessionDraftRecord | undefined,
  request: SessionDraftSaveRequest,
  context: SessionDraftMutationContext
): SessionDraftTransitionResult {
  const identity = createSessionDraftStorageIdentity(request.draft);
  if (identity.key !== request.key) return conflict('STORAGE_KEY_MISMATCH');
  if (!record) {
    if (request.expectedRevision !== null) return conflict('DRAFT_NOT_FOUND');
    if (request.leaseId !== undefined) return conflict('LEASE_CONFLICT');
    return {
      outcome: 'success',
      envelope: {
        schemaVersion: 2,
        revision: 1,
        ...request.draft,
        ...createSessionDraftCanonicalPageFields(request.draft.mode, request.draft.pageUrl),
        createdAt: context.now,
        updatedAt: context.now,
        expiresAt: context.now + context.retentionMs,
        status: 'active',
        lease: createSessionDraftLease(context.newLeaseId, context.owner, context.now)
      }
    };
  }
  if (request.expectedRevision === null) return conflict('DRAFT_EXISTS');
  if (
    record.draftId !== request.draft.draftId ||
    !matchesSessionDraftRecordPageIdentity(record, request.draft)
  ) {
    return conflict('STORAGE_KEY_MISMATCH');
  }
  if (record.schemaVersion === 1) return migrateLegacySave(record, request, context);
  if (isSessionDraftTerminalStatus(record.status)) return conflict('TERMINAL_DRAFT');
  if (!request.leaseId) return conflict('LEASE_REQUIRED');
  const invalid = validateLease(
    record,
    request.expectedRevision,
    request.leaseId,
    context.owner,
    context.documentId
  );
  if (invalid) return conflict(invalid);
  return {
    outcome: 'success',
    envelope: {
      ...record,
      revision: record.revision + 1,
      ...createSessionDraftCanonicalPageFields(request.draft.mode, request.draft.pageUrl),
      pageTitle: request.draft.pageTitle,
      updatedAt: context.now,
      expiresAt: context.now + context.retentionMs,
      payload: request.draft.payload,
      lease: createSessionDraftLease(request.leaseId, context.owner, context.now)
    }
  };
}

export function mutateSessionDraftLeaseTransition(
  record: SessionDraftRecord | undefined,
  request: ExactLeaseRequest,
  context: Omit<SessionDraftMutationContext, 'newLeaseId'>
): SessionDraftTransitionResult {
  if (!record) return conflict('DRAFT_NOT_FOUND');
  if (isSessionDraftTerminalStatus(record.status)) return conflict('TERMINAL_DRAFT');
  const invalid = validateLease(
    record,
    request.expectedRevision,
    request.leaseId,
    context.owner,
    context.documentId
  );
  if (invalid) return conflict(invalid);
  const release = request.operation === 'releaseLease';
  const envelope: SessionDraftEnvelope = {
    ...record,
    schemaVersion: 2,
    revision: record.revision + 1,
    updatedAt: context.now,
    expiresAt: context.now + context.retentionMs,
    status: release
      ? 'restorable'
      : request.operation === 'finalizeExact'
        ? request.status
        : record.status,
    lease: createSessionDraftLease(request.leaseId, context.owner, context.now)
  };
  if (release) delete envelope.lease;
  return { outcome: 'success', envelope };
}

export function validateSessionDraftRemoveTransition(
  record: SessionDraftRecord | undefined,
  request: SessionDraftRemoveExactRequest,
  owner: SessionDraftTrustedOwnerContext,
  documentId?: string
): SessionDraftConflictCode | undefined {
  if (!record) return 'DRAFT_NOT_FOUND';
  if (record.status !== 'discarded' && record.status !== 'exported') return 'TERMINAL_REQUIRED';
  return validateLease(record, request.expectedRevision, request.leaseId, owner, documentId);
}

export function describeSessionDraftEnvelopeMutation(
  request: SessionDraftEnvelopeMutationRequest
): SessionDraftEnvelopeMutationDescriptor {
  if (request.operation === 'save') return { operation: 'save', outcome: 'saved' };
  if (request.operation === 'finalizeExact') return { operation: 'finalize', outcome: 'finalized' };
  if (request.operation === 'renewLease') return { operation: 'renew', outcome: 'renewed' };
  return { operation: 'release', outcome: 'released' };
}

export function claimSessionDraftTransition(
  record: SessionDraftRecord,
  context: SessionDraftMutationContext
): SessionDraftTransitionResult {
  if (isSessionDraftTerminalStatus(record.status)) return conflict('TERMINAL_DRAFT');
  return {
    outcome: 'success',
    envelope: {
      ...withoutLegacyOwner(record),
      schemaVersion: 2,
      revision: record.schemaVersion === 1 ? 1 : record.revision + 1,
      ...createSessionDraftCanonicalPageFields(record.mode, record.pageUrl),
      updatedAt: context.now,
      expiresAt: context.now + context.retentionMs,
      status: 'active',
      lease: createSessionDraftLease(context.newLeaseId, context.owner, context.now)
    }
  };
}
