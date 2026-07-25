import { z } from 'zod';
import {
  isValidSessionDraftMutationMetadata as validMutationMetadata,
  isValidSessionDraftMutationReceipt as validMutationReceipt,
  isValidSessionDraftPendingRemoval as validPendingRemoval
} from './keys';
import { measureSessionDraftValueBytes } from './retentionPolicy';
import {
  SESSION_DRAFT_LEGACY_SCHEMA_VERSION,
  SESSION_DRAFT_LEASE_DURATION_MS,
  SESSION_DRAFT_MAX_ENVELOPE_BYTES,
  SESSION_DRAFT_SCHEMA_VERSION,
  type SessionDraftLegacyRecord,
  type SessionDraftPayload,
  type SessionDraftRecord
} from './types';
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
export const SessionDraftModeSchema = z.enum(['reader', 'video']);
export const SessionDraftStatusSchema = z.enum(['active', 'restorable', 'discarded', 'exported']);
export const SessionDraftTrustedOwnerContextSchema = z
  .object({
    tabId: z.number().int().nonnegative(),
    frameId: z.number().int().nonnegative(),
    windowId: z.number().int().nonnegative().optional()
  })
  .strict();
export const SessionDraftLegacyOwnerContextSchema = SessionDraftTrustedOwnerContextSchema.partial();
export const SessionDraftLeaseSchema = z
  .object({
    leaseId: BoundedIdSchema,
    owner: SessionDraftTrustedOwnerContextSchema,
    renewedAt: TimestampSchema,
    leaseExpiresAt: TimestampSchema
  })
  .strict()
  .refine(
    (lease) => lease.leaseExpiresAt === lease.renewedAt + SESSION_DRAFT_LEASE_DURATION_MS,
    'SESSION_DRAFT_LEASE_EXPIRY_INVALID'
  );
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
  payload: SessionDraftPayloadSchema
})
  .strict()
  .superRefine((record, context) => {
    const requiresLease = record.status !== 'restorable';
    if (requiresLease !== Boolean(record.lease)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SESSION_DRAFT_LEASE_STATUS_INVALID'
      });
    }
    if (measureSessionDraftValueBytes(record) > SESSION_DRAFT_MAX_ENVELOPE_BYTES) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'SESSION_DRAFT_PAYLOAD_TOO_LARGE' });
    }
  });
const LegacyEnvelopeSchema = SessionDraftRecordMetadataSchema.extend({
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
  'prune'
]);
export const SessionDraftMutationOutcomeSchema = z.enum([
  'saved',
  'finalized',
  'removed',
  'claimed',
  'renewed',
  'released',
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
export const SessionDraftLegacyRecordResponseSchema = SessionDraftRecordMetadataSchema.extend({
  schemaVersion: z.literal(SESSION_DRAFT_LEGACY_SCHEMA_VERSION),
  revision: z.literal(0),
  payload: SessionDraftPayloadSchema
}).strict();
export const SessionDraftRecordResponseSchema = z.union([
  SessionDraftEnvelopeSchema,
  SessionDraftLegacyRecordResponseSchema
]);
export function normalizeLegacySessionDraftRecord(
  value: unknown
): SessionDraftLegacyRecord | undefined {
  const parsed = LegacyEnvelopeSchema.safeParse(value);
  if (!parsed.success) return undefined;
  if (measureSessionDraftValueBytes(parsed.data) > SESSION_DRAFT_MAX_ENVELOPE_BYTES)
    return undefined;
  const { ownerContext, ...payload } = parsed.data.payload;
  const legacyOwner = SessionDraftLegacyOwnerContextSchema.safeParse(ownerContext);
  return {
    ...parsed.data,
    revision: 0,
    payload,
    ...(legacyOwner.success ? { legacyOwnerContext: legacyOwner.data } : {})
  };
}
export function parseSessionDraftRecord(value: unknown): SessionDraftRecord | undefined {
  const current = SessionDraftEnvelopeSchema.safeParse(value);
  return current.success ? current.data : normalizeLegacySessionDraftRecord(value);
}
