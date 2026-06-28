/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import type { PlatformId } from '../../../src/third_party/ai-chat-exporter/types';
import {
  AI_CHAT_PLATFORM_IDENTITIES,
  getAIChatPlatformAliases,
  isAIChatHost,
  normalizeHostname,
  resolveAIChatPlatformByUrl
} from '../../../src/third_party/ai-chat-exporter/platformIdentity';
import {
  getAIChatFallbackTitlePolicy,
  getAIChatProductSurfacePlatforms
} from '../../../src/third_party/ai-chat-exporter/platformProductSurface';

const expectedPlatformIds: readonly PlatformId[] = [
  'chatgpt',
  'claude',
  'copilot',
  'gemini',
  'tongyi',
  'deepseek',
  'kimi',
  'doubao',
  'monica',
  'perplexity'
];

const hostMatrix: ReadonlyArray<[PlatformId, string]> = [
  ['chatgpt', 'https://chatgpt.com/c/123'],
  ['chatgpt', 'https://chat.openai.com/c/123'],
  ['claude', 'https://claude.ai/chat/123'],
  ['copilot', 'https://copilot.microsoft.com/chats/123'],
  ['gemini', 'https://gemini.google.com/app/123'],
  ['tongyi', 'https://tongyi.aliyun.com/qianwen/123'],
  ['tongyi', 'https://www.tongyi.aliyun.com/qianwen/123'],
  ['tongyi', 'https://tongyi.com/chat/123'],
  ['tongyi', 'https://qianwen.com/chat/123'],
  ['tongyi', 'https://www.qianwen.com/chat/123'],
  ['deepseek', 'https://chat.deepseek.com/a/chat/s/123'],
  ['kimi', 'https://kimi.moonshot.cn/chat/123'],
  ['kimi', 'https://www.kimi.com/chat/123'],
  ['doubao', 'https://www.doubao.com/chat/123'],
  ['monica', 'https://monica.im/chat/123'],
  ['perplexity', 'https://www.perplexity.ai/search/123']
];

const expectedProductSurface = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/' },
  { id: 'copilot', label: 'Copilot', url: 'https://copilot.microsoft.com/' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/' },
  { id: 'tongyi', label: 'Tongyi/Qianwen', url: 'https://tongyi.aliyun.com/' },
  { id: 'deepseek', label: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  { id: 'kimi', label: 'Kimi', url: 'https://www.kimi.com/' },
  { id: 'doubao', label: 'Doubao', url: 'https://www.doubao.com/' },
  { id: 'monica', label: 'Monica', url: 'https://monica.im/' },
  { id: 'perplexity', label: 'Perplexity', url: 'https://www.perplexity.ai/' }
] as const;

describe('AI chat platform registry', () => {
  it.each(hostMatrix)('resolves %s host %s', (platformId, url) => {
    expect(resolveAIChatPlatformByUrl(url, document)).toBe(platformId);
    expect(isAIChatHost(url, document)).toBe(true);
  });

  it('does not match AI chat hostnames in query strings', () => {
    expect(
      resolveAIChatPlatformByUrl(
        'https://pubs.rsc.org/en/content/articlelanding/2024/tc/d4tc01327a?utm_source=chatgpt.com',
        document
      )
    ).toBeNull();
    expect(
      isAIChatHost(
        'https://pubs.rsc.org/en/content/articlelanding/2024/tc/d4tc01327a?utm_source=chatgpt.com',
        document
      )
    ).toBe(false);
  });

  it('falls back to document location hostname for invalid URLs', () => {
    const fallbackDocument = new JSDOM('', {
      url: 'https://www.qianwen.com/chat/123'
    }).window.document;

    expect(normalizeHostname('not a url', fallbackDocument)).toBe('www.qianwen.com');
    expect(resolveAIChatPlatformByUrl('not a url', fallbackDocument)).toBe('tongyi');
  });

  it('has exactly one definition per platform id', () => {
    const ids = AI_CHAT_PLATFORM_IDENTITIES.map((definition) => definition.id);

    expect([...ids].sort()).toEqual([...expectedPlatformIds].sort());
    expect(new Set(ids).size).toBe(expectedPlatformIds.length);
  });

  it('derives the Options product surface from canonical platform metadata', () => {
    expect(getAIChatProductSurfacePlatforms()).toEqual(expectedProductSurface);
  });

  it('keeps fallback-title policy in canonical platform metadata', () => {
    expect(getAIChatFallbackTitlePolicy('deepseek')).toEqual({
      kind: 'localized',
      messageKey: 'exportAiChatFallbackTitleDeepseek',
      required: true
    });
    expect(getAIChatFallbackTitlePolicy('kimi')).toEqual({
      kind: 'localized',
      messageKey: 'exportAiChatFallbackTitleKimi',
      required: true
    });
    expect(getAIChatFallbackTitlePolicy('tongyi')).toEqual({
      kind: 'localized',
      messageKey: 'exportAiChatFallbackTitleTongyi',
      required: true
    });
    expect(getAIChatFallbackTitlePolicy('doubao')).toEqual({
      kind: 'neutral',
      title: 'Doubao Chat'
    });
    expect(getAIChatFallbackTitlePolicy('monica')).toEqual({
      kind: 'neutral',
      title: 'Monica Chat'
    });
    expect(getAIChatFallbackTitlePolicy('perplexity')).toBeUndefined();
  });

  it('exposes runtime aliases from the canonical registry', () => {
    const aliases = getAIChatPlatformAliases();

    expect(aliases.get('kimi')).toContain('moonshot');
    expect(aliases.get('perplexity')).toContain('pplx');
    expect(aliases.get('tongyi')).toContain('qianwen');
  });
});
