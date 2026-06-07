import { bucketCount, createFeatureTimer } from '../../shared/analytics/featureTimer';
import type { ContentType, CountBucket } from '../../shared/analytics/eventCatalog';
import {
  createTrackUsageEventMessage,
  type TrackUsageEventPayload,
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
  | 'extraction_completed';

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
  emitStarted(): void;
}

export function createClipAnalyticsSession(
  options: ClipAnalyticsSessionOptions
): ClipAnalyticsSession {
  const { clipMode, document, messaging, source, url } = options;
  const timer = createFeatureTimer();

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
    emitStarted() {
      emitClipAnalyticsEvent(messaging, 'clip_started', {
        operation_id: timer.operationId,
        source,
        content_type: inferStartedContentType(clipMode, url, document)
      });
    }
  };
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
  const payload = createTrackUsageEventMessage(event, params);
  void Promise.resolve(messaging.send(payload as TrackUsageEventPayload)).catch(() => undefined);
}
