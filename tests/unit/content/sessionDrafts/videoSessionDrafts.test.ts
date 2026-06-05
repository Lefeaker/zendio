import { describe, expect, it } from 'vitest';
import type { ExportDestinationMetadata } from '@shared/exportDestination';
import type { VideoCapture } from '@content/video/types';
import {
  buildVideoSessionDraftPayload,
  createVideoSessionDraftEnvelope,
  deserializeVideoDraftCaptures,
  pickVideoSessionDraftCandidate
} from '@content/video/sessionDrafts';

const BASE_TIME = 2_000_000_000_000;

function createCaptures(): VideoCapture[] {
  return [
    {
      kind: 'timestamp',
      id: 'ts-1',
      timeSec: 42,
      url: 'https://video.example/watch?v=1&t=42',
      comment: 'Marker',
      createdAt: BASE_TIME,
      screenshot: {
        id: 'shot-1',
        fileName: 'video-0m42s.jpg',
        mimeType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,frame',
        capturedAt: BASE_TIME + 1
      }
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
});
