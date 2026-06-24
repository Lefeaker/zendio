import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import {
  parseChatDOMAsync,
  resolveParserAsync
} from '../../../src/third_party/ai-chat-exporter/runtimeRegistry';
import { DEFAULT_CHAT_TITLE } from '../../../src/third_party/ai-chat-exporter/shared/constants';

describe('runtime AI chat parser registry', () => {
  it('uses a consolidated lazy parser module instead of per-platform dynamic imports', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/third_party/ai-chat-exporter/runtimeRegistry.ts'),
      'utf8'
    );

    expect(source).toContain('./runtimePlatformParsers');
    expect(source).not.toMatch(/import\(['"]\.\/platforms\//);
  });

  it('keeps the AI chat extractor off the parser-bound public parse entrypoint', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/content/extractors/aiChatExtractor.ts'),
      'utf8'
    );

    expect(source).not.toContain('../../third_party/ai-chat-exporter/parse');
  });

  it.each([
    ['chatgpt', 'chatgpt'],
    ['claude', 'claude'],
    ['copilot', 'copilot'],
    ['gemini', 'gemini'],
    ['tongyi', 'tongyi'],
    ['deepseek', 'deepseek'],
    ['kimi', 'kimi'],
    ['moonshot', 'kimi'],
    ['doubao', 'doubao'],
    ['monica', 'monica'],
    ['perplexity', 'perplexity'],
    ['pplx', 'perplexity'],
    ['qianwen', 'tongyi']
  ])('resolves %s to the %s parser', async (platform, expectedId) => {
    await expect(resolveParserAsync(platform)).resolves.toMatchObject({ id: expectedId });
  });

  it('derives aliases from the canonical platform registry', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/third_party/ai-chat-exporter/runtimeRegistry.ts'),
      'utf8'
    );

    expect(source).toContain('getAIChatPlatformAliases');
    expect(source).not.toContain('parserAliases');
  });

  it('returns undefined for unsupported platforms', async () => {
    await expect(resolveParserAsync('unknown')).resolves.toBeUndefined();
  });

  it('keeps unknown platforms on the empty parse result path', async () => {
    const dom = new JSDOM('<main>No supported AI chat here</main>');

    await expect(parseChatDOMAsync('unknown', dom.window.document)).resolves.toMatchObject({
      title: DEFAULT_CHAT_TITLE,
      messages: [],
      assets: [],
      diagnostics: [{ code: 'parser_not_found', severity: 'warning' }]
    });
  });
});
