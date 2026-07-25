import { z } from 'zod';
import {
  SessionDraftCommitMetadataSchema,
  SessionDraftEnvelopeSchema,
  SessionDraftModeSchema,
  SessionDraftPayloadSchema,
  SessionDraftRecordResponseSchema,
  SessionDraftSelectionReasonSchema
} from './schemas';
import {
  createSessionDraftStorageKey,
  isExactSessionDraftStorageKey,
  SESSION_DRAFT_INDEX_KEY
} from './keys';
const RequestIdSchema = z.string().min(1).max(128);
const LeaseIdSchema = z.string().min(1).max(128);
const StorageKeySchema = z.string().min(1).max(1024);
const ExactStorageKeySchema = StorageKeySchema.refine(isExactSessionDraftStorageKey);
const RevisionSchema = z.number().int().nonnegative();
const SessionDraftTerminalStatusSchema = z.enum(['discarded', 'exported']);
function strictObject<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object(shape).strict();
}
const DraftInputSchema = strictObject({
  draftId: z.string().min(1).max(256),
  mode: SessionDraftModeSchema,
  pageUrl: z.string().url().max(4096),
  pageTitle: z.string().max(4096),
  payload: SessionDraftPayloadSchema
});
const ExactMutationFields = {
  requestId: RequestIdSchema,
  key: StorageKeySchema,
  expectedRevision: RevisionSchema,
  leaseId: LeaseIdSchema
};
const PageRequestFields = {
  mode: SessionDraftModeSchema,
  pageUrl: z.string().url().max(4096)
};
const ExactMutationRequestSchema = strictObject(ExactMutationFields);
export const SessionDraftReadExactRequestSchema = strictObject({
  operation: z.literal('readExact'),
  key: StorageKeySchema
});
export const SessionDraftSaveRequestSchema = strictObject({
  operation: z.literal('save'),
  requestId: RequestIdSchema,
  key: StorageKeySchema,
  expectedRevision: RevisionSchema.nullable(),
  leaseId: LeaseIdSchema.optional(),
  draft: DraftInputSchema
});
export const SessionDraftFinalizeExactRequestSchema = ExactMutationRequestSchema.extend({
  operation: z.literal('finalizeExact'),
  status: SessionDraftTerminalStatusSchema
});
export const SessionDraftRemoveExactRequestSchema = ExactMutationRequestSchema.extend({
  operation: z.literal('removeExact')
});
export const SessionDraftRenewLeaseRequestSchema = ExactMutationRequestSchema.extend({
  operation: z.literal('renewLease')
});
export const SessionDraftReleaseLeaseRequestSchema = ExactMutationRequestSchema.extend({
  operation: z.literal('releaseLease')
});
export const SessionDraftPruneRequestSchema = strictObject({
  operation: z.literal('prune'),
  requestId: RequestIdSchema
});
export const SessionDraftListRequestSchema = strictObject({
  operation: z.literal('list'),
  ...PageRequestFields
});
export const SessionDraftSelectAndClaimRequestSchema = strictObject({
  operation: z.literal('selectAndClaim'),
  requestId: RequestIdSchema,
  ...PageRequestFields
});
export const SessionDraftConflictCodeSchema = z.union([
  z.enum(['OWNER_CONTEXT_INVALID', 'SESSION_DRAFT_STORAGE_ENUMERATION_UNAVAILABLE']),
  z.enum(['REQUEST_ID_REUSE', 'INDEX_RECOVERY_FAILED', 'STORAGE_FAILURE']),
  z.enum(['STORAGE_KEY_MISMATCH', 'DRAFT_EXISTS', 'DRAFT_NOT_FOUND']),
  z.enum(['REVISION_CONFLICT', 'LEASE_REQUIRED', 'LEASE_CONFLICT']),
  z.enum(['OWNER_CONFLICT', 'OWNER_ACTIVE', 'OWNER_LIVENESS_UNAVAILABLE']),
  z.enum(['TERMINAL_DRAFT', 'TERMINAL_REQUIRED', 'REMOVAL_PENDING']),
  z.enum(['PAYLOAD_INVALID', 'PAYLOAD_TOO_LARGE', 'CAPACITY_EXCEEDED', 'RECORD_CHANGED'])
]);
const ConflictResultSchema = strictObject({
  outcome: z.literal('conflict'),
  code: SessionDraftConflictCodeSchema
});
const RecoveryFailedResultSchema = strictObject({
  outcome: z.literal('recovery_failed'),
  code: z.literal('INDEX_RECOVERY_FAILED')
});
const InvalidRemovedFields = {
  outcome: z.literal('invalid_removed'),
  invalidRemovedCount: z.number().int().min(1)
};
const InvalidRemovedResultSchema = strictObject(InvalidRemovedFields);
export const SessionDraftReceiptReplaySchema = strictObject({
  replayed: z.literal(true),
  commit: SessionDraftCommitMetadataSchema,
  requiresReadExact: z.boolean()
});
const OperationByOutcome: Record<string, string | undefined> = {
  saved: 'save',
  finalized: 'finalize',
  removed: 'remove',
  claimed: 'claim',
  renewed: 'renew',
  released: 'release',
  pruned: 'prune',
  none: 'claim',
  invalid_removed: 'claim'
};
type PortableMutationResult = {
  outcome: string;
  revision?: number | undefined;
  key?: string | undefined;
  removedCount?: number | undefined;
  selectionReason?: string | undefined;
  invalidRemovedCount?: number | undefined;
  envelope?: object | undefined;
  replay?: z.infer<typeof SessionDraftReceiptReplaySchema> | undefined;
};
const ResultContractError = { message: 'SESSION_DRAFT_SUCCESS_PAYLOAD_INVALID' };
function validMutationResult(value: PortableMutationResult): boolean {
  const envelope = SessionDraftEnvelopeSchema.safeParse(value.envelope);
  const envelopeOutcome = !['removed', 'pruned', 'none', 'invalid_removed'].includes(value.outcome);
  if (envelopeOutcome) {
    if (envelope.success) {
      const statusMatches =
        value.outcome === 'released'
          ? envelope.data.status === 'restorable'
          : value.outcome === 'finalized'
            ? envelope.data.status === 'discarded' || envelope.data.status === 'exported'
            : envelope.data.status === 'active';
      if (
        !statusMatches ||
        envelope.data.revision !== value.revision ||
        value.replay?.requiresReadExact === true
      )
        return false;
    } else if (value.replay?.requiresReadExact !== true) return false;
  }
  if (!envelopeOutcome && value.replay?.requiresReadExact === false) return false;
  if (!value.replay) return true;
  const commit = value.replay.commit;
  let expectedKey = value.key;
  if (envelope.success) expectedKey = createSessionDraftStorageKey(envelope.data);
  if (['pruned', 'none', 'invalid_removed'].includes(value.outcome)) {
    expectedKey = SESSION_DRAFT_INDEX_KEY;
  }
  return (
    commit.operation === OperationByOutcome[value.outcome] &&
    commit.outcome === value.outcome &&
    (value.revision === undefined || commit.revision === value.revision) &&
    (value.removedCount === undefined || commit.removedCount === value.removedCount) &&
    (value.selectionReason === undefined || commit.selectionReason === value.selectionReason) &&
    (value.invalidRemovedCount === undefined ||
      commit.invalidRemovedCount === value.invalidRemovedCount) &&
    (expectedKey === undefined || commit.key === expectedKey)
  );
}
function mutationResultSchema<Shape extends z.ZodRawShape>(shape: Shape) {
  return strictObject({ ...shape, replay: SessionDraftReceiptReplaySchema.optional() });
}
export const SessionDraftReadExactResultSchema = z.union([
  z.object({ outcome: z.literal('found'), envelope: SessionDraftRecordResponseSchema }).strict(),
  z.object({ outcome: z.literal('missing') }).strict(),
  InvalidRemovedResultSchema,
  RecoveryFailedResultSchema
]);
export const SessionDraftListResultSchema = z.union([
  strictObject({
    outcome: z.literal('listed'),
    envelopes: z.array(SessionDraftRecordResponseSchema),
    invalidRemovedCount: z.number().int().nonnegative()
  }),
  RecoveryFailedResultSchema
]);
const EnvelopeMutationSuccessSchema = mutationResultSchema({
  outcome: z.enum(['saved', 'finalized', 'renewed', 'released']),
  revision: RevisionSchema.min(1),
  envelope: SessionDraftEnvelopeSchema.optional()
}).refine(validMutationResult, ResultContractError);
export const SessionDraftEnvelopeMutationResultSchema = z.union([
  EnvelopeMutationSuccessSchema,
  ConflictResultSchema,
  RecoveryFailedResultSchema
]);
export const SessionDraftRemoveResultSchema = z.union([
  mutationResultSchema({
    outcome: z.literal('removed'),
    key: ExactStorageKeySchema,
    revision: RevisionSchema.min(1)
  }).refine(validMutationResult, ResultContractError),
  ConflictResultSchema,
  RecoveryFailedResultSchema
]);
export const SessionDraftPruneResultSchema = z.union([
  mutationResultSchema({
    outcome: z.literal('pruned'),
    removedCount: z.number().int().nonnegative()
  }).refine(validMutationResult, ResultContractError),
  ConflictResultSchema,
  RecoveryFailedResultSchema
]);
export const SessionDraftSelectAndClaimResultSchema = z.union([
  mutationResultSchema({
    outcome: z.literal('claimed'),
    revision: RevisionSchema.min(1),
    envelope: SessionDraftEnvelopeSchema.optional(),
    selectionReason: SessionDraftSelectionReasonSchema,
    invalidRemovedCount: z.number().int().nonnegative()
  }).refine(validMutationResult, ResultContractError),
  mutationResultSchema({
    outcome: z.literal('none'),
    invalidRemovedCount: z.literal(0)
  }).refine(validMutationResult, ResultContractError),
  mutationResultSchema(InvalidRemovedFields).refine(validMutationResult, ResultContractError),
  ConflictResultSchema,
  RecoveryFailedResultSchema
]);
type Infer<Schema extends z.ZodType> = z.infer<Schema>;
export type SessionDraftReadExactRequest = Infer<typeof SessionDraftReadExactRequestSchema>;
export type SessionDraftSaveRequest = Infer<typeof SessionDraftSaveRequestSchema>;
export type SessionDraftFinalizeExactRequest = Infer<typeof SessionDraftFinalizeExactRequestSchema>;
export type SessionDraftRemoveExactRequest = Infer<typeof SessionDraftRemoveExactRequestSchema>;
export type SessionDraftRenewLeaseRequest = Infer<typeof SessionDraftRenewLeaseRequestSchema>;
export type SessionDraftReleaseLeaseRequest = Infer<typeof SessionDraftReleaseLeaseRequestSchema>;
export type SessionDraftPruneRequest = Infer<typeof SessionDraftPruneRequestSchema>;
export type SessionDraftListRequest = Infer<typeof SessionDraftListRequestSchema>;
export type SessionDraftSelectAndClaimRequest = Infer<
  typeof SessionDraftSelectAndClaimRequestSchema
>;
export type SessionDraftReadExactResult = Infer<typeof SessionDraftReadExactResultSchema>;
export type SessionDraftListResult = Infer<typeof SessionDraftListResultSchema>;
export type SessionDraftEnvelopeMutationResult = Infer<
  typeof SessionDraftEnvelopeMutationResultSchema
>;
export type SessionDraftRemoveResult = Infer<typeof SessionDraftRemoveResultSchema>;
export type SessionDraftPruneResult = Infer<typeof SessionDraftPruneResultSchema>;
export type SessionDraftSelectAndClaimResult = Infer<typeof SessionDraftSelectAndClaimResultSchema>;
