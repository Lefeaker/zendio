import { describe, expect, it } from 'vitest';
import { FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE } from '@content/sessionDrafts';
import type { ExportDestinationMetadata } from '@shared/exportDestination';
import type { VideoCapture, VideoCaptureScreenshot } from '@content/video/types';
import type { VideoScreenshotCacheRef } from '@content/video/videoScreenshotCacheTypes';
import {
  buildVideoSessionDraftPayload,
  createVideoSessionDraftEnvelope,
  deserializeVideoDraftCaptures,
  pickVideoSessionDraftCandidate
} from '@content/video/sessionDrafts';

const BASE_TIME = 2_000_000_000_000;

function createBlobScreenshot(
  id: string,
  fileName: string,
  capturedAt: number
): VideoCaptureScreenshot {
  const blob = new Blob(['frame'], { type: 'image/jpeg' });
  return {
    id,
    fileName,
    mimeType: 'image/jpeg' as const,
    capturedAt,
    content: {
      kind: 'blob' as const,
      blob,
      byteLength: blob.size
    }
  };
}

function createCaptures(): VideoCapture[] {
  return [
    {
      kind: 'timestamp',
      id: 'ts-1',
      timeSec: 42,
      url: 'https://video.example/watch?v=1&t=42',
      comment: 'Marker',
      createdAt: BASE_TIME,
      screenshotRequested: true,
      screenshot: createBlobScreenshot('shot-1', 'video-0m42s.jpg', BASE_TIME + 1)
    },
    {
      kind: 'fragment',
      id: 'frag-1',
      timeSec: 45,
      comment: 'Fragment note',
      selectedText: 'Quoted text',
      selectedHtml: '<p>Quoted text</p>',
      fragmentUrl: 'https://video.example/watch?v=1#:~:text=Quoted%20text',
      createdAt: BASE_TIME + 2
    }
  ];
}

function createScreenshotRef(captureId: string, capturedAt: number): VideoScreenshotCacheRef {
  const id = `shot-${captureId}`;
  return {
    schemaVersion: 1,
    pageKey: 'video-page',
    captureId,
    id,
    key: `aiob.videoScreenshotCache.v1.video-page.${captureId}.${id}`,
    fileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    byteLength: 24,
    capturedAt,
    expiresAt: capturedAt + 60_000
  };
}

describe('videoSessionDrafts', () => {
  it('builds a durable payload that stores screenshot intent only', () => {
    const destination: ExportDestinationMetadata = { kind: 'downloads' };
    const payload = buildVideoSessionDraftPayload({
      captures: createCaptures(),
      commentDrafts: { 'ts-1': 'draft note' },
      destination,
      platform: 'youtube',
      videoId: 'video-1',
      videoTitle: 'Video title',
      videoUrl: 'https://video.example/watch?v=1',
      canonicalUrl: 'https://video.example/watch?v=1'
    });

    expect(payload).toMatchObject({
      mode: 'video',
      platform: 'youtube',
      videoId: 'video-1',
      videoTitle: 'Video title',
      destination: { kind: 'downloads' },
      commentDrafts: { 'ts-1': 'draft note' }
    });
    expect(payload.captures).toEqual([
      expect.objectContaining({
        kind: 'timestamp',
        id: 'ts-1',
        screenshotRequested: true
      }),
      expect.objectContaining({
        kind: 'fragment',
        id: 'frag-1'
      })
    ]);
    expect(JSON.stringify(payload)).not.toContain('data:image/');
    expect(JSON.stringify(payload)).not.toContain('video-0m42s.jpg');
    expect(JSON.stringify(payload)).not.toContain('mimeType');
    expect(JSON.stringify(payload)).not.toContain('byteLength');
    expect(JSON.stringify(payload)).not.toContain('ArrayBuffer');
  });

  it('hydrates captures from draft payloads without reviving screenshot attachments', () => {
    const payload = buildVideoSessionDraftPayload({
      captures: createCaptures(),
      commentDrafts: {},
      platform: 'bilibili',
      videoId: 'BV1xx411c7mD',
      videoTitle: 'Bilibili title',
      videoUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
      canonicalUrl: 'https://www.bilibili.com/video/BV1xx411c7mD'
    });

    const restored = deserializeVideoDraftCaptures(payload.captures, {
      fallbackUrl: payload.videoUrl
    });

    expect(restored).toEqual([
      expect.objectContaining({
        kind: 'timestamp',
        id: 'ts-1',
        timeSec: 42,
        url: 'https://video.example/watch?v=1&t=42',
        screenshotRequested: true
      }),
      expect.objectContaining({
        kind: 'fragment',
        id: 'frag-1',
        selectedText: 'Quoted text'
      })
    ]);
    expect((restored[0] as { screenshot?: unknown }).screenshot).toBeUndefined();
  });

  it('persists only the newest Free capture window and filters comment drafts', () => {
    const captures: VideoCapture[] = Array.from({ length: 25 }, (_, index) => ({
      kind: 'timestamp',
      id: `capture-${index}`,
      timeSec: index,
      url: `https://video.example/watch?v=1&t=${index}`,
      comment: `Marker ${index}`,
      createdAt: BASE_TIME + index,
      screenshotRequested: true,
      screenshotRef: createScreenshotRef(`capture-${index}`, BASE_TIME + 500 + index)
    }));
    const commentDrafts = Object.fromEntries(
      captures.map((capture) => [capture.id, `draft for ${capture.id}`])
    );

    const payload = buildVideoSessionDraftPayload({
      captures,
      commentDrafts,
      platform: 'youtube',
      videoId: 'video-1',
      videoTitle: 'Video title',
      videoUrl: 'https://video.example/watch?v=1',
      canonicalUrl: 'https://video.example/watch?v=1'
    });

    expect(payload.captures).toHaveLength(FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE);
    expect(payload.captures.map((capture) => capture.id)).toEqual(
      Array.from(
        { length: FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE },
        (_, index) => `capture-${index + 5}`
      )
    );
    expect(Object.keys(payload.commentDrafts ?? {})).toEqual(
      payload.captures.map((capture) => capture.id)
    );
    expect(payload.captures.at(-1)).toMatchObject({
      id: 'capture-24',
      screenshotRequested: true,
      screenshotRef: createScreenshotRef('capture-24', BASE_TIME + 524)
    });
    expect(payload.captures[0]).not.toMatchObject({ id: 'capture-0' });
    expect(captures).toHaveLength(25);
    expect(JSON.stringify(payload)).not.toContain('data:image/');
  });

  it('does not persist prepared screenshot bytes as export intent when the timestamp is off', () => {
    const payload = buildVideoSessionDraftPayload({
      captures: [
        {
          kind: 'timestamp',
          id: 'ts-off',
          timeSec: 12,
          url: 'https://video.example/watch?v=1&t=12',
          comment: 'Prepared but off',
          createdAt: BASE_TIME,
          screenshot: createBlobScreenshot('shot-off', 'video-0m12s.jpg', BASE_TIME + 1)
        }
      ],
      commentDrafts: {},
      platform: 'youtube',
      videoId: 'video-1',
      videoTitle: 'Video title',
      videoUrl: 'https://video.example/watch?v=1',
      canonicalUrl: 'https://video.example/watch?v=1'
    });

    expect(payload.captures[0]).not.toHaveProperty('screenshotRequested');
    expect(JSON.stringify(payload)).not.toContain('video-0m12s.jpg');
  });

  it('omits undefined optional fragment fields from durable payloads and hydrated captures', () => {
    const payload = buildVideoSessionDraftPayload({
      captures: [
        {
          kind: 'fragment',
          id: 'frag-no-time',
          comment: 'No timestamp fragment',
          selectedText: 'Quoted text',
          selectedHtml: '<p>Quoted text</p>',
          fragmentUrl: 'https://video.example/watch?v=1#:~:text=Quoted%20text',
          createdAt: BASE_TIME + 3
        }
      ],
      commentDrafts: {},
      platform: 'youtube',
      videoId: 'video-1',
      videoTitle: 'Video title',
      videoUrl: 'https://video.example/watch?v=1',
      canonicalUrl: 'https://video.example/watch?v=1'
    });

    expect(payload.captures[0]).not.toHaveProperty('timeSec');

    const restored = deserializeVideoDraftCaptures(payload.captures, {
      fallbackUrl: payload.videoUrl
    });

    expect(restored[0]).not.toHaveProperty('timeSec');
  });

  it('prefers restorable candidates and preserves exact draft keys for removal', () => {
    const olderRestorable = createVideoSessionDraftEnvelope({
      draftId: 'older-restorable',
      pageUrl: 'https://video.example/watch?v=1',
      pageTitle: 'Older',
      updatedAt: BASE_TIME + 10,
      status: 'restorable',
      payload: buildVideoSessionDraftPayload({
        captures: [],
        commentDrafts: {},
        platform: 'youtube',
        videoId: 'video-1',
        videoTitle: 'Older',
        videoUrl: 'https://video.example/watch?v=1',
        canonicalUrl: 'https://video.example/watch?v=1'
      })
    });
    const newerActive = createVideoSessionDraftEnvelope({
      draftId: 'newer-active',
      pageUrl: 'https://video.example/watch?v=1',
      pageTitle: 'Newer',
      updatedAt: BASE_TIME + 20,
      status: 'active',
      payload: buildVideoSessionDraftPayload({
        captures: [],
        commentDrafts: {},
        platform: 'youtube',
        videoId: 'video-1',
        videoTitle: 'Newer',
        videoUrl: 'https://video.example/watch?v=1',
        canonicalUrl: 'https://video.example/watch?v=1'
      })
    });

    expect(pickVideoSessionDraftCandidate([newerActive, olderRestorable])).toMatchObject({
      draftId: 'older-restorable',
      status: 'restorable'
    });
  });

  it('falls back to the newest active candidate when unload did not mark a draft restorable', () => {
    const olderActive = createVideoSessionDraftEnvelope({
      draftId: 'older-active',
      pageUrl: 'https://video.example/watch?v=1',
      pageTitle: 'Older active',
      updatedAt: BASE_TIME + 10,
      status: 'active',
      payload: buildVideoSessionDraftPayload({
        captures: [],
        commentDrafts: {},
        platform: 'youtube',
        videoId: 'video-1',
        videoTitle: 'Older active',
        videoUrl: 'https://video.example/watch?v=1',
        canonicalUrl: 'https://video.example/watch?v=1'
      })
    });
    const newerActive = createVideoSessionDraftEnvelope({
      draftId: 'newer-active',
      pageUrl: 'https://video.example/watch?v=1',
      pageTitle: 'Newer active',
      updatedAt: BASE_TIME + 20,
      status: 'active',
      payload: buildVideoSessionDraftPayload({
        captures: [],
        commentDrafts: {},
        platform: 'youtube',
        videoId: 'video-1',
        videoTitle: 'Newer active',
        videoUrl: 'https://video.example/watch?v=1',
        canonicalUrl: 'https://video.example/watch?v=1'
      })
    });

    expect(pickVideoSessionDraftCandidate([olderActive, newerActive])).toMatchObject({
      draftId: 'newer-active',
      status: 'active'
    });
  });
});
