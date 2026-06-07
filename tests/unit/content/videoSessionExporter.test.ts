/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SESSION_MESSAGES,
  type VideoSessionMessages
} from '@content/video/sessionMessages';
import type { VideoCapture } from '@content/video/types';
import { VideoSessionExporter } from '@content/video/videoSessionExporter';
import type { ClipResult } from '@shared/repositories/IClipRepository';
import type { IVideoRepository, VideoClipData } from '@shared/repositories/IVideoRepository';
import {
  resetYamlConfigOverridesStore,
  setYamlConfigOverrides
} from '@shared/state/yamlConfigOverridesStore';

describe('VideoSessionExporter', () => {
  const sendVideoClipMock = vi.fn(
    (_clip: VideoClipData): Promise<ClipResult> => Promise.resolve({ success: true })
  );
  const videoRepository: IVideoRepository = {
    getVideoConfig: vi.fn(),
    savePromptPosition: vi.fn(),
    saveControlBarPreferences: vi.fn(),
    getPromptPosition: vi.fn(),
    sendVideoClip: sendVideoClipMock,
    onConfigChange: vi.fn(() => () => {})
  };

  afterEach(() => {
    sendVideoClipMock.mockClear();
    setYamlConfigOverrides(null);
    resetYamlConfigOverridesStore();
  });

  it('injects custom YAML fields from overrides', () => {
    setYamlConfigOverrides({
      contentTypes: {
        video: {
          customFields: [
            { name: 'video_alias', type: 'text', enabled: true, valuePath: 'title' },
            {
              name: 'video_topics',
              type: 'array',
              enabled: true,
              defaultValue: ['video', 'curated']
            }
          ]
        }
      }
    });
    const exporter = new VideoSessionExporter(videoRepository);
    const now = Date.now();
    const captures: VideoCapture[] = [
      {
        kind: 'timestamp',
        id: 'ts-1',
        timeSec: 30,
        url: 'https://video.example/watch?v=1&t=30s',
        comment: 'Marker',
        createdAt: now - 1000
      },
      {
        kind: 'fragment',
        id: 'frag-1',
        createdAt: now,
        fragmentUrl: 'https://video.example/watch?v=1&t=45s',
        selectedHtml: '<p>Quote</p>',
        selectedText: 'Quote',
        comment: 'Important',
        timeSec: 45
      }
    ];

    const messages: VideoSessionMessages = {
      ...DEFAULT_SESSION_MESSAGES,
      timestampSectionTitle: 'Timestamps',
      fragmentSectionTitle: 'Fragments'
    };

    const payload = exporter.buildPayload({
      captures,
      videoTitle: 'Deep Talk',
      canonicalUrl: 'https://video.example/watch?v=1',
      videoUrl: 'https://video.example/watch?v=1',
      platform: 'youtube',
      messages,
      storageKey: null
    });

    const frontMatter =
      payload.markdown.split('---\n', 2).length > 1
        ? `---\n${payload.markdown.split('---\n', 3)[1]}\n---`
        : '';
    expect(frontMatter).toContain('video_alias: "Deep Talk"');
    expect(frontMatter).toContain('video_topics: ["video", "curated"]');
  });

  it('sends clip via video repository when exporting', async () => {
    const exporter = new VideoSessionExporter(videoRepository);
    const captures: VideoCapture[] = [];
    const messages: VideoSessionMessages = { ...DEFAULT_SESSION_MESSAGES };

    await exporter.export({
      captures,
      videoTitle: 'Example',
      canonicalUrl: 'https://example.com/watch?v=1',
      videoUrl: 'https://example.com/watch?v=1',
      platform: 'youtube',
      messages,
      storageKey: 'video:1',
      exportDestination: { kind: 'downloads' }
    });

    expect(sendVideoClipMock).toHaveBeenCalledTimes(1);
    const firstCall = sendVideoClipMock.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error('sendVideoClip was not invoked');
    }
    const [clipPayload] = firstCall;
    expect(clipPayload.content).toContain('---');
    expect(clipPayload.platform).toBe('youtube');
    expect(clipPayload.videoUrl).toBe('https://example.com/watch?v=1');
    expect(clipPayload.exportDestination).toEqual({ kind: 'downloads' });
    expect(typeof clipPayload.timestamp).toBe('number');
  });

  it('adds current-frame screenshots to markdown and export attachments', async () => {
    const exporter = new VideoSessionExporter(videoRepository);
    const messages: VideoSessionMessages = { ...DEFAULT_SESSION_MESSAGES };
    const screenshot = {
      id: 'shot-1',
      fileName: 'file-20260314100000000.jpg',
      mimeType: 'image/jpeg' as const,
      dataUrl: 'data:image/jpeg;base64,frame',
      capturedAt: 1
    };

    const payload = exporter.buildPayload({
      captures: [
        {
          kind: 'timestamp',
          id: 'ts-1',
          timeSec: 42,
          url: 'https://example.com/watch?t=42',
          comment: 'Frame note',
          createdAt: 1,
          screenshot
        }
      ],
      videoTitle: 'Example',
      canonicalUrl: 'https://example.com/watch',
      videoUrl: 'https://example.com/watch',
      platform: 'youtube',
      messages,
      storageKey: 'video:1'
    });

    expect(payload.markdown).toContain('![Screenshot](aiob-attachment:shot-1)');
    expect(payload.meta.attachments).toEqual([
      {
        id: 'shot-1',
        fileName: 'file-20260314100000000.jpg',
        mimeType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,frame'
      }
    ]);

    await exporter.export({
      captures: [
        {
          kind: 'timestamp',
          id: 'ts-1',
          timeSec: 42,
          url: 'https://example.com/watch?t=42',
          comment: 'Frame note',
          createdAt: 1,
          screenshot
        }
      ],
      videoTitle: 'Example',
      canonicalUrl: 'https://example.com/watch',
      videoUrl: 'https://example.com/watch',
      platform: 'youtube',
      messages,
      storageKey: 'video:1'
    });

    const [clipPayload] = sendVideoClipMock.mock.calls.at(-1) ?? [];
    expect(clipPayload?.attachments).toEqual(payload.meta.attachments);
  });

  it('omits missing requested screenshots without attachments or recapture work', async () => {
    const exporter = new VideoSessionExporter(videoRepository);
    const messages: VideoSessionMessages = { ...DEFAULT_SESSION_MESSAGES };

    const payload = exporter.buildPayload({
      captures: [
        {
          kind: 'timestamp',
          id: 'ts-1',
          timeSec: 42,
          url: 'https://example.com/watch?t=42',
          comment: 'Frame note',
          createdAt: 1,
          screenshotRequested: true
        }
      ],
      videoTitle: 'Example',
      canonicalUrl: 'https://example.com/watch',
      videoUrl: 'https://example.com/watch',
      platform: 'youtube',
      messages,
      storageKey: 'video:1'
    });

    expect(payload.markdown).not.toContain('![Screenshot]');
    expect(payload.meta).not.toHaveProperty('attachments');

    await exporter.export({
      captures: [
        {
          kind: 'timestamp',
          id: 'ts-1',
          timeSec: 42,
          url: 'https://example.com/watch?t=42',
          comment: 'Frame note',
          createdAt: 1,
          screenshotRequested: true
        }
      ],
      videoTitle: 'Example',
      canonicalUrl: 'https://example.com/watch',
      videoUrl: 'https://example.com/watch',
      platform: 'youtube',
      messages,
      storageKey: 'video:1'
    });

    const [clipPayload] = sendVideoClipMock.mock.calls.at(-1) ?? [];
    expect(clipPayload?.attachments).toBeUndefined();
    expect(clipPayload?.content).not.toContain('![Screenshot]');
  });

  it('separates video timestamp entries with blank lines and nests screenshots under each item', () => {
    const exporter = new VideoSessionExporter(videoRepository);
    const messages: VideoSessionMessages = {
      ...DEFAULT_SESSION_MESSAGES,
      timestampSectionTitle: '视频时间点'
    };
    const payload = exporter.buildPayload({
      captures: [
        {
          kind: 'timestamp',
          id: 'ts-1',
          timeSec: 1,
          url: 'https://www.bilibili.com/video/BV1?t=1',
          comment: '好看',
          createdAt: 1,
          screenshot: {
            id: 'shot-1',
            fileName: 'file-20260509202351868.jpg',
            mimeType: 'image/jpeg',
            dataUrl: 'data:image/jpeg;base64,frame',
            capturedAt: 1
          }
        },
        {
          kind: 'timestamp',
          id: 'ts-2',
          timeSec: 10,
          url: 'https://www.bilibili.com/video/BV1?t=10',
          comment: '确实好看',
          createdAt: 2,
          screenshot: {
            id: 'shot-2',
            fileName: 'file-20260509202403524.jpg',
            mimeType: 'image/jpeg',
            dataUrl: 'data:image/jpeg;base64,frame2',
            capturedAt: 2
          }
        },
        {
          kind: 'timestamp',
          id: 'ts-3',
          timeSec: 14,
          url: 'https://www.bilibili.com/video/BV1?t=14',
          comment: '不会呼呼呼',
          createdAt: 3
        }
      ],
      videoTitle: 'Example',
      canonicalUrl: 'https://www.bilibili.com/video/BV1',
      videoUrl: 'https://www.bilibili.com/video/BV1',
      platform: 'bilibili',
      messages,
      storageKey: null
    });

    expect(payload.markdown).toContain(
      [
        '## 视频时间点',
        '',
        '1. [0:01](https://www.bilibili.com/video/BV1?t=1) 好看',
        '\t![Screenshot](aiob-attachment:shot-1)',
        '',
        '2. [0:10](https://www.bilibili.com/video/BV1?t=10) 确实好看',
        '\t![Screenshot](aiob-attachment:shot-2)',
        '',
        '3. [0:14](https://www.bilibili.com/video/BV1?t=14) 不会呼呼呼'
      ].join('\n')
    );
  });

  it('falls back to the unknown-platform defaults and empty canonical url handling', () => {
    const exporter = new VideoSessionExporter(videoRepository);
    const payload = exporter.buildPayload({
      captures: [
        {
          kind: 'fragment',
          id: 'frag-plain',
          createdAt: 1,
          fragmentUrl: 'https://video.example/watch?v=1&t=45s',
          selectedHtml: '<p></p>',
          selectedText: '   ',
          comment: 'Note',
          timeSec: 45
        }
      ],
      videoTitle: '',
      canonicalUrl: '',
      videoUrl: '',
      platform: 'unknown',
      messages: { ...DEFAULT_SESSION_MESSAGES, fragmentSectionTitle: 'Fragments' },
      storageKey: null
    });

    expect(payload.title).toBe('Video Capture');
    expect(payload.markdown).toContain('## Fragments');
    expect(payload.markdown).toContain('## Fragments');
    expect(payload.markdown).toContain('[^1]: Note');
    expect(payload.markdown).not.toContain('[empty]');
    expect(payload.meta.url).toBe('');
    expect(payload.meta.domain).toBe('');
  });

  it('maps unknown platform to other and falls back to raw video url', async () => {
    const exporter = new VideoSessionExporter(videoRepository);
    await exporter.export({
      captures: [],
      videoTitle: '',
      canonicalUrl: '',
      videoUrl: 'https://example.com/watch?v=2',
      platform: 'unknown',
      messages: { ...DEFAULT_SESSION_MESSAGES },
      storageKey: null
    });

    const [clipPayload] = sendVideoClipMock.mock.calls.at(-1) ?? [];
    if (!clipPayload) {
      throw new Error('expected exported clip payload');
    }
    expect(clipPayload.platform).toBe('other');
    expect(clipPayload.url).toBe('https://example.com/watch?v=2');
    expect(clipPayload.title).toBe('Video Capture');
  });
});
