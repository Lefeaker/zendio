import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlatformServicesMock = vi.hoisted(() => vi.fn());
const isFirefoxMock = vi.hoisted(() => vi.fn(() => false));
const visibleTabScreenshotMocks = vi.hoisted(() => {
  const chromeCapture = vi.fn();
  const firefoxCapture = vi.fn();
  return {
    chromeCapture,
    firefoxCapture,
    createChromeCapture: vi.fn(() => chromeCapture),
    createFirefoxCapture: vi.fn(() => firefoxCapture)
  };
});
const createAIChatExtractorMock = vi.hoisted(() =>
  vi.fn(() => ({
    id: 'ai.chat',
    priority: 200,
    canHandle: vi.fn().mockResolvedValue(true),
    extract: vi.fn().mockResolvedValue({
      type: 'ai_chat',
      title: 'mock',
      markdown: '',
      assets: [],
      meta: {
        url: 'https://chat.openai.com/chat',
        platform: 'chatgpt',
        messageCount: 0,
        clippedAtISO: '2024-01-01T00:00:00.000Z'
      }
    })
  }))
);
vi.mock('../../../src/platform', async () => {
  const actual =
    await vi.importActual<typeof import('../../../src/platform')>('../../../src/platform');
  return {
    ...actual,
    getPlatformServices: getPlatformServicesMock
  };
});
vi.mock('@content/extractors/aiChatExtractor', () => ({
  createAIChatExtractor: createAIChatExtractorMock
}));
vi.mock('@content/video/videoVisibleTabScreenshot', async () => {
  const actual = await vi.importActual<typeof import('@content/video/videoVisibleTabScreenshot')>(
    '@content/video/videoVisibleTabScreenshot'
  );
  return {
    ...actual,
    createVisibleTabVideoFrameScreenshotCapture: visibleTabScreenshotMocks.createChromeCapture,
    createVisibleTabVideoFrameScreenshotDataUrlCapture:
      visibleTabScreenshotMocks.createFirefoxCapture
  };
});
vi.mock('@shared/utils/browserDetection', async () => {
  const actual = await vi.importActual<typeof import('@shared/utils/browserDetection')>(
    '@shared/utils/browserDetection'
  );
  return {
    ...actual,
    isFirefox: isFirefoxMock
  };
});

import { createDefaultExtractorRegistry } from '@content/extractors/registry';
import { createReaderSessionDependencies } from '@content/reader/sessionDependencies';
import { createVideoPromptDependencies } from '@content/video/videoPromptDependencies';
import {
  createVideoSessionDependencies,
  type VideoSessionPlatformDependencies
} from '@content/video/sessionDependencies';
import { createMemoryStorageService } from '@platform/preview/memoryStorage';
import { repositoryContainer } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';

function createOptionsRepository(): VideoSessionPlatformDependencies['optionsRepository'] {
  return {
    get: vi.fn(() =>
      Promise.reject(new Error('Unexpected options get in dependency factory test'))
    ),
    set: vi.fn(() => Promise.resolve()),
    onChange: vi.fn(() => () => undefined)
  };
}

function createVideoPlatform(
  overrides: Partial<VideoSessionPlatformDependencies> = {}
): VideoSessionPlatformDependencies {
  return {
    optionsRepository: createOptionsRepository(),
    storage: createMemoryStorageService(),
    ...overrides
  };
}

type TestMessageSend = NonNullable<VideoSessionPlatformDependencies['messaging']>['send'];
type TestMessagePayload = Parameters<TestMessageSend>[0];

describe('content dependency factories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFirefoxMock.mockReturnValue(false);
    repositoryContainer.reset();
    repositoryContainer.registerSingleton(DI_TOKENS.IReaderRepository, () => ({
      loadHighlights: vi.fn(),
      saveHighlights: vi.fn(),
      clearHighlights: vi.fn()
    }));
    repositoryContainer.registerSingleton(DI_TOKENS.IVideoRepository, () => ({
      getVideoConfig: vi.fn(),
      savePromptPosition: vi.fn(),
      getPromptPosition: vi.fn(),
      sendVideoClip: vi.fn(),
      onConfigChange: vi.fn(() => () => {})
    }));
  });

  it('does not call getPlatformServices inside reader session factory', () => {
    const platform = {
      optionsRepository: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn(),
        onChange: vi.fn(() => () => undefined)
      },
      storage: { sync: {}, local: {}, session: {} },
      runtime: { getURL: vi.fn((path: string) => path) }
    };
    const dependencies = createReaderSessionDependencies(platform as never, {
      viewFactory: vi.fn() as never,
      createHighlightManager: vi.fn() as never,
      createSelectionController: vi.fn() as never,
      createPanelCoordinator: vi.fn() as never,
      createEnvironmentController: vi.fn() as never,
      createLifecycle: vi.fn() as never,
      exporter: {} as never
    });

    expect(typeof dependencies.optionsRepository.get).toBe('function');
    expect(typeof dependencies.optionsRepository.onChange).toBe('function');
    expect(getPlatformServicesMock).not.toHaveBeenCalled();
  });

  it('does not call getPlatformServices inside video session factory', () => {
    const platform = createVideoPlatform();
    const dependencies = createVideoSessionDependencies(platform);

    expect(typeof dependencies.optionsRepository.get).toBe('function');
    expect(typeof dependencies.optionsRepository.onChange).toBe('function');
    expect(getPlatformServicesMock).not.toHaveBeenCalled();
  });

  it('leaves Chrome video frame capture on the default blob path', () => {
    isFirefoxMock.mockReturnValue(false);
    const platform = createVideoPlatform();

    const dependencies = createVideoSessionDependencies(platform);

    expect(dependencies.captureVideoFrameScreenshot).toBeUndefined();
  });

  it('injects a Firefox-safe video frame capture provider only for Firefox', () => {
    isFirefoxMock.mockReturnValue(true);
    const platform = createVideoPlatform();

    const dependencies = createVideoSessionDependencies(platform);

    expect(dependencies.captureVideoFrameScreenshot).toBeTypeOf('function');
  });

  it('wires Chrome visible-tab screenshots through the existing Blob provider', () => {
    isFirefoxMock.mockReturnValue(false);
    const messaging = {
      send: vi.fn()
    };
    const platform = createVideoPlatform({
      messaging
    });

    const dependencies = createVideoSessionDependencies(platform);

    expect(visibleTabScreenshotMocks.createChromeCapture).toHaveBeenCalledWith({ messaging });
    expect(visibleTabScreenshotMocks.createFirefoxCapture).not.toHaveBeenCalled();
    expect(dependencies.captureVisibleVideoFrameScreenshot).toBe(
      visibleTabScreenshotMocks.chromeCapture
    );
  });

  it('wires Firefox visible-tab screenshots through the data URL provider', () => {
    isFirefoxMock.mockReturnValue(true);
    const messaging = {
      send: vi.fn()
    };
    const platform = createVideoPlatform({
      messaging
    });

    const dependencies = createVideoSessionDependencies(platform);

    expect(visibleTabScreenshotMocks.createChromeCapture).not.toHaveBeenCalled();
    expect(visibleTabScreenshotMocks.createFirefoxCapture).toHaveBeenCalledWith({ messaging });
    expect(dependencies.captureVisibleVideoFrameScreenshot).toBe(
      visibleTabScreenshotMocks.firefoxCapture
    );
  });

  it('wires video screenshot cache through runtime messaging when available', async () => {
    const sentMessages: TestMessagePayload[] = [];
    const cacheResponse = {
      success: true,
      operation: 'save',
      result: {
        status: 'skipped',
        reason: 'invalid-metadata',
        field: 'pageKey'
      }
    };
    const send: TestMessageSend = <TResult = never>(message: TestMessagePayload) => {
      sentMessages.push(message);
      return Promise.resolve(cacheResponse as TResult);
    };
    const storage = createMemoryStorageService();
    const localSet = vi.spyOn(storage.local, 'set');
    const localSetMany = vi.spyOn(storage.local, 'setMany');
    const localRemove = vi.spyOn(storage.local, 'remove');
    const platform = createVideoPlatform({
      storage,
      messaging: { send }
    });
    const dependencies = createVideoSessionDependencies(platform);

    expect(dependencies.screenshotCacheRepository).toBeDefined();
    const blob = new Blob(['frame'], { type: 'image/jpeg' });
    await dependencies.screenshotCacheRepository?.save({
      pageKey: 'unsafe url',
      captureId: 'capture-a',
      screenshot: {
        id: 'shot-a',
        fileName: 'shot-a.jpg',
        mimeType: 'image/jpeg',
        capturedAt: 1,
        content: {
          kind: 'blob',
          blob,
          byteLength: blob.size
        }
      }
    });

    expect(sentMessages).toContainEqual(
      expect.objectContaining({
        type: 'AIIOB_VIDEO_SCREENSHOT_CACHE',
        operation: 'save'
      })
    );
    expect(localSet).not.toHaveBeenCalled();
    expect(localSetMany).not.toHaveBeenCalled();
    expect(localRemove).not.toHaveBeenCalled();
  });

  it('does not call getPlatformServices inside video prompt factory', () => {
    const platform = {
      storage: { sync: {}, local: {}, session: {} },
      runtime: {
        getURL: vi.fn(),
        openOptionsPage: vi.fn(),
        onInstalled: vi.fn(),
        onStartup: vi.fn()
      },
      createVideoSession: vi.fn(() => ({ start: vi.fn() }))
    };
    const dependencies = createVideoPromptDependencies(platform as never);

    expect(dependencies.runtime).toBe(platform.runtime);
    expect(getPlatformServicesMock).not.toHaveBeenCalled();
  });

  it('wires AI chat extractors from the composition root repository', async () => {
    const optionsRepository = {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn(),
      onChange: vi.fn(() => () => undefined)
    };
    const registry = createDefaultExtractorRegistry({
      optionsRepository: optionsRepository as never
    });

    const extractors = await registry.list();
    const aiChatExtractor = extractors.find((extractor) => extractor.id === 'ai.chat');

    expect(createAIChatExtractorMock).toHaveBeenCalledWith({
      optionsRepository
    });
    expect(aiChatExtractor).toBeDefined();
    expect(getPlatformServicesMock).not.toHaveBeenCalled();
  });
});
