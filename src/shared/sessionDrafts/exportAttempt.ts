import { z } from 'zod';
import { sha256Hex } from './pageIdentity';
import { createAnalyticsOperationId } from '../analytics/featureTimer';
import { ClipAttachmentProgressSchema } from '../types/clipResult';

/** This records uncertainty in the existing draft; it is not a write replay ledger. */
export const SessionExportAttemptSchema = z
  .object({
    operationId: z.string().regex(/^op_[a-z0-9]{6,24}$/u),
    snapshotId: z.string().regex(/^[a-f0-9]{64}$/u),
    outcome: z.enum(['unknown', 'saved']),
    startedAt: z.number().finite().nonnegative(),
    filePath: z.string().optional(),
    targetLabel: z.string().optional(),
    requestedPath: z.string().optional(),
    attachmentProgress: ClipAttachmentProgressSchema.optional().catch(undefined)
  })
  .transform(({ attachmentProgress, ...attempt }) => ({
    ...attempt,
    ...(attachmentProgress?.operationId === attempt.operationId ? { attachmentProgress } : {})
  }));
export type SessionExportAttempt = z.infer<typeof SessionExportAttemptSchema>;
export type SessionExportRecoveryAction = 'save-again' | 'confirm-saved' | 'continue';

export function sessionExportSnapshotId(snapshot: object): string {
  return sha256Hex(JSON.stringify(snapshot));
}

export function createSessionExportAttempt(
  snapshotId: string,
  target?: { label: string; path: string }
): SessionExportAttempt {
  return {
    ...(target ? { targetLabel: target.label, requestedPath: target.path } : {}),
    operationId: createAnalyticsOperationId(),
    snapshotId,
    outcome: 'unknown',
    startedAt: Date.now()
  };
}

export function readSessionExportAttempt(value: unknown): SessionExportAttempt | undefined {
  const parsed = SessionExportAttemptSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
