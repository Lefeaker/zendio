import {
  createSessionDraftCanonicalPageFields,
  createSessionDraftStorageIdentity,
  matchesSessionDraftRecordPageIdentity
} from '../../shared/sessionDrafts/keys';
import type {
  SessionDraftFinalizeExactRequest,
  SessionDraftReleaseLeaseRequest,
  SessionDraftRemoveExactRequest,
  SessionDraftRenewLeaseRequest,
  SessionDraftSaveRequest
} from '../../shared/sessionDrafts/messages';
import { measureSessionDraftValueBytes } from '../../shared/sessionDrafts/retentionPolicy';
import { SessionDraftEnvelopeSchema } from '../../shared/sessionDrafts/schemas';
import {
  SESSION_DRAFT_LEASE_DURATION_MS,
  type SessionDraftConflictCode,
  type SessionDraftEnvelope,
  type SessionDraftLease,
  type SessionDraftRecord,
  type SessionDraftStatus,
  type SessionDraftTransitionResult,
  type SessionDraftTrustedOwnerContext
} from '../../shared/sessionDrafts/types';

export interface SessionDraftMutationContext {
  now: number;
  retentionMs: number;
  owner: SessionDraftTrustedOwnerContext;
  newLeaseId: string;
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
  owner: SessionDraftTrustedOwnerContext
): SessionDraftConflictCode | undefined {
  if (record.revision !== expectedRevision) return 'REVISION_CONFLICT';
  if (record.schemaVersion === 1 || record.status === 'restorable' || !record.lease) {
    return 'LEASE_REQUIRED';
  }
  if (record.lease.leaseId !== leaseId) return 'LEASE_CONFLICT';
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
  const invalid = validateLease(record, request.expectedRevision, request.leaseId, context.owner);
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
  const invalid = validateLease(record, request.expectedRevision, request.leaseId, context.owner);
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
  owner: SessionDraftTrustedOwnerContext
): SessionDraftConflictCode | undefined {
  if (!record) return 'DRAFT_NOT_FOUND';
  if (record.status !== 'discarded' && record.status !== 'exported') return 'TERMINAL_REQUIRED';
  return validateLease(record, request.expectedRevision, request.leaseId, owner);
}

export function describeSessionDraftEnvelopeMutation(
  request: SessionDraftEnvelopeMutationRequest
): SessionDraftEnvelopeMutationDescriptor {
  if (request.operation === 'save') return { operation: 'save', outcome: 'saved' };
  if (request.operation === 'finalizeExact') return { operation: 'finalize', outcome: 'finalized' };
  if (request.operation === 'renewLease') return { operation: 'renew', outcome: 'renewed' };
  return { operation: 'release', outcome: 'released' };
}

export function validateSessionDraftEnvelope(
  envelope: SessionDraftEnvelope,
  maxBytes: number
): SessionDraftTransitionResult {
  const parsed = SessionDraftEnvelopeSchema.safeParse(envelope);
  const tooLarge =
    parsed.success ||
    parsed.error.issues.some((issue) => issue.message === 'SESSION_DRAFT_PAYLOAD_TOO_LARGE');
  if (!parsed.success) return conflict(tooLarge ? 'PAYLOAD_TOO_LARGE' : 'STORAGE_FAILURE');
  if (measureSessionDraftValueBytes(parsed.data) > maxBytes) return conflict('PAYLOAD_TOO_LARGE');
  return { outcome: 'success', envelope: parsed.data };
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
