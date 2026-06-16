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

  it('resolves direct platform ids and aliases through the runtime registry', async () => {
    await expect(resolveParserAsync('chatgpt')).resolves.toMatchObject({ id: 'chatgpt' });
    await expect(resolveParserAsync('moonshot')).resolves.toMatchObject({ id: 'kimi' });
    await expect(resolveParserAsync('pplx')).resolves.toMatchObject({ id: 'perplexity' });
  });

  it('keeps unknown platforms on the empty parse result path', async () => {
    const dom = new JSDOM('<main>No supported AI chat here</main>');

    await expect(parseChatDOMAsync('unknown', dom.window.document)).resolves.toMatchObject({
      title: DEFAULT_CHAT_TITLE,
      messages: [],
      assets: []
    });
  });
});
