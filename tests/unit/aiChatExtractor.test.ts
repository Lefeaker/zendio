/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { ParseConfig, ParsedResult } from '../../src/third_party/ai-chat-exporter/types';
import type { buildChatMarkdown } from '../../src/content/formatters/markdown';
const mockParseChatDOM = vi.fn((platform: string, doc: Document, config?: ParseConfig): ParsedResult => ({
  title: 'Chat Session',
  messages: [
    { id: 'first', role: 'user', md: 'Hello AI', timestamp: '2024-01-01T00:00:00Z' },
    { id: 'second', role: 'assistant', html: '<p>Hi there</p>' }
  ],
  assets: [{ url: 'asset-1' }],
  model: 'gpt-4',
  createdAt: '2024-01-02T00:00:00Z'
}));

const mockChatHtmlToMarkdown = vi.fn((html: string) => 'Hi there');
type BuildChatMarkdownInput = Parameters<typeof buildChatMarkdown>[0];
const mockBuildChatMarkdown = vi.fn((args: BuildChatMarkdownInput) => '# Chat transcript');

vi.mock('../../src/content/formatters/markdown', () => ({
  buildChatMarkdown: mockBuildChatMarkdown
}));

vi.mock('../../src/third_party/ai-chat-exporter/parse', () => ({
  parseChatDOM: mockParseChatDOM,
  chatHtmlToMarkdown: mockChatHtmlToMarkdown
}));

const storageGetMock = vi.fn();
const storageOnChangedAddListenerMock = vi.fn();
const storageOnChangedRemoveListenerMock = vi.fn();

describe('extractAIChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageGetMock.mockResolvedValue({
      options: {
        aiChat: { includeTimestamps: true, userName: 'Tester' },
        deepResearch: { pureMode: true }
      }
    });
    const storageOnChanged = {
      addListener: storageOnChangedAddListenerMock,
      removeListener: storageOnChangedRemoveListenerMock,
      hasListener: vi.fn(),
      hasListeners: vi.fn()
    } as unknown as typeof chrome.storage.onChanged;
    globalThis.chrome = {
      storage: {
        sync: {
          get: storageGetMock as unknown as typeof chrome.storage.sync.get
        },
        onChanged: storageOnChanged
      }
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    storageGetMock.mockReset();
    storageOnChangedAddListenerMock.mockReset();
    storageOnChangedRemoveListenerMock.mockReset();
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'chrome');
  });

  it('normalizes chat messages and returns formatted markdown', async () => {
    const module = await import('../../src/content/extractors/aiChatExtractor');
    module.__resetAIChatOptionsCacheForTests?.();
    const result = await module.extractAIChat(document, 'https://chat.openai.com/');

    expect(mockParseChatDOM).toHaveBeenCalledWith(
      'chatgpt',
      document,
      expect.objectContaining({ deepResearch: { pureMode: true } })
    );

    expect(mockBuildChatMarkdown).toHaveBeenCalledTimes(1);
    const firstCall = mockBuildChatMarkdown.mock.calls[0];
    expect(firstCall).toBeDefined();
    const buildArgs = firstCall?.[0] as BuildChatMarkdownInput | undefined;
    if (!buildArgs) {
      throw new Error('Expected buildChatMarkdown to be called with arguments');
    }
    expect(buildArgs.platform).toBe('chatgpt');
    expect(buildArgs.messages[1].text).toBe('Hi there');
    expect(buildArgs.options.userName).toBe('Tester');

    expect(result.type).toBe('ai_chat');
    expect(result.markdown).toBe('# Chat transcript');
    expect(result.meta.platform).toBe('chatgpt');
    expect(result.assets).toEqual([{ url: 'asset-1' }]);
    expect(result.meta.createdAt).toBe('2024-01-02T00:00:00Z');
  });

  it('detects Kimi domains and forwards the correct platform', async () => {
    mockParseChatDOM.mockReturnValueOnce({
      title: 'Kimi Chat',
      messages: [
        { id: 'u1', role: 'user', md: 'hello kimi', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'a1', role: 'assistant', md: '你好' }
      ],
      assets: [],
      model: 'Kimi K2'
    });

    const module = await import('../../src/content/extractors/aiChatExtractor');
    module.__resetAIChatOptionsCacheForTests?.();
    await module.extractAIChat(document, 'https://www.kimi.com/chat/123');

    expect(mockParseChatDOM).toHaveBeenCalledWith(
      'kimi',
      document,
      expect.objectContaining({ deepResearch: { pureMode: true } })
    );

    const lastCall = mockBuildChatMarkdown.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const kimiArgs = lastCall?.[0] as BuildChatMarkdownInput | undefined;
    if (!kimiArgs) {
      throw new Error('Expected buildChatMarkdown to be called for Kimi platform');
    }
    expect(kimiArgs.platform).toBe('kimi');
  });
});
