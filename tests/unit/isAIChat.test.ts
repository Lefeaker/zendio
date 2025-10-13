/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { isAIChat } from '../../src/content/detect';

describe('isAIChat', () => {
  it('detects ChatGPT domain as AI chat', () => {
    const result = isAIChat('https://chat.openai.com/', document);
    expect(result).toBe(true);
  });

  it('detects legacy Kimi domain as AI chat', () => {
    const result = isAIChat('https://kimi.moonshot.cn/chat/123', document);
    expect(result).toBe(true);
  });

  it('detects www.kimi.com as AI chat', () => {
    const result = isAIChat('https://www.kimi.com/chat', document);
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
