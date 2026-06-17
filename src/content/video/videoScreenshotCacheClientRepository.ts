import {
  serializeBlobAttachmentContent,
  serializedAttachmentContentToBlob
} from '../../shared/attachments/clipAttachmentBinary';
import type { MessagingService } from '../../platform/interfaces/messaging';
import type { VideoCaptureScreenshot } from './types';
import type {
  VideoScreenshotCacheRepository,
  VideoScreenshotCacheSaveInput,
  VideoScreenshotCacheSaveResult
} from './videoScreenshotCacheRepository';
import {
  VIDEO_SCREENSHOT_CACHE_MESSAGE,
  type SerializedVideoScreenshotCacheScreenshot,
  type VideoScreenshotCacheMessage,
  type VideoScreenshotCacheResponse
} from './videoScreenshotCacheMessages';
import type { VideoScreenshotCacheRef } from './videoScreenshotCacheTypes';

export interface VideoScreenshotCacheClientRepositoryOptions {
  messaging: Pick<MessagingService, 'send'>;
}

function hasBlobContent(
  screenshot: VideoCaptureScreenshot
): screenshot is VideoCaptureScreenshot & {
  content: NonNullable<VideoCaptureScreenshot['content']>;
} {
  return screenshot.content?.kind === 'blob';
}

function errorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : error;
}

function messageFailure(error: Error | string): VideoScreenshotCacheSaveResult {
  return {
    status: 'skipped',
    reason: 'serialize-failed',
    error: errorMessage(error)
  };
}

function isVideoScreenshotCacheResponse(
  value: VideoScreenshotCacheResponse | object | null | undefined
): value is VideoScreenshotCacheResponse {
  return typeof value === 'object' && value !== null && 'success' in value;
}

async function serializeScreenshot(
  screenshot: VideoCaptureScreenshot & {
    content: NonNullable<VideoCaptureScreenshot['content']>;
  }
): Promise<SerializedVideoScreenshotCacheScreenshot> {
  return {
    id: screenshot.id,
    fileName: screenshot.fileName,
    mimeType: screenshot.mimeType,
    capturedAt: screenshot.capturedAt,
    content: await serializeBlobAttachmentContent(screenshot.content.blob)
  };
}

function deserializeScreenshot(
  screenshot: SerializedVideoScreenshotCacheScreenshot
): VideoCaptureScreenshot {
  const blob = serializedAttachmentContentToBlob(
    {
      kind: 'base64',
      binary: screenshot.content
    },
    screenshot.mimeType
  );

  return {
    id: screenshot.id,
    fileName: screenshot.fileName,
    mimeType: screenshot.mimeType,
    capturedAt: screenshot.capturedAt,
    content: {
      kind: 'blob',
      blob,
      byteLength: screenshot.content.byteLength
    }
  };
}

export function createVideoScreenshotCacheClientRepository({
  messaging
}: VideoScreenshotCacheClientRepositoryOptions): VideoScreenshotCacheRepository {
  async function send(message: VideoScreenshotCacheMessage): Promise<VideoScreenshotCacheResponse> {
    const response = await messaging.send<VideoScreenshotCacheResponse>(message);
    if (!isVideoScreenshotCacheResponse(response)) {
      return {
        success: false,
        error: 'VIDEO_SCREENSHOT_CACHE_INVALID_RESPONSE'
      };
    }
    return response;
  }

  async function sendMutation(message: VideoScreenshotCacheMessage): Promise<void> {
    const response = await send(message);
    if (!response.success) {
      throw new Error(response.error);
    }
    if (response.operation !== message.operation) {
      throw new Error(`Unexpected ${message.operation} response.`);
    }
  }

  return {
    async save(input: VideoScreenshotCacheSaveInput): Promise<VideoScreenshotCacheSaveResult> {
      if (!hasBlobContent(input.screenshot)) {
        return {
          status: 'skipped',
          reason: 'missing-blob-content'
        };
      }

      let screenshot: SerializedVideoScreenshotCacheScreenshot;
      try {
        screenshot = await serializeScreenshot(input.screenshot);
      } catch (error) {
        return messageFailure(error instanceof Error ? error : String(error));
      }

      try {
        const response = await send({
          type: VIDEO_SCREENSHOT_CACHE_MESSAGE,
          operation: 'save',
          input: {
            pageKey: input.pageKey,
            captureId: input.captureId,
            screenshot
          }
        });

        if (response.success && response.operation === 'save') {
          return response.result;
        }
        return messageFailure(response.success ? 'Unexpected save response.' : response.error);
      } catch (error) {
        return messageFailure(error instanceof Error ? error : String(error));
      }
    },

    async load(ref: VideoScreenshotCacheRef): Promise<VideoCaptureScreenshot | null> {
      try {
        const response = await send({
          type: VIDEO_SCREENSHOT_CACHE_MESSAGE,
          operation: 'load',
          ref
        });
        if (!response.success || response.operation !== 'load' || response.status !== 'loaded') {
          return null;
        }
        return deserializeScreenshot(response.screenshot);
      } catch {
        return null;
      }
    },

    remove(ref: VideoScreenshotCacheRef): Promise<void> {
      return sendMutation({
        type: VIDEO_SCREENSHOT_CACHE_MESSAGE,
        operation: 'remove',
        ref
      });
    },

    removeMany(refs: readonly VideoScreenshotCacheRef[]): Promise<void> {
      return sendMutation({
        type: VIDEO_SCREENSHOT_CACHE_MESSAGE,
        operation: 'removeMany',
        refs: [...refs]
      });
    },

    pruneExpired(): Promise<void> {
      return sendMutation({
        type: VIDEO_SCREENSHOT_CACHE_MESSAGE,
        operation: 'pruneExpired'
      });
    },

    pruneToLimits(): Promise<void> {
      return sendMutation({
        type: VIDEO_SCREENSHOT_CACHE_MESSAGE,
        operation: 'pruneToLimits'
      });
    }
  };
}
