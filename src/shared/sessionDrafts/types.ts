import type { ExportDestinationMetadata } from '../exportDestination';
import type {
  SessionDraftLease,
  SessionDraftLegacyCleanupObligation,
  SessionDraftLegacyOwnerContext,
  SessionDraftMode,
  SessionDraftOwnerContext,
  SessionDraftOwnerLivenessProbe,
  SessionDraftStatus
} from './pageIdentity';
export const SESSION_DRAFT_SCHEMA_VERSION = 2;
export const SESSION_DRAFT_LEGACY_SCHEMA_VERSION = 1;
export const SESSION_DRAFT_MAX_ENTRIES = 100;
export const SESSION_DRAFT_MAX_ENVELOPE_BYTES = 512 * 1024;
export const SESSION_DRAFT_MAX_INDEX_BYTES = 512 * 1024;
export const SESSION_DRAFT_MAX_QUARANTINE_BYTES = 512 * 1024;
export const SESSION_DRAFT_MAX_RECEIPTS = 128;
export const SESSION_DRAFT_RECEIPT_TTL_MS = 10 * 60 * 1000;
export const SESSION_DRAFT_MAX_PENDING_REMOVALS = 100;
type SessionDraftConflictCodeGroups = [
  ['OWNER_CONTEXT_INVALID', 'OWNER_CONFLICT', 'OWNER_ACTIVE', 'OWNER_LIVENESS_UNAVAILABLE'],
  ['SESSION_DRAFT_STORAGE_ENUMERATION_UNAVAILABLE', 'INDEX_RECOVERY_FAILED', 'STORAGE_FAILURE'],
  ['STORAGE_KEY_MISMATCH', 'CAPACITY_EXCEEDED', 'REQUEST_ID_REUSE'],
  ['DRAFT_EXISTS', 'DRAFT_NOT_FOUND', 'REVISION_CONFLICT', 'RECORD_CHANGED'],
  ['LEASE_REQUIRED', 'LEASE_CONFLICT', 'TERMINAL_DRAFT', 'TERMINAL_REQUIRED', 'REMOVAL_PENDING'],
  ['MIGRATION_INPUT_INVALID', 'MIGRATION_SOURCE_CHANGED', 'MIGRATION_CLEANUP_PENDING'],
  ['PAYLOAD_INVALID', 'PAYLOAD_TOO_LARGE']
];
export type SessionDraftConflictCode = SessionDraftConflictCodeGroups[number][number];
export interface SessionDraftRetentionPolicy {
  retentionMs: number;
  maxRestorablePages: number | null;
  maxItemsPerPage: number | null;
}
export interface SessionDraftStoragePolicy {
  retentionPolicy: SessionDraftRetentionPolicy;
  videoScreenshotCacheTtlMs: number;
}
export type SessionCommentDraftSnapshot = Record<string, string>;
export type SessionDraftJsonPrimitive = string | number | boolean | null;
export type SessionDraftJsonValue = SessionDraftJsonPrimitive | SessionDraftJsonValue[] | object;
export type SessionDraftPayload = Record<string, SessionDraftJsonValue>;
export interface SessionDraftClientPayloadBase {
  commentDrafts?: SessionCommentDraftSnapshot;
  ownerContext?: SessionDraftOwnerContext;
  [key: string]: SessionDraftJsonValue | undefined;
}
export interface ReaderSessionDraftHighlightPayload {
  id: string;
  selectedHtml: string;
  selectedText: string;
  comment: string;
  fragmentUrl: string;
  createdAt: number;
}
export interface ReaderSessionDraftPayload extends SessionDraftClientPayloadBase {
  mode?: 'reader';
  url?: string;
  title?: string;
  destination?: ExportDestinationMetadata;
  highlights?: ReaderSessionDraftHighlightPayload[];
}
export interface VideoSessionDraftPayload extends SessionDraftClientPayloadBase {}
interface SessionDraftClientEnvelopeBase<
  TMode extends SessionDraftMode,
  TPayload extends SessionDraftClientPayloadBase
> {
  schemaVersion: typeof SESSION_DRAFT_SCHEMA_VERSION;
  draftId: string;
  mode: TMode;
  pageKey: string;
  pageUrl: string;
  pageTitle: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  status: SessionDraftStatus;
  payload: TPayload;
  revision?: number;
  lease?: SessionDraftLease;
  legacyCleanup?: SessionDraftLegacyCleanupObligation;
}
export type ReaderSessionDraftEnvelope = SessionDraftClientEnvelopeBase<
  'reader',
  ReaderSessionDraftPayload
>;
export type VideoSessionDraftEnvelope = SessionDraftClientEnvelopeBase<
  'video',
  VideoSessionDraftPayload
>;
export type SessionDraftClientEnvelope = ReaderSessionDraftEnvelope | VideoSessionDraftEnvelope;
export function hasPersistedSessionDraftRevision<T extends { revision?: number }>(
  envelope: T
): envelope is T & { revision: number } {
  return Number.isInteger(envelope.revision) && (envelope.revision ?? 0) >= 1;
}
export function isRestorableSessionDraftStatus(status: SessionDraftStatus): boolean {
  return status === 'active' || status === 'restorable';
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
  legacyCleanup?: SessionDraftLegacyCleanupObligation | undefined;
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
  | 'migrate'
  | 'prune';
export type SessionDraftMutationSuccessOutcome =
  | 'saved'
  | 'finalized'
  | 'removed'
  | 'claimed'
  | 'renewed'
  | 'released'
  | 'migrated'
  | 'pruned';
export type SessionDraftMutationOutcome =
  | SessionDraftMutationSuccessOutcome
  | 'none'
  | 'invalid_removed';
export const SESSION_DRAFT_MUTATION_OPERATION_BY_OUTCOME: Record<
  SessionDraftMutationOutcome,
  SessionDraftMutationOperation
> = {
  saved: 'save',
  finalized: 'finalize',
  removed: 'remove',
  claimed: 'claim',
  renewed: 'renew',
  released: 'release',
  migrated: 'migrate',
  pruned: 'prune',
  none: 'claim',
  invalid_removed: 'claim'
};
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
