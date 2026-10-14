import type { FailureCategory } from './analytics';
import type { UserVisibleMessageDescriptor } from '../i18n/userVisibleMessageDescriptor';
import { isObjectRecord } from '../guards';

export type ClipSaveStage = 'prepare' | 'attachments' | 'note';
export interface ClipSaveFailure {
  success: false;
  outcome: 'failed' | 'unknown';
  failureCategory: FailureCategory;
  code: string;
  message: UserVisibleMessageDescriptor;
  stage?: ClipSaveStage;
  operationId?: string;
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
  stage?: ClipSaveStage
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
    ...(stage ? { stage } : {})
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
  return createClipSaveFailure(
    value.outcome === 'failed' ? 'failed' : 'unknown',
    isClipFailureCategory(value.failureCategory) ? value.failureCategory : 'unknown',
    value.stage === 'prepare' || value.stage === 'attachments' || value.stage === 'note'
      ? value.stage
      : undefined
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
