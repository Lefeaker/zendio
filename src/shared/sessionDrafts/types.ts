export const SESSION_DRAFT_SCHEMA_VERSION = 2;
export const SESSION_DRAFT_LEGACY_SCHEMA_VERSION = 1;
export const SESSION_DRAFT_MAX_ENTRIES = 100;
export const SESSION_DRAFT_MAX_ENVELOPE_BYTES = 512 * 1024;
export const SESSION_DRAFT_MAX_INDEX_BYTES = 512 * 1024;
export const SESSION_DRAFT_MAX_QUARANTINE_BYTES = 512 * 1024;
export const SESSION_DRAFT_MAX_RECEIPTS = 128;
export const SESSION_DRAFT_RECEIPT_TTL_MS = 10 * 60 * 1000;
export const SESSION_DRAFT_MAX_PENDING_REMOVALS = 100;
export const SESSION_DRAFT_LEASE_DURATION_MS = 30 * 1000;
export const SESSION_DRAFT_LEASE_RENEWAL_INTERVAL_MS = 10 * 1000;
export type SessionDraftMode = 'reader' | 'video';
export type SessionDraftStatus = 'active' | 'restorable' | 'discarded' | 'exported';
export type SessionDraftTerminalStatus = 'discarded' | 'exported';
export type SessionDraftJsonPrimitive = string | number | boolean | null;
export type SessionDraftJsonValue =
  | SessionDraftJsonPrimitive
  | SessionDraftJsonValue[]
  | { [key: string]: SessionDraftJsonValue };
export type SessionDraftPayload = Record<string, SessionDraftJsonValue>;
export interface SessionDraftRetentionPolicy {
  retentionMs: number;
  maxRestorablePages: number | null;
  maxItemsPerPage: number | null;
}

export interface SessionDraftTrustedOwnerContext {
  tabId: number;
  frameId: number;
  windowId?: number | undefined;
}
export interface SessionDraftLegacyOwnerContext {
  tabId?: number | undefined;
  frameId?: number | undefined;
  windowId?: number | undefined;
}

export interface SessionDraftLease {
  leaseId: string;
  owner: SessionDraftTrustedOwnerContext;
  renewedAt: number;
  leaseExpiresAt: number;
}
interface SessionDraftRecordBase {
  draftId: string;
  mode: SessionDraftMode;
  pageKey: string;
  pageUrl: string;
  pageTitle: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  status: SessionDraftStatus;
  payload: SessionDraftPayload;
}
export interface SessionDraftLegacyRecord extends SessionDraftRecordBase {
  schemaVersion: typeof SESSION_DRAFT_LEGACY_SCHEMA_VERSION;
  revision: 0;
  legacyOwnerContext?: SessionDraftLegacyOwnerContext | undefined;
}
export interface SessionDraftEnvelope extends SessionDraftRecordBase {
  schemaVersion: typeof SESSION_DRAFT_SCHEMA_VERSION;
  revision: number;
  lease?: SessionDraftLease | undefined;
}
export type SessionDraftRecord = SessionDraftLegacyRecord | SessionDraftEnvelope;

export interface SessionDraftIndexEntry {
  key: string;
  draftId: string;
  mode: SessionDraftMode;
  pageKey: string;
  recordSchemaVersion:
    | typeof SESSION_DRAFT_LEGACY_SCHEMA_VERSION
    | typeof SESSION_DRAFT_SCHEMA_VERSION;
  revision: number;
  updatedAt: number;
  expiresAt: number;
  status: SessionDraftStatus;
}

export type SessionDraftMutationOperation =
  | 'save'
  | 'finalize'
  | 'remove'
  | 'claim'
  | 'renew'
  | 'release'
  | 'prune';
export type SessionDraftMutationSuccessOutcome =
  | 'saved'
  | 'finalized'
  | 'removed'
  | 'claimed'
  | 'renewed'
  | 'released'
  | 'pruned';
export type SessionDraftMutationOutcome =
  | SessionDraftMutationSuccessOutcome
  | 'none'
  | 'invalid_removed';
export type SessionDraftSelectionReason =
  | 'restorable'
  | 'expired_owner_inactive'
  | 'legacy_owner_inactive';
export interface SessionDraftCommitMetadata {
  operation: SessionDraftMutationOperation;
  key: string;
  outcome: SessionDraftMutationOutcome;
  revision?: number | undefined;
  removedCount?: number | undefined;
  selectionReason?: SessionDraftSelectionReason | undefined;
  invalidRemovedCount?: number | undefined;
}
export interface SessionDraftMutationReceipt extends SessionDraftCommitMetadata {
  requestId: string;
  digest: string;
  resultDigest?: string | undefined;
  timestamp: number;
}
export interface SessionDraftPendingRemoval extends SessionDraftMutationReceipt {
  receiptKey: string;
}
export interface SessionDraftRemovalTombstone extends SessionDraftPendingRemoval {
  schemaVersion: typeof SESSION_DRAFT_SCHEMA_VERSION;
  kind: 'session-draft-removal-tombstone';
}
export interface SessionDraftIndex {
  schemaVersion: typeof SESSION_DRAFT_SCHEMA_VERSION;
  entries: SessionDraftIndexEntry[];
  receipts: SessionDraftMutationReceipt[];
  pendingRemovals: SessionDraftPendingRemoval[];
}
export type SessionDraftReceiptInput = Omit<SessionDraftMutationReceipt, 'digest' | 'timestamp'>;
export interface SessionDraftMutationCommitPlan {
  receipt: SessionDraftReceiptInput;
  entries?: SessionDraftIndexEntry[] | undefined;
  envelope?: SessionDraftEnvelope | undefined;
  removedKeys?: string[] | undefined;
  keepReceipt?: boolean | undefined;
  applyRetention?: boolean | undefined;
}
export type SessionDraftCommitPreparation =
  | { outcome: 'prepared'; plan: SessionDraftMutationCommitPlan }
  | { outcome: 'conflict'; code: SessionDraftConflictCode };
export type SessionDraftTransitionResult =
  | { outcome: 'success'; envelope: SessionDraftEnvelope }
  | { outcome: 'conflict'; code: SessionDraftConflictCode };

export interface SessionDraftIndexQuarantine {
  capturedAt: number;
  byteLength: number;
  truncated: boolean;
  value?: SessionDraftJsonValue | undefined;
}

export type SessionDraftConflictCode =
  | 'OWNER_CONTEXT_INVALID'
  | 'SESSION_DRAFT_STORAGE_ENUMERATION_UNAVAILABLE'
  | 'REQUEST_ID_REUSE'
  | 'INDEX_RECOVERY_FAILED'
  | 'STORAGE_FAILURE'
  | 'STORAGE_KEY_MISMATCH'
  | 'DRAFT_EXISTS'
  | 'DRAFT_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'LEASE_REQUIRED'
  | 'LEASE_CONFLICT'
  | 'OWNER_CONFLICT'
  | 'OWNER_ACTIVE'
  | 'OWNER_LIVENESS_UNAVAILABLE'
  | 'TERMINAL_DRAFT'
  | 'TERMINAL_REQUIRED'
  | 'REMOVAL_PENDING'
  | 'PAYLOAD_INVALID'
  | 'PAYLOAD_TOO_LARGE'
  | 'CAPACITY_EXCEEDED'
  | 'RECORD_CHANGED';

export type SessionDraftOwnerLivenessTarget =
  | {
      kind: 'leased-v2';
      key: string;
      leaseId: string;
      owner: SessionDraftTrustedOwnerContext;
    }
  | { kind: 'legacy-v1'; key: string; owner: SessionDraftTrustedOwnerContext };
export type SessionDraftOwnerLivenessProbe = (
  target: SessionDraftOwnerLivenessTarget
) => Promise<'active' | 'inactive'>;

export interface SessionDraftStoreOptions {
  ownerLivenessProbe: SessionDraftOwnerLivenessProbe;
  now?: (() => number) | undefined;
  createLeaseId?: (() => string) | undefined;
  retentionPolicy?: Partial<SessionDraftRetentionPolicy> | undefined;
  maxEntries?: number | undefined;
  maxEnvelopeBytes?: number | undefined;
}

export interface SessionDraftReceiptReplay {
  replayed: true;
  commit: SessionDraftCommitMetadata;
  requiresReadExact: boolean;
}
type SessionDraftReplayWithoutReadFlag = Omit<SessionDraftReceiptReplay, 'requiresReadExact'>;
export type SessionDraftFormattedReceiptReplay =
  | {
      replay: SessionDraftReplayWithoutReadFlag & { requiresReadExact: false };
      envelope: SessionDraftEnvelope;
    }
  | { replay: SessionDraftReplayWithoutReadFlag & { requiresReadExact: true } };
