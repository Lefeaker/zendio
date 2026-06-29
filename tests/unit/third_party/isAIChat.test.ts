/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { isAIChat } from '@content/detect';

describe('isAIChat', () => {
  it.each([
    ['ChatGPT', 'https://chatgpt.com/c/123'],
    ['legacy ChatGPT', 'https://chat.openai.com/c/123'],
    ['Claude', 'https://claude.ai/chat/123'],
    ['Copilot', 'https://copilot.microsoft.com/chats/123'],
    ['Gemini', 'https://gemini.google.com/app/123'],
    ['Tongyi', 'https://tongyi.aliyun.com/qianwen/123'],
    ['Tongyi alternate', 'https://www.tongyi.aliyun.com/qianwen/123'],
    ['Tongyi short', 'https://tongyi.com/chat/123'],
    ['Qianwen', 'https://www.qianwen.com/chat/123'],
    ['DeepSeek', 'https://chat.deepseek.com/a/chat/s/123'],
    ['legacy Kimi', 'https://kimi.moonshot.cn/chat/123'],
    ['Kimi', 'https://www.kimi.com/chat'],
    ['Doubao', 'https://www.doubao.com/chat/'],
    ['Monica', 'https://monica.im/chat'],
    ['Perplexity', 'https://www.perplexity.ai/search/123']
  ])('detects %s domain as AI chat', (_label, url) => {
    const result = isAIChat(url, document);
    expect(result).toBe(true);
  });

  it('returns false for non-AI sites', () => {
    const result = isAIChat('https://medium.com/some-article', document);
    expect(result).toBe(false);
  });

  it('ignores chatgpt domain appearing in query parameters', () => {
    const result = isAIChat(
      'https://pubs.rsc.org/en/content/articlelanding/2024/tc/d4tc01327a?utm_source=chatgpt.com',
      document
    );
    expect(result).toBe(false);
  });
});
