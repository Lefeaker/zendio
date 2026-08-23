import { z } from 'zod';
import {
  hasCanonicalSessionDraftPageIdentity,
  isExactSessionDraftStorageKey,
  isValidSessionDraftMutationMetadata as validLegacyMutationMetadata,
  isValidSessionDraftMutationReceipt as validLegacyMutationReceipt,
  isValidSessionDraftPendingRemoval as validPendingRemoval
} from './keys';
import {
  SessionDraftLeaseSchema,
  SessionDraftLegacyCleanupObligationSchema,
  SessionDraftLegacyOwnerContextSchema,
  SessionDraftModeSchema,
  SessionDraftStatusSchema,
  SessionDraftTrustedOwnerContextSchema
} from './pageIdentity';
import { measureSessionDraftValueBytes } from './retentionPolicy';
import {
  SESSION_DRAFT_LEGACY_SCHEMA_VERSION,
  SESSION_DRAFT_MAX_ENVELOPE_BYTES,
  SESSION_DRAFT_SCHEMA_VERSION,
  type SessionDraftCommitMetadata,
  type SessionDraftMutationReceipt,
  type SessionDraftPayload
} from './types';

export {
  SessionDraftLeaseSchema,
  SessionDraftLegacyCleanupObligationSchema,
  SessionDraftLegacyOwnerContextSchema,
  SessionDraftModeSchema,
  SessionDraftStatusSchema,
  SessionDraftTrustedOwnerContextSchema
};

export const SessionDraftConflictCodeSchema = z.union([
  z.enum(['OWNER_CONTEXT_INVALID', 'SESSION_DRAFT_STORAGE_ENUMERATION_UNAVAILABLE']),
  z.enum(['REQUEST_ID_REUSE', 'INDEX_RECOVERY_FAILED', 'STORAGE_FAILURE']),
  z.enum(['STORAGE_KEY_MISMATCH', 'DRAFT_EXISTS', 'DRAFT_NOT_FOUND']),
  z.enum(['REVISION_CONFLICT', 'LEASE_REQUIRED', 'LEASE_CONFLICT']),
  z.enum(['OWNER_CONFLICT', 'OWNER_ACTIVE', 'OWNER_LIVENESS_UNAVAILABLE']),
  z.enum(['TERMINAL_DRAFT', 'TERMINAL_REQUIRED', 'REMOVAL_PENDING']),
  z.enum(['MIGRATION_INPUT_INVALID', 'MIGRATION_SOURCE_CHANGED', 'MIGRATION_CLEANUP_PENDING']),
  z.enum(['PAYLOAD_INVALID', 'PAYLOAD_TOO_LARGE', 'CAPACITY_EXCEEDED', 'RECORD_CHANGED'])
]);
export type { SessionDraftConflictCode } from './types';

function validMutationMetadata(value: SessionDraftCommitMetadata): boolean {
  if (value.operation !== 'migrate') return validLegacyMutationMetadata(value);
  return (
    value.outcome === 'migrated' &&
    isExactSessionDraftStorageKey(value.key) &&
    value.revision !== undefined &&
    value.revision >= 1 &&
    value.removedCount === undefined &&
    value.selectionReason === undefined &&
    value.invalidRemovedCount === undefined
  );
}

function validMutationReceipt(value: SessionDraftMutationReceipt): boolean {
  if (value.operation !== 'migrate') return validLegacyMutationReceipt(value);
  return validMutationMetadata(value) && value.resultDigest !== undefined;
}
const TimestampSchema = z.number().int().nonnegative().finite();
const BoundedIdSchema = z.string().min(1).max(128);
const StorageKeySchema = z.string().min(1).max(1024);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const forbiddenPayloadKeys = new Set([
  'ownercontext',
  'screenshot',
  'dataurl',
  'screenshotdata',
  'screenshotdataurl',
  'screenshotbytes',
  'screenshotfallback',
  'screenshotbase64',
  'fallbackscreenshot',
  'imagebytes',
  'attachmentbytes',
  'binarybytes',
  'binarycontent',
  'bytes'
]);
function isAllowedJson(value: unknown, seen: Set<object>, allowLegacyOwner: boolean): boolean {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return typeof value !== 'string' || !value.toLowerCase().includes('data:image/');
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return false;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const entries: readonly unknown[] = value;
      if (Object.keys(entries).length !== entries.length) return false;
      if (Reflect.ownKeys(entries).length !== entries.length + 1) return false;
      for (let index = 0; index < entries.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(entries, index);
        if (!descriptor || !('value' in descriptor)) return false;
        if (!isAllowedJson(descriptor.value, seen, false)) return false;
      }
      return true;
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Object.keys(value);
    if (Reflect.ownKeys(value).length !== keys.length) return false;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return false;
      if (
        forbiddenPayloadKeys.has(key.toLowerCase()) &&
        !(allowLegacyOwner && key === 'ownerContext')
      ) {
        return false;
      }
      if (!isAllowedJson(descriptor.value, seen, false)) return false;
    }
    return true;
  } finally {
    seen.delete(value);
  }
}
function isAllowedPayload(value: unknown, allowOwner: boolean): value is SessionDraftPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return isAllowedJson(value, new Set<object>(), allowOwner);
}
export const SessionDraftPayloadSchema = z.custom<SessionDraftPayload>((value) =>
  isAllowedPayload(value, false)
);
const LegacyPayloadSchema = z.custom<SessionDraftPayload>((value) => isAllowedPayload(value, true));
export const SessionDraftRecordMetadataSchema = z
  .object({
    draftId: z.string().min(1).max(256),
    mode: SessionDraftModeSchema,
    pageKey: z.string().min(1).max(128),
    pageUrl: z.string().url().max(4096),
    pageTitle: z.string().max(4096),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    expiresAt: TimestampSchema,
    status: SessionDraftStatusSchema
  })
  .strict();
export const SessionDraftEnvelopeSchema = SessionDraftRecordMetadataSchema.extend({
  schemaVersion: z.literal(SESSION_DRAFT_SCHEMA_VERSION),
  revision: z.number().int().min(1),
  lease: SessionDraftLeaseSchema.optional(),
  legacyCleanup: SessionDraftLegacyCleanupObligationSchema.optional(),
  payload: SessionDraftPayloadSchema
})
  .strict()
  .refine(hasCanonicalSessionDraftPageIdentity, 'SESSION_DRAFT_PAGE_IDENTITY_INVALID')
  .refine(
    (record) => (record.status !== 'restorable') === Boolean(record.lease),
    'SESSION_DRAFT_LEASE_STATUS_INVALID'
  )
  .superRefine((record, context) => {
    if (measureSessionDraftValueBytes(record) > SESSION_DRAFT_MAX_ENVELOPE_BYTES) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'SESSION_DRAFT_PAYLOAD_TOO_LARGE' });
    }
  });
export const LegacyEnvelopeSchema = SessionDraftRecordMetadataSchema.extend({
  schemaVersion: z.literal(SESSION_DRAFT_LEGACY_SCHEMA_VERSION),
  payload: LegacyPayloadSchema
});
export const SessionDraftIndexEntrySchema = z
  .object({
    key: StorageKeySchema,
    draftId: z.string().min(1).max(256),
    mode: SessionDraftModeSchema,
    pageKey: z.string().min(1).max(128),
    recordSchemaVersion: z.union([
      z.literal(SESSION_DRAFT_LEGACY_SCHEMA_VERSION),
      z.literal(SESSION_DRAFT_SCHEMA_VERSION)
    ]),
    revision: z.number().int().nonnegative(),
    updatedAt: TimestampSchema,
    expiresAt: TimestampSchema,
    status: SessionDraftStatusSchema
  })
  .strict();
export const SessionDraftMutationOperationSchema = z.enum([
  'save',
  'finalize',
  'remove',
  'claim',
  'renew',
  'release',
  'migrate',
  'prune'
]);
export const SessionDraftMutationOutcomeSchema = z.enum([
  'saved',
  'finalized',
  'removed',
  'claimed',
  'renewed',
  'released',
  'migrated',
  'pruned',
  'none',
  'invalid_removed'
]);
export const SessionDraftSelectionReasonSchema = z.enum([
  'restorable',
  'expired_owner_inactive',
  'legacy_owner_inactive'
]);
const MutationMetadataObject = z
  .object({
    operation: SessionDraftMutationOperationSchema,
    key: StorageKeySchema,
    outcome: SessionDraftMutationOutcomeSchema,
    revision: z.number().int().nonnegative().optional(),
    removedCount: z.number().int().nonnegative().optional(),
    selectionReason: SessionDraftSelectionReasonSchema.optional(),
    invalidRemovedCount: z.number().int().nonnegative().optional()
  })
  .strict();
const ReceiptObject = MutationMetadataObject.extend({
  requestId: BoundedIdSchema,
  digest: DigestSchema,
  resultDigest: DigestSchema.optional(),
  timestamp: TimestampSchema
});
export const SessionDraftCommitMetadataSchema = MutationMetadataObject.refine(
  validMutationMetadata,
  'SESSION_DRAFT_RECEIPT_INVALID'
);
export const SessionDraftMutationReceiptSchema = ReceiptObject.refine(
  validMutationReceipt,
  'SESSION_DRAFT_RECEIPT_INVALID'
);
const PendingRemovalObject = ReceiptObject.extend({ receiptKey: StorageKeySchema });
export const SessionDraftPendingRemovalSchema = PendingRemovalObject.refine(
  validPendingRemoval,
  'SESSION_DRAFT_RECEIPT_INVALID'
);
export const SessionDraftRemovalTombstoneSchema = PendingRemovalObject.extend({
  schemaVersion: z.literal(SESSION_DRAFT_SCHEMA_VERSION),
  kind: z.literal('session-draft-removal-tombstone')
}).refine(validPendingRemoval, 'SESSION_DRAFT_RECEIPT_INVALID');
