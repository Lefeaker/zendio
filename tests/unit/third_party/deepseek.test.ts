/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

describe('deepseek parser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty result when no DeepSeek messages exist', async () => {
    const { deepseekParser } = await import(
      '../../../src/third_party/ai-chat-exporter/platforms/deepseek'
    );
    const doc = new DOMParser().parseFromString(
      '<html><head><title>DeepSeek</title></head><body></body></html>',
      'text/html'
    );
    const result = deepseekParser.parse(doc);
    expect(result.messages).toEqual([]);
  });

  it('uses an injected fallback title when no product title is available', async () => {
    const { deepseekParser } = await import(
      '../../../src/third_party/ai-chat-exporter/platforms/deepseek'
    );
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title></title></head>
        <body>
          <div class="message user"><div class="content">Question</div></div>
          <div class="message assistant"><div class="markdown"><p>Answer</p></div></div>
        </body>
      </html>
    `,
      'text/html'
    );

    const result = deepseekParser.parse(doc, { fallbackTitle: 'Catalog DeepSeek Title' });

    expect(result.title).toBe('Catalog DeepSeek Title');
    expect(result.messages).toHaveLength(2);
  });

  it('throws when no source title or injected fallback title is available', async () => {
    const { deepseekParser } = await import(
      '../../../src/third_party/ai-chat-exporter/platforms/deepseek'
    );
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title></title></head>
        <body>
          <div class="message user"><div class="content">Question</div></div>
          <div class="message assistant"><div class="markdown"><p>Answer</p></div></div>
        </body>
      </html>
    `,
      'text/html'
    );

    expect(() => deepseekParser.parse(doc)).toThrow('Missing fallback title for deepseek export');
  });

  it('preserves user-provided Chinese titles instead of replacing them', async () => {
    const { deepseekParser } = await import(
      '../../../src/third_party/ai-chat-exporter/platforms/deepseek'
    );
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title>研究计划 - DeepSeek</title></head>
        <body>
          <div class="message user"><div class="content">Question</div></div>
          <div class="message assistant"><div class="markdown"><p>Answer</p></div></div>
        </body>
      </html>
    `,
      'text/html'
    );

    const result = deepseekParser.parse(doc, { fallbackTitle: 'Catalog DeepSeek Title' });

    expect(result.title).toBe('研究计划');
    expect(result.messages[0]?.role).toBe('user');
    expect(result.messages[1]?.role).toBe('assistant');
  });
});
