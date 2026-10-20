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
    sendVideoClip: vi.fn((_clip: VideoClipData) => Promise.resolve({ success: true }))
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
  it('continues the same prepared Markdown, bytes, timestamp and operation ID without rebuilding', async () => {
    const repository = createRepository();
    const exporter = new VideoSessionExporter(repository);
    const capture = createTimestampCapture('one', 42, {
      comment: 'Frozen note',
      screenshotRequested: true,
      screenshot: createScreenshot('one', 'aaa')
    });
    let prepared: VideoClipData | undefined;
    await exporter.export({
      captures: [capture],
      videoTitle: 'Frozen title',
      canonicalUrl: 'https://video.example/watch',
      videoUrl: 'https://video.example/watch',
      platform: 'youtube',
      messages: DEFAULT_SESSION_MESSAGES,
      storageKey: null,
      operationId: 'op_frozen1',
      exportStartedAt: 1_792_089_599_000,
      onPrepared: (payload) => {
        prepared = payload;
      }
    });
    if (!prepared) throw new Error('Prepared payload was not exposed');
    const first = prepared;
    expect(first.exportStartedAt).toBe(1_792_089_599_000);
    const rebuild = vi.spyOn(exporter, 'buildPayload');
    capture.comment = 'Newer live edit';
    capture.screenshot = createScreenshot('one', 'bbb');
    const progress = {
      operationId: 'op_frozen1',
      planId: 'a'.repeat(64),
      total: 1,
      phase: 'note' as const,
      storageTarget: 'downloads' as const,
      confirmed: [{ id: 'one', outputPath: 'one.jpg' }]
    };
    await exporter.sendPrepared(first, progress);
    expect(rebuild).not.toHaveBeenCalled();
    const resumed = readExportedClip(repository);
    expect(resumed).toEqual({ ...first, attachmentProgress: progress });
    expect(resumed.content).toContain('Frozen note');
    expect(resumed.content).not.toContain('Newer live edit');
    expect(resumed.attachments).toEqual(first.attachments);
  });
  it('freezes capture text while screenshot serialization is awaiting bytes', async () => {
    const repository = createRepository();
    const exporter = new VideoSessionExporter(repository);
    const screenshot = createScreenshot('frozen', 'image');
    if (!screenshot.content) throw new Error('Screenshot content missing');
    let release!: (bytes: ArrayBuffer) => void;
    vi.spyOn(screenshot.content.blob, 'arrayBuffer').mockImplementation(
      () =>
        new Promise<ArrayBuffer>((resolve) => {
          release = resolve;
        })
    );
    const capture = createTimestampCapture('frozen', 42, {
      comment: 'Original note',
      screenshotRequested: true,
      screenshot
    });
    const pending = exporter.export({
      captures: [capture],
      videoTitle: 'Frozen title',
      canonicalUrl: 'https://video.example/watch',
      videoUrl: 'https://video.example/watch',
      platform: 'youtube',
      messages: DEFAULT_SESSION_MESSAGES,
      storageKey: null
    });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    capture.comment = 'Newer live note';
    release(new TextEncoder().encode('image').buffer);
    await pending;
    expect(readExportedClip(repository).content).toContain('Original note');
    expect(readExportedClip(repository).content).not.toContain('Newer live note');
  });

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
    expect(exportedClip.timestampCount).toBe(1);
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

  it('exports Firefox-safe dataUrl screenshots through the existing attachment flow', async () => {
    const repository = createRepository();
    const exporter = new VideoSessionExporter(repository);

    await exporter.export({
      captures: [
        createTimestampCapture('timestamp-firefox', 7, {
          screenshotRequested: true,
          screenshot: {
            id: 'shot-firefox',
            fileName: 'shot-firefox.jpg',
            mimeType: 'image/jpeg',
            capturedAt: 2_000_000_000_001,
            dataUrl: 'data:image/jpeg;base64,ZmlyZWZveA=='
          }
        })
      ],
      videoTitle: 'Firefox Video',
      canonicalUrl: 'https://video.example/watch?v=firefox',
      videoUrl: 'https://video.example/watch?v=firefox',
      platform: 'youtube',
      messages: DEFAULT_SESSION_MESSAGES,
      storageKey: 'video:firefox'
    });

    const exportedClip = readExportedClip(repository);
    expect(exportedClip.content).toContain('![Screenshot](aiob-attachment:shot-firefox)');
    expect(exportedClip.attachments).toEqual([
      {
        id: 'shot-firefox',
        fileName: 'shot-firefox.jpg',
        mimeType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,ZmlyZWZveA=='
      }
    ]);
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
