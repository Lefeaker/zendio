import { bucketCount, createFeatureTimer } from '../../shared/analytics/featureTimer';
import type { ContentType, CountBucket } from '../../shared/analytics/eventCatalog';
import { isAppError } from '../../shared/errors';
import {
  createAnalyticsEventMessage,
  type AnalyticsRuntimeEventPayload,
  type FailureCategory,
  type UsageEventParamMap
} from '../../shared/types/analytics';
import { isAIChat } from '../detect';
import type {
  ClipAnalyticsSource,
  ClipFlowResult,
  InitClipFlowOptions,
  SelectionPromptLifecycleHandlers
} from './clipFlowTypes';

type ClipAnalyticsEventName =
  | 'clip_started'
  | 'clip_prompt_opened'
  | 'clip_prompt_submitted'
  | 'clip_prompt_cancelled'
  | 'extraction_completed'
  | 'extraction_failed';

interface ClipAnalyticsSessionOptions {
  clipMode: 'full' | 'selection';
  document: Document;
  messaging: Pick<InitClipFlowOptions['messaging'], 'send'>;
  source: ClipAnalyticsSource;
  url: string;
}

export interface ClipAnalyticsSession {
  createSelectionPromptLifecycle(): SelectionPromptLifecycleHandlers;
  emitExtractionCompleted(result: ClipFlowResult): void;
  emitExtractionFailed(error: unknown): void;
  emitStarted(): void;
}

export function createClipAnalyticsSession(
  options: ClipAnalyticsSessionOptions
): ClipAnalyticsSession {
  const { clipMode, document, messaging, source, url } = options;
  const timer = createFeatureTimer();
  const startedContentType = inferStartedContentType(clipMode, url, document);

  return {
    createSelectionPromptLifecycle() {
      return {
        onPromptOpened: () =>
          emitClipAnalyticsEvent(messaging, 'clip_prompt_opened', {
            operation_id: timer.operationId,
            content_type: 'selection'
          }),
        onPromptSubmitted: () =>
          emitClipAnalyticsEvent(messaging, 'clip_prompt_submitted', {
            operation_id: timer.operationId,
            content_type: 'selection'
          }),
        onPromptCancelled: () =>
          emitClipAnalyticsEvent(messaging, 'clip_prompt_cancelled', {
            operation_id: timer.operationId,
            content_type: 'selection'
          })
      };
    },
    emitExtractionCompleted(result) {
      emitClipAnalyticsEvent(messaging, 'extraction_completed', {
        operation_id: timer.operationId,
        content_type: inferCompletedContentType(clipMode, result),
        duration_bucket: timer.durationBucket(),
        ...buildAttachmentCountBucket(result)
      });
    },
    emitExtractionFailed(error) {
      emitClipAnalyticsEvent(messaging, 'extraction_failed', {
        operation_id: timer.operationId,
        content_type: startedContentType,
        failure_category: resolveClipExtractionFailureCategory(error),
        duration_bucket: timer.durationBucket()
      });
    },
    emitStarted() {
      emitClipAnalyticsEvent(messaging, 'clip_started', {
        operation_id: timer.operationId,
        source,
        content_type: startedContentType
      });
    }
  };
}

const FAILURE_HINTS = {
  timeout: 'timeout|timed out|message timeout|aborterror|aborted'.split('|'),
  unsupported:
    'unsupported|not supported|unsupported content|unsupported environment|unavailable in this runtime'.split(
      '|'
    ),
  permission:
    'permission denied|permission-denied|access denied|not granted|forbidden|denied|securityerror|notallowederror'.split(
      '|'
    ),
  validation: 'invalid|missing|malformed|expected|payload|no markdown|no_markdown'.split('|'),
  connection:
    'offline|network|connection|dispatch|failed to send message to background|failed to dispatch|could not establish connection|receiving end does not exist|extension context invalidated|message port closed|runtime.lasterror|failed to fetch|networkerror'.split(
      '|'
    )
} as const;

interface ClipExtractionFailureLike {
  name?: string;
  message?: string;
  code?: string;
  domain?: string;
  userMessage?: string;
  context?: unknown;
  cause?: unknown;
}

function isClipExtractionFailureLike(error: unknown): error is ClipExtractionFailureLike {
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
  } else if (isClipExtractionFailureLike(error)) {
    push(error.code);
    push(error.domain);
    push(error.name);
    push(error.message);
    push(error.userMessage);
    if (typeof error.context === 'object' && error.context !== null) {
      const context = error.context as Record<string, unknown>;
      [context.error, context.message, context.reason, context.fallbackReason].forEach(push);
      push(collectFailureHints(context.cause, seen));
    }
    push(collectFailureHints(error.cause, seen));
  }

  return hints.join('\n');
}

function hasFailureHint(text: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => text.includes(candidate));
}

export function resolveClipExtractionFailureCategory(error: unknown): FailureCategory {
  const failureHints = collectFailureHints(error);

  if (hasFailureHint(failureHints, FAILURE_HINTS.timeout)) {
    return 'timeout';
  }
  if (hasFailureHint(failureHints, FAILURE_HINTS.unsupported)) {
    return 'unsupported';
  }
  if (hasFailureHint(failureHints, FAILURE_HINTS.permission)) {
    return 'permission';
  }
  if (hasFailureHint(failureHints, FAILURE_HINTS.connection)) {
    return 'connection';
  }
  if (hasFailureHint(failureHints, FAILURE_HINTS.validation)) {
    return 'validation';
  }

  if (isAppError(error)) {
    if (error.domain === 'classifier') {
      return 'classification';
    }
    if (error.domain === 'extraction') {
      return 'extraction';
    }
  }

  return 'unknown';
}

function inferStartedContentType(
  clipMode: 'full' | 'selection',
  url: string,
  doc: Document
): ContentType {
  if (clipMode === 'selection') {
    return 'selection';
  }

  try {
    return isAIChat(url, doc) ? 'ai_chat' : 'article';
  } catch {
    return 'other';
  }
}

function inferCompletedContentType(
  clipMode: 'full' | 'selection',
  result: ClipFlowResult
): ContentType {
  if (clipMode === 'selection') {
    return 'selection';
  }

  if (result.type === 'article' || result.type === 'ai_chat') {
    return result.type;
  }

  return 'other';
}

function buildAttachmentCountBucket(result: ClipFlowResult): {
  attachment_count_bucket?: CountBucket;
} {
  const attachments = result.meta?.attachments;
  if (!Array.isArray(attachments)) {
    return {};
  }

  return {
    attachment_count_bucket: bucketCount(attachments.length)
  };
}

function emitClipAnalyticsEvent<EventName extends ClipAnalyticsEventName>(
  messaging: Pick<InitClipFlowOptions['messaging'], 'send'>,
  event: EventName,
  params: UsageEventParamMap[EventName]
): void {
  const payload = createAnalyticsEventMessage(event, params);
  void Promise.resolve(messaging.send(payload as AnalyticsRuntimeEventPayload)).catch(
    () => undefined
  );
}
