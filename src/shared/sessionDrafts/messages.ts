import { z } from 'zod';
import * as Schema from './schemas';
import * as Key from './keys';
import * as Type from './types';
const RequestIdSchema = z.string().min(1).max(128);
const LeaseIdSchema = z.string().min(1).max(128);
const StorageKeySchema = z.string().min(1).max(1024);
const ExactStorageKeySchema = StorageKeySchema.refine(Key.isExactSessionDraftStorageKey);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const RevisionSchema = z.number().int().nonnegative();
const SessionDraftTerminalStatusSchema = z.enum(['discarded', 'exported']);
export const SESSION_DRAFT_RUNTIME_MESSAGE_TYPE = 'AIIOB_SESSION_DRAFT_V2' as const;
const strictObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape).strict();
const DraftInputSchema = strictObject({
  draftId: z.string().min(1).max(256),
  mode: Schema.SessionDraftModeSchema,
  pageUrl: z.string().url().max(4096),
  pageTitle: z.string().max(4096),
  payload: Schema.SessionDraftPayloadSchema
});
const ExactMutationFields = {
  requestId: RequestIdSchema,
  key: StorageKeySchema,
  expectedRevision: RevisionSchema,
  leaseId: LeaseIdSchema
};
const PageRequestFields = {
  mode: Schema.SessionDraftModeSchema,
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
export const SessionDraftMigrateLegacyVideoCaptureRequestSchema = strictObject({
  operation: z.literal('migrateLegacyVideoCapture'),
  requestId: RequestIdSchema,
  key: ExactStorageKeySchema,
  legacyKey: z.string().min(1).max(128),
  rawDigest: DigestSchema,
  canonicalDigest: DigestSchema,
  canonicalLegacy: z.unknown(),
  draft: DraftInputSchema
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
export const SessionDraftRequestSchema = z.discriminatedUnion('operation', [
  SessionDraftReadExactRequestSchema,
  SessionDraftSaveRequestSchema,
  SessionDraftFinalizeExactRequestSchema,
  SessionDraftRemoveExactRequestSchema,
  SessionDraftRenewLeaseRequestSchema,
  SessionDraftReleaseLeaseRequestSchema,
  SessionDraftMigrateLegacyVideoCaptureRequestSchema,
  SessionDraftPruneRequestSchema,
  SessionDraftListRequestSchema,
  SessionDraftSelectAndClaimRequestSchema
]);
export const SessionDraftRuntimeMessageSchema = strictObject({
  type: z.literal(SESSION_DRAFT_RUNTIME_MESSAGE_TYPE),
  request: SessionDraftRequestSchema
});
const ConflictResultSchema = strictObject({
  outcome: z.literal('conflict'),
  code: Schema.SessionDraftConflictCodeSchema
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
  commit: Schema.SessionDraftCommitMetadataSchema,
  requiresReadExact: z.boolean()
});
type PortableMutationResult = {
  outcome: Type.SessionDraftMutationOutcome;
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
  const envelope = Schema.SessionDraftEnvelopeSchema.safeParse(value.envelope);
  const nonEnvelope = ['removed', 'pruned', 'none', 'invalid_removed'].includes(value.outcome);
  if (!nonEnvelope && !envelope.success) return value.replay?.requiresReadExact === true;
  if (nonEnvelope && value.replay?.requiresReadExact === false) return false;
  if (
    envelope.success &&
    (envelope.data.revision !== value.revision ||
      value.replay?.requiresReadExact === true ||
      (value.outcome === 'released'
        ? envelope.data.status !== 'restorable'
        : value.outcome === 'finalized'
          ? envelope.data.status !== 'discarded' && envelope.data.status !== 'exported'
          : envelope.data.status !== 'active'))
  )
    return false;
  if (!value.replay) return true;
  const commit = value.replay.commit;
  const expectedKey = envelope.success
    ? Key.createSessionDraftStorageKey(envelope.data)
    : ['pruned', 'none', 'invalid_removed'].includes(value.outcome)
      ? Key.SESSION_DRAFT_INDEX_KEY
      : value.key;
  return (
    commit.operation === Type.SESSION_DRAFT_MUTATION_OPERATION_BY_OUTCOME[value.outcome] &&
    commit.outcome === value.outcome &&
    (value.revision === undefined || commit.revision === value.revision) &&
    (value.removedCount === undefined || commit.removedCount === value.removedCount) &&
    (value.selectionReason === undefined || commit.selectionReason === value.selectionReason) &&
    (value.invalidRemovedCount === undefined ||
      commit.invalidRemovedCount === value.invalidRemovedCount) &&
    (expectedKey === undefined || commit.key === expectedKey)
  );
}
const mutationResultSchema = <Shape extends z.ZodRawShape>(shape: Shape) =>
  strictObject({ ...shape, replay: SessionDraftReceiptReplaySchema.optional() });
const LegacyRecordResponseSchema = Schema.SessionDraftRecordMetadataSchema.extend({
  schemaVersion: z.literal(Type.SESSION_DRAFT_LEGACY_SCHEMA_VERSION),
  revision: z.literal(0),
  payload: Schema.SessionDraftPayloadSchema
}).strict();
const DraftRecordResponseSchema = z.union([
  Schema.SessionDraftEnvelopeSchema,
  LegacyRecordResponseSchema
]);
export const SessionDraftReadExactResultSchema = z.union([
  z.object({ outcome: z.literal('found'), envelope: DraftRecordResponseSchema }).strict(),
  z.object({ outcome: z.literal('missing') }).strict(),
  InvalidRemovedResultSchema,
  RecoveryFailedResultSchema
]);
export const SessionDraftListResultSchema = z.union([
  strictObject({
    outcome: z.literal('listed'),
    envelopes: z.array(DraftRecordResponseSchema),
    invalidRemovedCount: z.number().int().nonnegative()
  }),
  RecoveryFailedResultSchema
]);
const EnvelopeMutationSuccessSchema = mutationResultSchema({
  outcome: z.enum(['saved', 'finalized', 'renewed', 'released', 'migrated']),
  revision: RevisionSchema.min(1),
  envelope: Schema.SessionDraftEnvelopeSchema.optional()
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
    envelope: Schema.SessionDraftEnvelopeSchema.optional(),
    selectionReason: Schema.SessionDraftSelectionReasonSchema,
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
type Infer<SchemaType extends z.ZodType> = z.infer<SchemaType>;
type RequestUnion = Infer<typeof SessionDraftRequestSchema>;
export type SessionDraftRequest = RequestUnion;
type Request<O extends RequestUnion['operation']> = Extract<RequestUnion, { operation: O }>;
export type SessionDraftReadExactRequest = Request<'readExact'>;
export type SessionDraftSaveRequest = Request<'save'>;
export type SessionDraftFinalizeExactRequest = Request<'finalizeExact'>;
export type SessionDraftRemoveExactRequest = Request<'removeExact'>;
export type SessionDraftRenewLeaseRequest = Request<'renewLease'>;
export type SessionDraftReleaseLeaseRequest = Request<'releaseLease'>;
export type SessionDraftMigrateLegacyVideoCaptureRequest = Request<'migrateLegacyVideoCapture'>;
export type SessionDraftPruneRequest = Request<'prune'>;
export type SessionDraftListRequest = Request<'list'>;
export type SessionDraftSelectAndClaimRequest = Request<'selectAndClaim'>;
export type SessionDraftRuntimeMessage = Infer<typeof SessionDraftRuntimeMessageSchema>;
export type SessionDraftReadExactResult = Infer<typeof SessionDraftReadExactResultSchema>;
export type SessionDraftListResult = Infer<typeof SessionDraftListResultSchema>;
export type SessionDraftEnvelopeMutationResult = Infer<
  typeof SessionDraftEnvelopeMutationResultSchema
>;
export type SessionDraftRemoveResult = Infer<typeof SessionDraftRemoveResultSchema>;
export type SessionDraftPruneResult = Infer<typeof SessionDraftPruneResultSchema>;
export type SessionDraftSelectAndClaimResult = Infer<typeof SessionDraftSelectAndClaimResultSchema>;
