import type { FailureCategory } from './analytics';
import type { UserVisibleMessageDescriptor } from '../i18n/userVisibleMessageDescriptor';
import { isObjectRecord } from '../guards';
import { z } from 'zod';

/** Small historical confirmations; contains no attachment bytes or write replay job. */
export const ClipAttachmentProgressSchema = z
  .object({
    operationId: z.string().regex(/^op_[a-z0-9]{6,24}$/u),
    planId: z.string().regex(/^[a-f0-9]{64}$/u),
    storageTarget: z.enum(['downloads', 'local-folder', 'rest-api']),
    total: z.number().int().min(1).max(50),
    phase: z.enum(['attachments', 'note']),
    blocked: z.boolean().optional(),
    confirmed: z
      .array(
        z.object({
          id: z.string().min(1).max(256),
          outputPath: z.string().min(1).max(4096),
          download: z
            .object({
              id: z.union([z.number().int().nonnegative(), z.string().min(1).max(256)]),
              filename: z.string().min(1).max(4096)
            })
            .optional()
        })
      )
      .max(50)
  })
  .superRefine((value, context) => {
    if (
      value.confirmed.length > value.total ||
      (value.phase === 'note' && value.confirmed.length !== value.total)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CLIP_ATTACHMENT_PROGRESS_INVALID'
      });
  });
export type ClipAttachmentProgress = z.infer<typeof ClipAttachmentProgressSchema>;

export type ClipSaveStage = 'prepare' | 'attachments' | 'note';
export interface ClipSaveFailure {
  success: false;
  outcome: 'failed' | 'unknown';
  failureCategory: FailureCategory;
  code: string;
  message: UserVisibleMessageDescriptor;
  stage?: ClipSaveStage;
  operationId?: string;
  attachmentProgress?: ClipAttachmentProgress;
}
export type ClipSaveResult =
  | { success: true; outcome: 'saved'; filePath?: string; operationId?: string }
  | ClipSaveFailure;

const FAILURE_MESSAGES = {
  permission: 'saveFailurePermission',
  connection: 'saveFailureConnection',
  validation: 'saveFailureValidation',
  classification: 'saveFailureClassification',
  extraction: 'saveFailureExtraction',
  write: 'saveFailureWrite',
  timeout: 'saveFailureTimeout',
  unsupported: 'saveFailureUnsupported',
  unknown: 'saveFailureGeneric'
} as const satisfies Record<FailureCategory, string>;

export function isClipFailureCategory(value: unknown): value is FailureCategory {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FAILURE_MESSAGES, value);
}

/** Deliberately excludes raw exceptions, arbitrary descriptors, paths and response bodies. */
export function createClipSaveFailure(
  outcome: 'failed' | 'unknown',
  failureCategory: FailureCategory = 'unknown',
  stage?: ClipSaveStage,
  attachmentProgress?: ClipAttachmentProgress
): ClipSaveFailure {
  return {
    success: false,
    outcome,
    failureCategory,
    code:
      outcome === 'unknown'
        ? 'CLIP_RESULT_UNKNOWN'
        : `CLIP_${failureCategory.toUpperCase()}_FAILED`,
    message: {
      key: outcome === 'unknown' ? 'saveResultUnknown' : FAILURE_MESSAGES[failureCategory]
    },
    ...(stage ? { stage } : {}),
    ...(attachmentProgress ? { attachmentProgress } : {})
  };
}

/** Older backgrounds have only success; an absent reply is never proof of failure. */
export function readClipSaveResult(value: unknown): ClipSaveResult {
  if (!isObjectRecord(value)) return createClipSaveFailure('unknown');
  if (value.success === true) {
    if (
      (value.outcome !== undefined && value.outcome !== 'saved') ||
      ('filePath' in value && typeof value.filePath !== 'string')
    )
      return createClipSaveFailure('unknown');
    return {
      success: true,
      outcome: 'saved',
      ...(typeof value.filePath === 'string' ? { filePath: value.filePath } : {})
    };
  }
  if (value.success !== false) return createClipSaveFailure('unknown');
  const progress = ClipAttachmentProgressSchema.safeParse(value.attachmentProgress);
  return createClipSaveFailure(
    value.outcome === 'failed' ? 'failed' : 'unknown',
    isClipFailureCategory(value.failureCategory) ? value.failureCategory : 'unknown',
    value.stage === 'prepare' || value.stage === 'attachments' || value.stage === 'note'
      ? value.stage
      : undefined,
    progress.success ? progress.data : undefined
  );
}

export class ClipSaveError extends Error {
  readonly failureCategory: FailureCategory;
  constructor(readonly result: ClipSaveFailure) {
    super(result.code);
    this.name = 'ClipSaveError';
    this.failureCategory = result.failureCategory;
  }
}

/** A failed continuation cannot erase confirmations from the same original intent. */
export function preserveClipAttachmentProgress(
  failure: ClipSaveFailure,
  previous?: ClipAttachmentProgress
): ClipSaveFailure {
  const progress = failure.attachmentProgress ?? previous;
  return progress
    ? createClipSaveFailure('unknown', failure.failureCategory, failure.stage, progress)
    : failure;
}

/** Content must recover even when a message channel never settles. This does not retry it. */
export async function awaitClipSaveResult(action: () => Promise<unknown>): Promise<ClipSaveResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = Promise.resolve()
    .then(action)
    .then(readClipSaveResult, () => createClipSaveFailure('unknown', 'connection'));
  try {
    return await Promise.race([
      result,
      new Promise<ClipSaveResult>((resolve) => {
        timer = setTimeout(() => resolve(createClipSaveFailure('unknown', 'timeout')), 150_000);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
