/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest';
import { VideoSessionExporter } from '@content/video/videoSessionExporter';
import { DEFAULT_SESSION_MESSAGES } from '@content/video/sessionMessages';
import { serializedAttachmentContentToBlob } from '@shared/attachments/clipAttachmentBinary';
import type { IVideoRepository, VideoClipData } from '@shared/repositories/IVideoRepository';
import type { VideoCaptureScreenshot, VideoTimestampCapture } from '@content/video/types';

function createScreenshot(
  id: string,
  content: string,
  capturedAt = 2_000_000_000_000
): VideoCaptureScreenshot {
  const blob = new Blob([content], { type: 'image/jpeg' });
  return {
    id,
    fileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    capturedAt,
    content: {
      kind: 'blob',
      blob,
      byteLength: blob.size
    }
  };
}

function createTimestampCapture(
  id: string,
  timeSec: number,
  overrides: Partial<VideoTimestampCapture> = {}
): VideoTimestampCapture {
  return {
    kind: 'timestamp',
    id,
    timeSec,
    url: `https://video.example/watch?t=${timeSec}`,
    comment: '',
    createdAt: timeSec,
    ...overrides
  };
}

function createRepository() {
  return {
    sendVideoClip: vi.fn(async (_clip: VideoClipData) => ({ success: true }))
  } as unknown as IVideoRepository & {
    sendVideoClip: ReturnType<typeof vi.fn>;
  };
}

function readExportedClip(repository: ReturnType<typeof createRepository>): VideoClipData & {
  attachments?: NonNullable<VideoClipData['attachments']>;
} {
  const call = repository.sendVideoClip.mock.calls.at(-1);
  expect(call).toBeDefined();
  if (!call) {
    throw new Error('expected sendVideoClip to be called');
  }
  return call[0] as VideoClipData & {
    attachments?: NonNullable<VideoClipData['attachments']>;
  };
}

describe('VideoSessionExporter', () => {
  it('exports live screenshot captures through the binary attachment flow', async () => {
    const repository = createRepository();
    const exporter = new VideoSessionExporter(repository);

    await exporter.export({
      captures: [
        createTimestampCapture('timestamp-live', 42, {
          screenshotRequested: true,
          screenshot: createScreenshot('shot-live', 'frame-live')
        })
      ],
      videoTitle: 'Video Title',
      canonicalUrl: 'https://video.example/watch?v=live',
      videoUrl: 'https://video.example/watch?v=live',
      platform: 'bilibili',
      messages: DEFAULT_SESSION_MESSAGES,
      storageKey: 'video:test'
    });

    const exportedClip = readExportedClip(repository);
    expect(exportedClip.attachments).toHaveLength(1);
    expect(exportedClip.content).toContain('![Screenshot](aiob-attachment:shot-live)');
    expect(exportedClip.attachments?.[0]).toMatchObject({
      id: 'shot-live',
      fileName: 'shot-live.jpg',
      mimeType: 'image/jpeg'
    });
    expect(exportedClip.attachments?.[0]).not.toHaveProperty('dataUrl');

    const attachment = exportedClip.attachments?.[0];
    if (!attachment || !('content' in attachment)) {
      throw new Error('expected binary screenshot attachment');
    }

    const restoredBlob = serializedAttachmentContentToBlob(
      {
        kind: 'base64',
        binary: attachment.content
      },
      attachment.mimeType
    );
    await expect(restoredBlob.text()).resolves.toBe('frame-live');
  });

  it('filters missing requested screenshots while keeping live screenshot attachments exportable', async () => {
    const repository = createRepository();
    const exporter = new VideoSessionExporter(repository);

    await exporter.export({
      captures: [
        createTimestampCapture('timestamp-missing', 12, {
          screenshotRequested: true
        }),
        createTimestampCapture('timestamp-live', 42, {
          screenshotRequested: true,
          screenshot: createScreenshot('shot-live', 'frame-live')
        })
      ],
      videoTitle: 'Video Title',
      canonicalUrl: 'https://video.example/watch?v=mixed',
      videoUrl: 'https://video.example/watch?v=mixed',
      platform: 'bilibili',
      messages: DEFAULT_SESSION_MESSAGES,
      storageKey: 'video:test'
    });

    const exportedClip = readExportedClip(repository);
    expect(exportedClip.attachments).toHaveLength(1);
    expect(exportedClip.attachments?.[0]).toMatchObject({ id: 'shot-live' });
    expect((exportedClip.content.match(/aiob-attachment:/gu) ?? []).length).toBe(1);
    expect(exportedClip.content).toContain('[0:12](https://video.example/watch?t=12)');
    expect(exportedClip.content).toContain('[0:42](https://video.example/watch?t=42)');
  });
});
