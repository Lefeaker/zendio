/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

describe('tongyi parser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the configured fallback title when no product title is available', async () => {
    const { tongyiParser } = await import(
      '../../../src/third_party/ai-chat-exporter/platforms/tongyi'
    );
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title></title></head>
        <body>
          <div class="answerItem"><div class="content">Answer</div></div>
        </body>
      </html>
    `,
      'text/html'
    );

    const result = tongyiParser.parse(doc, { fallbackTitle: 'Tongyi Chat' });

    expect(result.title).toBe('Tongyi Chat');
    expect(result.messages).toHaveLength(1);
  });

  it('preserves user-provided Chinese question titles instead of replacing them', async () => {
    const { tongyiParser } = await import(
      '../../../src/third_party/ai-chat-exporter/platforms/tongyi'
    );
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title></title></head>
        <body>
          <div class="questionItem"><div class="content">研究计划</div></div>
          <div class="answerItem"><div class="content">Answer</div></div>
        </body>
      </html>
    `,
      'text/html'
    );

    const result = tongyiParser.parse(doc, { fallbackTitle: 'Tongyi Chat' });

    expect(result.title).toBe('研究计划');
  });
});
