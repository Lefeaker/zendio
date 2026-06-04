import { normalizeToAppError } from '../../shared/errors';
import {
  bucketCount,
  createFeatureTimer,
  type ContentType,
  type CountBucket
} from '../../shared/analytics';
import {
  createTrackUsageEventMessage,
  type TrackUsageEventPayload,
  type UsageEventParamMap
} from '../../shared/types/analytics';
import { isAIChat } from '../detect';
import type {
  ClipAnalyticsSource,
  ClipFlowHandlers,
  ClipFlowResult,
  InitClipFlowOptions,
  SelectionPromptLifecycleHandlers
} from './clipFlowTypes';
import {
  handleAutoSelectionClip,
  handleModifierKey,
  handlePrimaryMouseDown,
  handleWindowBlur
} from './autoSelectionTrigger';

export type {
  ClipFlowHandlers,
  InitClipFlowOptions,
  VideoSelectionController
} from './clipFlowTypes';

type ClipAnalyticsEventName =
  | 'clip_started'
  | 'clip_prompt_opened'
  | 'clip_prompt_submitted'
  | 'clip_prompt_cancelled'
  | 'extraction_completed';

let queuedClipAnalyticsSource: ClipAnalyticsSource | null = null;

export function queueNextClipAnalyticsSource(source: ClipAnalyticsSource): void {
  queuedClipAnalyticsSource = source;
}

export function initClipFlow(options: InitClipFlowOptions): ClipFlowHandlers {
  const {
    document,
    messaging,
    runtimeState,
    selectionTracker,
    selectionController,
    extractorRegistry,
    showSupportProgress
  } = options;

  async function handleClip(): Promise<void> {
    const url = location.href;
    const doc = document;
    const clipMode = runtimeState.getClipMode();
    const source = consumeQueuedClipAnalyticsSource();
    const timer = createFeatureTimer();
    const startedContentType = inferStartedContentType(clipMode, url, doc);
    if (clipMode !== 'selection') {
      showSupportProgress?.({
        value: 8,
        label: '正在准备网页剪藏'
      });
    }
    emitClipAnalyticsEvent(messaging, 'clip_started', {
      operation_id: timer.operationId,
      source,
      content_type: startedContentType
    });

    try {
      let result: ClipFlowResult | undefined;

      if (clipMode === 'selection') {
        const { prepareSelectionClip } = await import('./clipFlowSelection');
        const promptLifecycle = createSelectionPromptLifecycle(timer.operationId);
        result = await prepareSelectionClip(
          doc,
          url,
          runtimeState,
          selectionTracker,
          selectionController,
          showSupportProgress,
          promptLifecycle
        );
        if (!result) {
          return;
        }
      } else {
        result = await extractorRegistry.extract({ url, document: doc });
      }

      emitClipAnalyticsEvent(messaging, 'extraction_completed', {
        operation_id: timer.operationId,
        content_type: inferCompletedContentType(clipMode, result),
        duration_bucket: timer.durationBucket(),
        ...buildAttachmentCountBucket(result)
      });

      const { sendClipResult } = await import('./clipFlowDispatch');
      await sendClipResult(messaging, result, url);
    } catch (error) {
      const appError = normalizeToAppError(error, {
        code: 'CONTENT_CLIP_FAILURE',
        domain: 'content',
        defaultMessage: 'Clip failed unexpectedly.',
        context: { url, mode: clipMode }
      });
      const { emitClipError } = await import('./clipFlowDispatch');
      await emitClipError(messaging, appError);
    }

    function createSelectionPromptLifecycle(operationId: string): SelectionPromptLifecycleHandlers {
      return {
        onPromptOpened: () =>
          emitClipAnalyticsEvent(messaging, 'clip_prompt_opened', {
            operation_id: operationId,
            content_type: 'selection'
          }),
        onPromptSubmitted: () =>
          emitClipAnalyticsEvent(messaging, 'clip_prompt_submitted', {
            operation_id: operationId,
            content_type: 'selection'
          }),
        onPromptCancelled: () =>
          emitClipAnalyticsEvent(messaging, 'clip_prompt_cancelled', {
            operation_id: operationId,
            content_type: 'selection'
          })
      };
    }
  }

  const handleSelectionChange = (): void => {
    selectionTracker.handleSelectionChange();
  };

  const handleSelectStart = (_event: Event): void => {
    selectionTracker.handleSelectStart();
  };

  return {
    handleClip,
    handleAutoSelectionClip: (event) =>
      handleAutoSelectionClip(
        document,
        runtimeState,
        selectionTracker,
        () => {
          queueNextClipAnalyticsSource(
            runtimeState.isSelectionModifierActive() ? 'shortcut' : 'unknown'
          );
          return handleClip();
        },
        event
      ),
    handleModifierKey: (event) => handleModifierKey(runtimeState, event),
    handleWindowBlur: () => handleWindowBlur(runtimeState),
    handlePrimaryMouseDown: (event) => handlePrimaryMouseDown(runtimeState, event),
    handleSelectionChange,
    handleSelectStart
  };
}

function consumeQueuedClipAnalyticsSource(): ClipAnalyticsSource {
  const source = queuedClipAnalyticsSource ?? 'unknown';
  queuedClipAnalyticsSource = null;
  return source;
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
