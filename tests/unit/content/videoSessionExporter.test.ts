/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SESSION_MESSAGES, type VideoSessionMessages } from '@content/video/sessionMessages';
import type { VideoCapture } from '@content/video/types';
import { VideoSessionExporter } from '@content/video/videoSessionExporter';
import type { ClipResult } from '@shared/repositories/IClipRepository';
import type { IVideoRepository, VideoClipData } from '@shared/repositories/IVideoRepository';
import {
  resetYamlConfigOverridesStore,
  setYamlConfigOverrides
} from '@shared/state/yamlConfigOverridesStore';

describe('VideoSessionExporter', () => {
  const sendVideoClipMock = vi.fn((_clip: VideoClipData): Promise<ClipResult> =>
    Promise.resolve({ success: true })
  );
  const videoRepository: IVideoRepository = {
    getVideoConfig: vi.fn(),
    savePromptPosition: vi.fn(),
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
            { name: 'video_topics', type: 'array', enabled: true, defaultValue: ['video', 'curated'] }
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

    const frontMatter = payload.markdown.split('---\n', 2).length > 1
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
      storageKey: 'video:1'
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
    expect(typeof clipPayload.timestamp).toBe('number');
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
    expect(clipPayload.platform).toBe('other');
    expect(clipPayload.url).toBe('https://example.com/watch?v=2');
    expect(clipPayload.title).toBe('Video Capture');
  });
});
