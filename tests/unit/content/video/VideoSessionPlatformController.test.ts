/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeCaptures } from '@content/video/captureStorage';
import { VideoSessionPlatformController } from '@content/video/sessionPlatformController';
import { VideoSessionState } from '@content/video/sessionState';

function createController() {
  const state = new VideoSessionState('gradient');
  const restoreHighlight = vi.fn(() => undefined);
  const dispose = vi.fn();
  const adapter = {
    platform: 'bilibili',
    shouldActivate: vi.fn(() => true),
    resolveSelection: vi.fn(() => null),
    findTextRange: vi.fn(() => null),
    highlight: vi.fn(() => undefined),
    restoreHighlight,
    observeDomChanges: vi.fn(),
    handleMutations: vi.fn(),
    buildTimestampUrl: vi.fn(() => null),
    formatVideoTitle: vi.fn((rawTitle: string) => rawTitle.replace(/_+哔哩哔哩.*/i, '').trim() || null),
    dispose
  };
  const onAdapterChange = vi.fn();
  const ensureCaptureHighlight = vi.fn();
  const loadStoredCaptureData = vi.fn(() => Promise.resolve(undefined));
  const saveCaptureData = vi.fn(() => Promise.resolve(undefined));
  const detectVideoIdentity = vi.fn(() => ({
    platform: 'bilibili' as const,
    videoId: 'BV1xx411c7mD',
    canonicalUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
    storageKey: 'video:test'
  }));
  const createVideoPlatformAdapter = vi.fn(() => adapter as never);

  const controller = new VideoSessionPlatformController({
    doc: document,
    storage: { get: vi.fn(), set: vi.fn() },
    state,
    createPlatformContext: () => ({
      doc: document,
      highlightSelection: vi.fn(),
      decorateHighlight: vi.fn(),
      scheduleFragmentHighlightRestore: vi.fn(),
      getElementByIdDeep: vi.fn(() => null),
      querySelectorDeep: vi.fn(() => null),
      observeWithFragmentObserver: vi.fn(),
      registerShadowSelectionBridge: vi.fn(),
      ensureHighlightStyles: vi.fn()
    }),
    onAdapterChange,
    ensureCaptureHighlight,
    detectVideoIdentity: detectVideoIdentity as never,
    createVideoPlatformAdapter: createVideoPlatformAdapter as never,
    loadStoredCaptureData,
    saveCaptureData
  });

  return {
    controller,
    state,
    adapter,
    ensureCaptureHighlight,
    onAdapterChange,
    loadStoredCaptureData,
    saveCaptureData,
    detectVideoIdentity,
    dispose
  };
}

describe('VideoSessionPlatformController', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<h1>Video Title</h1>';
    document.title = 'Video Title___哔哩哔哩_bilibili';
    vi.clearAllMocks();
  });

  it('handles storage-key missing, unchanged, and changed branches during refresh', async () => {
    const setup = createController();

    setup.detectVideoIdentity.mockReturnValueOnce({
      platform: 'bilibili',
      videoId: null,
      canonicalUrl: document.location.href,
      storageKey: null
    });
    setup.state.captures = [{
      kind: 'timestamp',
      id: 'timestamp-1',
      timeSec: 1,
      comment: '',
      url: 'https://video.example/watch?t=1',
      createdAt: 1
    }];

    await expect(setup.controller.refreshContext()).resolves.toEqual({
      hintState: 'noVideo',
      shouldScheduleFragmentRestore: false
    });
    expect(setup.state.captures).toEqual([]);

    setup.state.storageKey = 'video:test';
    setup.state.captures = [{
      kind: 'timestamp',
      id: 'timestamp-2',
      timeSec: 2,
      comment: '',
      url: 'https://video.example/watch?t=2',
      createdAt: 2
    }];
    setup.detectVideoIdentity.mockReturnValueOnce({
      platform: 'bilibili',
      videoId: 'BV1xx411c7mD',
      canonicalUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
      storageKey: 'video:test'
    });

    await expect(setup.controller.refreshContext()).resolves.toEqual({
      hintState: 'ready',
      shouldScheduleFragmentRestore: false
    });
    expect(setup.loadStoredCaptureData).not.toHaveBeenCalled();

    setup.state.storageKey = 'previous:key';
    setup.detectVideoIdentity.mockReturnValueOnce({
      platform: 'bilibili',
      videoId: 'BV1changed',
      canonicalUrl: 'https://www.bilibili.com/video/BV1changed',
      storageKey: 'video:changed'
    });
    setup.loadStoredCaptureData.mockResolvedValueOnce({
      title: 'Restored Title',
      url: 'https://www.bilibili.com/video/BV1changed',
      entries: serializeCaptures([{
        kind: 'fragment',
        id: 'fragment-1',
        comment: '',
        selectedText: 'Alpha fragment',
        selectedHtml: '<p>Alpha fragment</p>',
        fragmentUrl: 'https://www.bilibili.com/video/BV1changed#:~:text=Alpha',
        createdAt: 3
      }]),
      updatedAt: Date.now()
    });
    setup.adapter.restoreHighlight.mockReturnValueOnce('fragment-wrapper');

    await expect(setup.controller.refreshContext()).resolves.toEqual({
      hintState: 'ready',
      shouldScheduleFragmentRestore: true
    });
    expect(setup.state.videoTitle).toBe('Restored Title');
    expect(setup.state.canonicalUrl).toBe('https://www.bilibili.com/video/BV1changed');
    expect(setup.ensureCaptureHighlight).toHaveBeenCalledWith(expect.objectContaining({ id: 'fragment-1' }));
  });

  it('falls back to a URL-based timestamp when the platform adapter cannot build one', () => {
    const setup = createController();
    setup.controller.updateVideoContext();
    setup.controller.syncPlatformAdapter();

    expect(setup.controller.buildTimestampUrl(135)).toBe('https://www.bilibili.com/video/BV1xx411c7mD?t=135');
    expect(
      VideoSessionPlatformController.buildFallbackTimestampUrl(9, {
        canonicalUrl: '',
        currentUrl: 'not-a-url',
        videoId: null
      })
    ).toBeNull();
  });

  it('uses heading, og:title, and formatted document title in fallback order', () => {
    const setup = createController();
    setup.controller.updateVideoContext();
    setup.controller.syncPlatformAdapter();

    expect(setup.controller.extractVideoTitle()).toBe('Video Title');

    document.body.innerHTML = '';
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:title');
    meta.setAttribute('content', 'OG Video Title');
    document.head.appendChild(meta);
    expect(setup.controller.extractVideoTitle()).toBe('OG Video Title');

    meta.remove();
    document.title = 'Formatted Title___哔哩哔哩_bilibili';
    expect(setup.controller.extractVideoTitle()).toBe('Formatted Title');
  });
});
