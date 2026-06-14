import {
  serializeBlobAttachmentContent,
  serializedAttachmentContentToBlob
} from '../../shared/attachments/clipAttachmentBinary';
import type { StorageAreaService } from '../../platform/interfaces/storage';
import {
  createVideoScreenshotCacheRepository,
  type VideoScreenshotCacheRepositoryOptions
} from '../../content/video/videoScreenshotCacheRepository';
import {
  normalizeVideoScreenshotCacheMessage,
  type SerializedVideoScreenshotCacheScreenshot,
  type VideoScreenshotCacheMessage,
  type VideoScreenshotCacheResponse
} from '../../content/video/videoScreenshotCacheMessages';
import type { VideoCaptureScreenshot } from '../../content/video/types';

export interface BackgroundVideoScreenshotCacheStorage {
  local: StorageAreaService;
}

export type BackgroundVideoScreenshotCacheHandler = (
  message: unknown
) => Promise<VideoScreenshotCacheResponse | undefined>;

function toMessageError(error: unknown): VideoScreenshotCacheResponse {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error)
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

async function serializeScreenshot(
  screenshot: VideoCaptureScreenshot
): Promise<SerializedVideoScreenshotCacheScreenshot> {
  if (screenshot.content?.kind !== 'blob') {
    throw new Error('Screenshot cache load returned missing blob content.');
  }

  return {
    id: screenshot.id,
    fileName: screenshot.fileName,
    mimeType: screenshot.mimeType,
    capturedAt: screenshot.capturedAt,
    content: await serializeBlobAttachmentContent(screenshot.content.blob)
  };
}

export function createBackgroundVideoScreenshotCacheHandler(
  storage: BackgroundVideoScreenshotCacheStorage,
  options: VideoScreenshotCacheRepositoryOptions = {}
): BackgroundVideoScreenshotCacheHandler {
  const repository = createVideoScreenshotCacheRepository(storage.local, options);
  let queue: Promise<void> = Promise.resolve();

  function enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const run = queue.then(operation, operation);
    queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function handleSave(
    message: Extract<VideoScreenshotCacheMessage, { operation: 'save' }>
  ): Promise<VideoScreenshotCacheResponse> {
    let screenshot: VideoCaptureScreenshot;
    try {
      screenshot = deserializeScreenshot(message.input.screenshot);
    } catch (error) {
      return {
        success: true,
        operation: 'save',
        result: {
          status: 'skipped',
          reason: 'serialize-failed',
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }

    const result = await repository.save({
      pageKey: message.input.pageKey,
      captureId: message.input.captureId,
      screenshot
    });
    return {
      success: true,
      operation: 'save',
      result
    };
  }

  async function handleLoad(
    message: Extract<VideoScreenshotCacheMessage, { operation: 'load' }>
  ): Promise<VideoScreenshotCacheResponse> {
    const screenshot = await repository.load(message.ref);
    if (!screenshot) {
      return {
        success: true,
        operation: 'load',
        status: 'missing'
      };
    }

    return {
      success: true,
      operation: 'load',
      status: 'loaded',
      screenshot: await serializeScreenshot(screenshot)
    };
  }

  async function handleMessage(
    message: VideoScreenshotCacheMessage
  ): Promise<VideoScreenshotCacheResponse> {
    switch (message.operation) {
      case 'save':
        return handleSave(message);
      case 'load':
        return handleLoad(message);
      case 'remove':
        await repository.remove(message.ref);
        return { success: true, operation: 'remove' };
      case 'removeMany':
        await repository.removeMany(message.refs);
        return { success: true, operation: 'removeMany' };
      case 'pruneExpired':
        await repository.pruneExpired();
        return { success: true, operation: 'pruneExpired' };
      case 'pruneToLimits':
        await repository.pruneToLimits();
        return { success: true, operation: 'pruneToLimits' };
    }
  }

  return async (rawMessage) => {
    const message = normalizeVideoScreenshotCacheMessage(rawMessage);
    if (!message) {
      return undefined;
    }

    try {
      return await enqueue(() => handleMessage(message));
    } catch (error) {
      return toMessageError(error);
    }
  };
}
