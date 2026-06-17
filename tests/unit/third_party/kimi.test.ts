/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

describe('kimi parser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses an injected fallback title when no product title is available', async () => {
    const { kimiParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/kimi');
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

    const result = kimiParser.parse(doc, { fallbackTitle: 'Catalog Kimi Title' });

    expect(result.title).toBe('Catalog Kimi Title');
    expect(result.messages).toHaveLength(2);
  });

  it('throws when no source title or injected fallback title is available', async () => {
    const { kimiParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/kimi');
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

    expect(() => kimiParser.parse(doc)).toThrow('Missing fallback title for kimi export');
  });

  it('preserves user-provided Chinese titles instead of replacing them', async () => {
    const { kimiParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/kimi');
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title></title></head>
        <body>
          <div class="conversation-title">创意草稿</div>
          <div class="message user"><div class="content">Question</div></div>
          <div class="message assistant"><div class="markdown"><p>Answer</p></div></div>
        </body>
      </html>
    `,
      'text/html'
    );

    const result = kimiParser.parse(doc, { fallbackTitle: 'Catalog Kimi Title' });

    expect(result.title).toBe('创意草稿');
  });
});
