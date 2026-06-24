/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import type { PlatformId } from '../../../src/third_party/ai-chat-exporter/types';
import {
  AI_CHAT_PLATFORM_DEFINITIONS,
  getAIChatPlatformAliases,
  isAIChatHost,
  normalizeHostname,
  resolveAIChatPlatformByUrl
} from '../../../src/third_party/ai-chat-exporter/platformRegistry';

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
    const ids = AI_CHAT_PLATFORM_DEFINITIONS.map((definition) => definition.id);

    expect([...ids].sort()).toEqual([...expectedPlatformIds].sort());
    expect(new Set(ids).size).toBe(expectedPlatformIds.length);
  });

  it('exposes runtime aliases from the canonical registry', () => {
    const aliases = getAIChatPlatformAliases();

    expect(aliases.get('kimi')).toContain('moonshot');
    expect(aliases.get('perplexity')).toContain('pplx');
    expect(aliases.get('tongyi')).toContain('qianwen');
  });
});
