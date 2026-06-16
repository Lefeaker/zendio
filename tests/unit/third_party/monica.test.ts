/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

describe('monica parser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the injected fallback title when the browser title is only the Monica site placeholder', async () => {
    const { monicaParser } =
      await import('../../../src/third_party/ai-chat-exporter/platforms/monica');
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title>Monica</title></head>
        <body>
          <div class="chat-message--RxFki chat-question--yrvtP layout-right--mkwpm">
            <div class="chat-question-content">
              <p>Hello Monica</p>
            </div>
          </div>
          <div class="chat-message--RxFki chat-reply--ntVOt">
            <div class="markdown--UqDin __markdown">
              <p>Hello there</p>
            </div>
          </div>
        </body>
      </html>
    `,
      'text/html'
    );
    const result = monicaParser.parse(doc, { fallbackTitle: 'Monica Chat' });

    expect(result.title).toBe('Monica Chat');
    expect(result.model).toBe('Monica');
    expect(result.messages).toHaveLength(2);
  });
});
