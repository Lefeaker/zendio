/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { testPlatformHarness } from './setup';

import type { ParseConfig, ParsedResult } from '../../../src/third_party/ai-chat-exporter/types';
import type { buildChatMarkdown } from '@content/formatters/markdown';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
const mockParseChatDOMAsync = vi.fn(
  async (_platform: string, _doc: Document, _config?: ParseConfig): Promise<ParsedResult> => ({
    title: 'Chat Session',
    messages: [
      { id: 'first', role: 'user', md: 'Hello AI', timestamp: '2024-01-01T00:00:00Z' },
      { id: 'second', role: 'assistant', html: '<p>Hi there</p>' }
    ],
    assets: [{ url: 'asset-1' }],
    model: 'gpt-4',
    createdAt: '2024-01-02T00:00:00Z'
  })
);

const mockChatHtmlToMarkdown = vi.fn((_html: string) => 'Hi there');
type BuildChatMarkdownInput = Parameters<typeof buildChatMarkdown>[0];
const mockBuildChatMarkdown = vi.fn((_args: BuildChatMarkdownInput) => '# Chat transcript');
const baseFallbackMessages = {
  exportAiChatFallbackTitleDeepseek: 'Catalog DeepSeek Title',
  exportAiChatFallbackTitleKimi: 'Catalog Kimi Title',
  exportAiChatFallbackTitleTongyi: 'Catalog Tongyi Title'
};

vi.mock('@content/formatters/markdown', () => ({
  buildChatMarkdown: mockBuildChatMarkdown
}));

vi.mock('../../../src/third_party/ai-chat-exporter/runtimeRegistry', () => ({
  parseChatDOMAsync: mockParseChatDOMAsync
}));

vi.mock('../../../src/third_party/ai-chat-exporter/shared/markdown', () => ({
  chatHtmlToMarkdown: mockChatHtmlToMarkdown
}));

describe('extractAIChat', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    testPlatformHarness.configure();
    await testPlatformHarness.storage.sync.set('options', {
      aiChat: { includeTimestamps: true, userName: 'Tester' },
      deepResearch: { pureMode: true }
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  function createOptionsRepository() {
    return {
      get: vi.fn(
        async () =>
          ((await testPlatformHarness.storage.sync.get<StoredOptions>('options')) ??
            {}) as CompleteOptions
      ),
      set: vi.fn(async (options: Partial<CompleteOptions>) => {
        const current =
          (await testPlatformHarness.storage.sync.get<StoredOptions>('options')) ?? {};
        await testPlatformHarness.storage.sync.set('options', { ...current, ...options });
      }),
      onChange: vi.fn(() => () => undefined)
    };
  }

  it('normalizes chat messages and returns formatted markdown', async () => {
    const module = await import('@content/extractors/aiChatExtractor');
    const result = await module.extractAIChat(document, 'https://chat.openai.com/', {
      optionsRepository: createOptionsRepository()
    });

    expect(mockParseChatDOMAsync).toHaveBeenCalledWith(
      'chatgpt',
      document,
      expect.objectContaining({ deepResearch: { pureMode: true } })
    );

    expect(mockBuildChatMarkdown).toHaveBeenCalledTimes(1);
    const firstCall = mockBuildChatMarkdown.mock.calls[0];
    expect(firstCall).toBeDefined();
    const buildArgs = firstCall?.[0];
    if (!buildArgs) {
      throw new Error('Expected buildChatMarkdown to be called with arguments');
    }
    expect(buildArgs.platform).toBe('chatgpt');
    expect(buildArgs.messages[1].text).toBe('Hi there');
    expect(buildArgs.options).toBeDefined();
    expect(buildArgs.options?.userName).toBe('Tester');

    expect(result.type).toBe('ai_chat');
    expect(result.markdown).toBe('# Chat transcript');
    expect(result.meta.platform).toBe('chatgpt');
    expect(result.assets).toEqual([{ url: 'asset-1' }]);
    expect(result.meta.createdAt).toBe('2024-01-02T00:00:00Z');
  });

  it('detects Kimi domains and forwards the correct platform', async () => {
    mockParseChatDOMAsync.mockResolvedValueOnce({
      title: 'Catalog Kimi Title',
      messages: [
        { id: 'u1', role: 'user', md: 'hello kimi', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'a1', role: 'assistant', md: '你好' }
      ],
      assets: [],
      model: 'Kimi K2'
    });

    const module = await import('@content/extractors/aiChatExtractor');
    await module.extractAIChat(document, 'https://www.kimi.com/chat/123', {
      optionsRepository: createOptionsRepository(),
      getMessages: vi.fn(async () => ({
        ...baseFallbackMessages
      }))
    });

    expect(mockParseChatDOMAsync).toHaveBeenCalledWith(
      'kimi',
      document,
      expect.objectContaining({
        deepResearch: { pureMode: true },
        fallbackTitle: 'Catalog Kimi Title'
      })
    );

    const lastCall = mockBuildChatMarkdown.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const kimiArgs = lastCall?.[0];
    if (!kimiArgs) {
      throw new Error('Expected buildChatMarkdown to be called for Kimi platform');
    }
    expect(kimiArgs.platform).toBe('kimi');
  });

  it('detects Qianwen domains and forwards the Tongyi parser platform', async () => {
    const module = await import('@content/extractors/aiChatExtractor');
    await module.extractAIChat(document, 'https://www.qianwen.com/chat/123', {
      optionsRepository: createOptionsRepository(),
      getMessages: vi.fn(async () => ({ ...baseFallbackMessages }))
    });

    expect(mockParseChatDOMAsync).toHaveBeenCalledWith(
      'tongyi',
      document,
      expect.objectContaining({
        deepResearch: { pureMode: true },
        fallbackTitle: 'Catalog Tongyi Title'
      })
    );

    const lastCall = mockBuildChatMarkdown.mock.calls.at(-1);
    expect(lastCall?.[0].platform).toBe('tongyi');
  });

  it('rejects direct extraction for unsupported AI chat platforms', async () => {
    const module = await import('@content/extractors/aiChatExtractor');

    await expect(
      module.extractAIChat(document, 'https://example.com/not-ai-chat', {
        optionsRepository: createOptionsRepository()
      })
    ).rejects.toThrow('Unsupported AI chat platform for https://example.com/not-ai-chat');

    expect(mockParseChatDOMAsync).not.toHaveBeenCalled();
  });

  it('fails fast when a required localized fallback title is missing', async () => {
    const module = await import('@content/extractors/aiChatExtractor');

    await expect(
      module.extractAIChat(document, 'https://www.kimi.com/chat/123', {
        optionsRepository: createOptionsRepository(),
        getMessages: vi.fn(async () => ({
          ...baseFallbackMessages,
          exportAiChatFallbackTitleDeepseek: 'Catalog DeepSeek Title',
          exportAiChatFallbackTitleKimi: '',
          exportAiChatFallbackTitleTongyi: 'Catalog Tongyi Title'
        }))
      })
    ).rejects.toThrow('Missing localized AI chat fallback title for kimi');

    expect(mockParseChatDOMAsync).not.toHaveBeenCalled();
  });

  it('injects English-neutral fallback titles for Doubao and Monica exports', async () => {
    const module = await import('@content/extractors/aiChatExtractor');

    await module.extractAIChat(document, 'https://www.doubao.com/chat/abc', {
      optionsRepository: createOptionsRepository(),
      getMessages: vi.fn(async () => ({ ...baseFallbackMessages }))
    });
    await module.extractAIChat(document, 'https://monica.im/chat/abc', {
      optionsRepository: createOptionsRepository(),
      getMessages: vi.fn(async () => ({ ...baseFallbackMessages }))
    });

    expect(mockParseChatDOMAsync).toHaveBeenNthCalledWith(
      1,
      'doubao',
      document,
      expect.objectContaining({
        deepResearch: { pureMode: true },
        fallbackTitle: 'Doubao Chat'
      })
    );
    expect(mockParseChatDOMAsync).toHaveBeenNthCalledWith(
      2,
      'monica',
      document,
      expect.objectContaining({
        deepResearch: { pureMode: true },
        fallbackTitle: 'Monica Chat'
      })
    );
  });

  it('canHandle filters requests by AI chat hostname', async () => {
    const module = await import('@content/extractors/aiChatExtractor');
    const extractor = module.createAIChatExtractor({
      optionsProvider: {
        get: () => Promise.resolve({} as StoredOptions),
        reset: () => undefined
      },
      now: () => new Date('2024-01-01T00:00:00Z')
    });

    const canHandleChat = await extractor.canHandle({
      url: 'https://chat.openai.com/chat',
      document
    });
    const canHandleArticle = await extractor.canHandle({
      url: 'https://example.com/article',
      document
    });

    expect(canHandleChat).toBe(true);
    expect(canHandleArticle).toBe(false);
  });

  it('does not self-resolve platform services inside aiChatExtractor', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/content/extractors/aiChatExtractor.ts'),
      'utf8'
    );

    expect(source).not.toContain('TOKENS.platformServices');
    expect(source).not.toContain('getService<PlatformServices>');
  });
});
