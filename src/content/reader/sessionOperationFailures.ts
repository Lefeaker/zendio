import { isAppError } from '../../shared/errors';
import type { FailureCategory } from '@shared/types/analytics';

const FAILURE_CATEGORIES: ReadonlySet<string> = new Set(
  'permission connection validation classification extraction write timeout unsupported unknown'.split(
    ' '
  )
);

const FAILURE_HINTS = {
  timeout: 'timeout|timed out|message timeout|aborterror|aborted'.split('|'),
  unsupported: 'unsupported|not supported|unavailable in this runtime'.split('|'),
  permission:
    'permission denied|permission-denied|access denied|not granted|forbidden|denied'.split('|'),
  validation:
    'documentclone is required|markdown builders are not configured|invalid|missing|malformed|expected|not configured'.split(
      '|'
    ),
  extraction:
    'extraction_content_no_markdown|extraction_selection_no_selection|failed to dispatch clip result'.split(
      '|'
    ),
  write: 'local_vault_write_failed|write failed|save failed'.split('|'),
  connection:
    'offline|network|connection|could not establish connection|receiving end does not exist|extension context invalidated|message port closed|runtime.lasterror|failed to fetch|networkerror'.split(
      '|'
    )
} as const;

interface ReaderExportFailureLike {
  name?: string;
  message?: string;
  code?: string;
  domain?: string;
  userMessage?: string;
  context?: unknown;
  cause?: unknown;
  failureCategory?: unknown;
}

function isFailureCategory(value: unknown): value is FailureCategory {
  return typeof value === 'string' && FAILURE_CATEGORIES.has(value);
}

function isReaderExportFailureLike(error: unknown): error is ReaderExportFailureLike {
  return typeof error === 'object' && error !== null;
}

function collectFailureHints(error: unknown, seen = new Set<unknown>()): string {
  if (error == null || seen.has(error)) {
    return '';
  }
  seen.add(error);
  const hints: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      hints.push(value.trim().toLowerCase());
    }
  };
  if (typeof error === 'string') {
    push(error);
  } else if (error instanceof Error) {
    push(error.name);
    push(error.message);
    push(collectFailureHints((error as Error & { cause?: unknown }).cause, seen));
  } else if (isReaderExportFailureLike(error)) {
    push(error.code);
    push(error.domain);
    push(error.name);
    push(error.message);
    push(error.userMessage);
    if (typeof error.context === 'object' && error.context !== null) {
      const context = error.context as Record<string, unknown>;
      [context.fallbackReason, context.error, context.message, context.reason].forEach(push);
    }
    push(collectFailureHints(error.cause, seen));
  }
  return hints.join('\n');
}

function hasFailureHint(text: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => text.includes(candidate));
}

export function resolveReaderFailureCategory(error: unknown): FailureCategory {
  if (isReaderExportFailureLike(error) && isFailureCategory(error.failureCategory)) {
    return error.failureCategory;
  }

  const failureHints = collectFailureHints(error);

  if (isAppError(error)) {
    if (error.domain === 'classifier') return 'classification';
    if (error.code === 'LOCAL_VAULT_WRITE_FAILED') return 'write';
    if (error.code.includes('TIMEOUT')) return 'timeout';
    if (error.domain === 'rest') {
      return hasFailureHint(failureHints, FAILURE_HINTS.timeout) ? 'timeout' : 'connection';
    }
    if (
      error.domain === 'extraction' &&
      !hasFailureHint(failureHints, FAILURE_HINTS.timeout) &&
      !hasFailureHint(failureHints, FAILURE_HINTS.unsupported) &&
      !hasFailureHint(failureHints, FAILURE_HINTS.permission) &&
      !hasFailureHint(failureHints, FAILURE_HINTS.validation) &&
      !hasFailureHint(failureHints, FAILURE_HINTS.connection)
    ) {
      return 'extraction';
    }
  }
  if (hasFailureHint(failureHints, FAILURE_HINTS.timeout)) return 'timeout';
  if (hasFailureHint(failureHints, FAILURE_HINTS.unsupported)) return 'unsupported';
  if (hasFailureHint(failureHints, FAILURE_HINTS.permission)) return 'permission';
  if (hasFailureHint(failureHints, FAILURE_HINTS.validation)) return 'validation';
  if (hasFailureHint(failureHints, FAILURE_HINTS.write)) return 'write';
  if (hasFailureHint(failureHints, FAILURE_HINTS.connection)) return 'connection';
  if (hasFailureHint(failureHints, FAILURE_HINTS.extraction)) return 'extraction';
  return 'unknown';
}
