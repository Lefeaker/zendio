/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

describe('monica parser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty result when no Monica messages exist', async () => {
    const { monicaParser } =
      await import('../../../src/third_party/ai-chat-exporter/platforms/monica');
    const doc = new DOMParser().parseFromString(
      '<html><head><title>Blank - Monica</title></head><body></body></html>',
      'text/html'
    );
    const result = monicaParser.parse(doc);

    expect(result.title).toBe('Conversation');
    expect(result.messages).toEqual([]);
  });

  it('filters invalid model candidates, extracts valid assistant models, and removes toolbar copy', async () => {
    const { monicaParser } =
      await import('../../../src/third_party/ai-chat-exporter/platforms/monica');
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title> - Monica</title></head>
        <body>
          <div class="chat-message-- chat-question">
            <div class="reply-header"><span>This candidate sentence is way too long to be a model name</span></div>
            <article>User body</article>
          </div>
          <div class="chat-message--">
            <div class="reply-header"><span>Claude: noisy</span></div>
            <div data-lexical-editor="true"><span>Assistant lexical body</span><button>Copy</button><svg></svg></div>
          </div>
          <div class="chat-message-- chat-reply">
            <header><span>Monica Pro</span></header>
            <pre>Code block reply</pre>
          </div>
          <div class="chat-message-- chat-reply">   </div>
        </body>
      </html>
    `,
      'text/html'
    );
    const result = monicaParser.parse(doc, { fallbackTitle: 'Monica Chat' });

    expect(result.title).toBe('Monica Chat');
    expect(result.model).toBe('Monica Pro');
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]?.role).toBe('user');
    expect(result.messages[1]?.role).toBe('assistant');
    expect(result.messages[1]?.md).toContain('Assistant lexical body');
    expect(result.messages[1]?.md).not.toContain('Copy');
    expect(result.messages[2]?.md).toContain('Code block reply');
  });

  it('keeps plain text assistant content and ignores user-only model containers', async () => {
    const { monicaParser } =
      await import('../../../src/third_party/ai-chat-exporter/platforms/monica');
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title>Topic - Monica</title></head>
        <body>
          <div class="chat-message-- chat-question"><div class="reply-header"><span>GPT-4o</span></div><p>Question</p></div>
          <div class="chat-message-- chat-reply">Standalone assistant reply</div>
        </body>
      </html>
    `,
      'text/html'
    );
    const result = monicaParser.parse(doc);

    expect(result.model).toBe('Monica');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe('user');
    expect(result.messages[1]?.role).toBe('assistant');
    expect(result.messages[1]?.md).toContain('Standalone assistant reply');
  });

  it('strips native Monica and 莫妮卡 title tokens before using fallback behavior', async () => {
    const { monicaParser } =
      await import('../../../src/third_party/ai-chat-exporter/platforms/monica');

    const strippedTitleDoc = new DOMParser().parseFromString(
      `
      <html>
        <head><title>话题 - 莫妮卡</title></head>
        <body>
          <div class="chat-message-- chat-question"><p>Hello Monica</p></div>
          <div class="chat-message-- chat-reply"><div class="markdown"><p>Hi there</p></div></div>
        </body>
      </html>
    `,
      'text/html'
    );
    const placeholderTitleDoc = new DOMParser().parseFromString(
      `
      <html>
        <head><title>莫妮卡</title></head>
        <body>
          <div class="chat-message-- chat-question"><p>Hello Monica</p></div>
          <div class="chat-message-- chat-reply"><div class="markdown"><p>Hi there</p></div></div>
        </body>
      </html>
    `,
      'text/html'
    );

    expect(monicaParser.parse(strippedTitleDoc, { fallbackTitle: 'Monica Chat' }).title).toBe(
      '话题'
    );
    expect(monicaParser.parse(placeholderTitleDoc, { fallbackTitle: 'Monica Chat' }).title).toBe(
      'Monica Chat'
    );
  });

  it('uses the parser-owned neutral fallback title when no fallback config is injected', async () => {
    const { monicaParser } =
      await import('../../../src/third_party/ai-chat-exporter/platforms/monica');
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title>莫妮卡</title></head>
        <body>
          <div class="chat-message-- chat-question"><p>Hello Monica</p></div>
          <div class="chat-message-- chat-reply"><div class="markdown"><p>Hi there</p></div></div>
        </body>
      </html>
    `,
      'text/html'
    );
    const result = monicaParser.parse(doc);

    expect(result.title).toBe('Monica Chat');
    expect(result.messages).toHaveLength(2);
  });

  it('centralizes native Monica title tokens instead of keeping 莫妮卡 in inline regexes', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/third_party/ai-chat-exporter/platforms/monica.ts'),
      'utf8'
    );

    expect(source).toContain('MONICA_NATIVE_TITLE_TOKENS');
    expect(source).not.toContain('/\\s*-\\s*(Monica|莫妮卡)\\s*$/i');
    expect(source).not.toContain('/^(Monica|莫妮卡)$/iu');
  });

  it('uses the shared profile engine as the Monica extraction path', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/third_party/ai-chat-exporter/platforms/monica.ts'),
      'utf8'
    );

    expect(source).toContain('parseWithProfile');
    expect(source).toContain('monicaProfile');
  });
});
