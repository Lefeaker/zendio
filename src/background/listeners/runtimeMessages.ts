import {
  createClipPipelineDependencies,
  handleClipResult,
  type ClipPipelineDependencies
} from '../pipelines/clipPipeline';
import { handleConnectionTest, handleVaultConnectionTest } from '../pipelines/connectionTest';
import { notifyExtractionError } from '../services/notifications';
import { z } from 'zod';
import {
  isClipErrorMessage,
  isClipResultMessage,
  isTestConnectionMessage,
  isTestVaultConnectionMessage
} from '../../shared/types';
import { ClipPayloadSchema } from '../../shared/schemas';
import { isTrackUsageEventMessage } from '../../shared/types/analytics';
import {
  errorHandler,
  isAppError,
  normalizeToAppError,
  notificationErrors
} from '../../shared/errors';
import { trackUsageEvent } from '../services/analyticsEvents';
import { processClipPayload } from '../application/clipProcessor';
import type { MessagingService } from '../../platform/interfaces/messaging';
import type { TabsService } from '../../platform/interfaces/tabs';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { ClipPayload } from '../../shared/types';
import type { MessagePayload } from '../../platform/interfaces/messaging';
import type { ConnectionTestResult } from '../../shared/types/connection';
import type { ReadingClipData } from '../../shared/repositories/IReaderRepository';
import type { VideoClipData } from '../../shared/repositories/IVideoRepository';

const INVALID_CLIP_PAYLOAD_ERROR = 'Invalid clip payload received.';

const OpenOptionsPageMessageSchema = z.object({
  type: z.literal('openOptionsPage'),
  section: z.string().optional()
});

type OpenOptionsPageMessage = z.infer<typeof OpenOptionsPageMessageSchema>;

function isOpenOptionsPageMessage(message: unknown): message is OpenOptionsPageMessage {
  return OpenOptionsPageMessageSchema.safeParse(message).success;
}

function toConnectionTestPayload(result: ConnectionTestResult): MessagePayload {
  const payload: Record<string, MessagePayload> = {
    success: result.success,
    message: result.message
  };

  if (result.status !== undefined) {
    payload.status = result.status;
  }
  if (result.response !== undefined) {
    payload.response = result.response;
  }
  if (result.error !== undefined) {
    payload.error = result.error;
  }

  return payload;
}

function isRepositoryContentMessage(
  message: unknown,
  type: 'clip' | 'readingClip' | 'videoClip',
  contentField: 'markdown' | 'content'
): message is { data: Record<string, unknown>; type: string } {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as { data?: Record<string, unknown>; type?: unknown };
  return candidate.type === type && typeof candidate.data?.[contentField] === 'string';
}

function toReadingClipPayload(data: ReadingClipData): ClipPayload {
  return {
    markdown: data.content,
    title: data.title,
    type: 'clipper',
    meta: {
      url: data.url,
      readerMode: true,
      exportMode: data.exportMode
    }
  };
}

function toVideoClipPayload(data: VideoClipData): ClipPayload {
  return {
    markdown: data.content,
    title: data.title,
    type: 'video',
    meta: {
      url: data.url || data.videoUrl,
      sourceUrl: data.videoUrl || data.url,
      platform: data.platform,
      ...(data.attachments ? { attachments: data.attachments } : {}),
      ...(data.exportDestination ? { exportDestination: data.exportDestination } : {})
    }
  };
}

function parseClipPayloadForBoundary(payload: unknown): ClipPayload | null {
  const parsed = ClipPayloadSchema.safeParse(payload);
  return parsed.success ? (parsed.data as ClipPayload) : null;
}

async function processRepositoryClipPayload(payload: unknown): Promise<MessagePayload> {
  const parsedPayload = parseClipPayloadForBoundary(payload);
  if (!parsedPayload) {
    return {
      success: false,
      error: INVALID_CLIP_PAYLOAD_ERROR
    };
  }

  try {
    const result = await processClipPayload(parsedPayload);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export interface RuntimeMessageListenerDependencies {
  messaging: Pick<MessagingService, 'addListener'>;
  clipPipeline: ClipPipelineDependencies;
  openOptionsPage(section?: string): Promise<void>;
}

export function createRuntimeMessageListenerDependencies(
  messaging: Pick<MessagingService, 'addListener'>,
  tabs: Pick<TabsService, 'create' | 'sendMessage'>,
  runtime: Pick<RuntimeService, 'getURL'>
): RuntimeMessageListenerDependencies {
  return {
    messaging,
    clipPipeline: createClipPipelineDependencies(tabs),
    async openOptionsPage(section) {
      const optionsUrl = runtime.getURL('options/index.html');
      const normalizedSection = section?.trim();
      const url = normalizedSection ? `${optionsUrl}#${normalizedSection}` : optionsUrl;
      await tabs.create({ url });
    }
  };
}

async function safeNotifyExtraction(message: string): Promise<void> {
  try {
    await notifyExtractionError(message);
  } catch (error) {
    const appError = notificationErrors.dispatchFailed(
      message,
      { channel: 'clipper.error', title: 'notifyExtractionError' },
      { cause: error }
    );
    await errorHandler.handle(appError, { suppressNotifications: true });
  }
}

export function registerRuntimeMessageListener(
  dependencies: RuntimeMessageListenerDependencies
): void {
  dependencies.messaging.addListener(async (message, sender) => {
    // Handle analytics messages before clip result messages so the generic
    // clip branch cannot swallow other payload shapes that also carry `event`.
    if (isTrackUsageEventMessage(message)) {
      await trackUsageEvent(message.event, message.params);
      return;
    }

    if (isRepositoryContentMessage(message, 'clip', 'markdown')) {
      return processRepositoryClipPayload(message.data);
    }

    if (isRepositoryContentMessage(message, 'readingClip', 'content')) {
      return processRepositoryClipPayload(
        toReadingClipPayload(message.data as unknown as ReadingClipData)
      );
    }

    if (isRepositoryContentMessage(message, 'videoClip', 'content')) {
      return processRepositoryClipPayload(
        toVideoClipPayload(message.data as unknown as VideoClipData)
      );
    }

    if (isTestConnectionMessage(message)) {
      return handleConnectionTest(message.rest)
        .then(toConnectionTestPayload)
        .catch((error) => {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: msg,
            message: `连接失败: ${msg}`
          } satisfies MessagePayload;
        });
    }

    if (isTestVaultConnectionMessage(message)) {
      return handleVaultConnectionTest(message)
        .then(toConnectionTestPayload)
        .catch((error) => {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: msg,
            message: `连接失败: ${msg}`
          } satisfies MessagePayload;
        });
    }

    if (isClipErrorMessage(message)) {
      const appError = isAppError(message.error)
        ? message.error
        : normalizeToAppError(message.error, {
            code: 'CONTENT_CLIP_FAILURE',
            domain: 'content',
            defaultMessage: 'Clip failed in content script.'
          });
      await errorHandler.handle(appError, { suppressNotifications: true });
      await safeNotifyExtraction(appError.userMessage ?? appError.message);
      return;
    }

    if (isClipResultMessage(message)) {
      const parsedPayload = parseClipPayloadForBoundary(message.payload);
      if (!parsedPayload) {
        await safeNotifyExtraction(INVALID_CLIP_PAYLOAD_ERROR);
        return;
      }
      await handleClipResult(
        { ...message, payload: parsedPayload },
        sender.tabId,
        dependencies.clipPipeline
      );
      return;
    }

    // 处理打开选项页面的消息
    if (isOpenOptionsPageMessage(message)) {
      try {
        await dependencies.openOptionsPage(message.section);
        return { success: true };
      } catch (error) {
        console.error('Failed to open options page:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    return undefined;
  });
}
