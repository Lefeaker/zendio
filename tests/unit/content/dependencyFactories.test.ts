import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlatformServicesMock = vi.hoisted(() => vi.fn());
const createAIChatExtractorMock = vi.hoisted(() =>
  vi.fn(() => ({
    id: 'ai.chat',
    priority: 200,
    canHandle: vi.fn(async () => true),
    extract: vi.fn(async () => ({
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
    }))
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

import { createDefaultExtractorRegistry } from '@content/extractors/registry';
import { createReaderSessionDependencies } from '@content/reader/sessionDependencies';
import { createVideoPromptDependencies } from '@content/video/videoPromptDependencies';
import { createVideoSessionDependencies } from '@content/video/sessionDependencies';
import { repositoryContainer } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';

describe('content dependency factories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const platform = {
      optionsRepository: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn(),
        onChange: vi.fn(() => () => undefined)
      },
      storage: { sync: {}, local: {}, session: {} }
    };
    const dependencies = createVideoSessionDependencies(platform as never);

    expect(typeof dependencies.optionsRepository.get).toBe('function');
    expect(typeof dependencies.optionsRepository.onChange).toBe('function');
    expect(getPlatformServicesMock).not.toHaveBeenCalled();
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
