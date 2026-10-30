/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

describe('tongyi parser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses an injected fallback title when no product title is available', async () => {
    const { tongyiParser } =
      await import('../../../src/third_party/ai-chat-exporter/platforms/tongyi');
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

    const result = tongyiParser.parse(doc, { fallbackTitle: 'Catalog Tongyi Title' });

    expect(result.title).toBe('Catalog Tongyi Title');
    expect(result.messages).toHaveLength(1);
  });

  it('throws when no source title or injected fallback title is available', async () => {
    const { tongyiParser } =
      await import('../../../src/third_party/ai-chat-exporter/platforms/tongyi');
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

    expect(() => tongyiParser.parse(doc)).toThrow('Missing fallback title for tongyi export');
  });

  it('preserves user-provided Chinese question titles instead of replacing them', async () => {
    const { tongyiParser } =
      await import('../../../src/third_party/ai-chat-exporter/platforms/tongyi');
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

    const result = tongyiParser.parse(doc, { fallbackTitle: 'Catalog Tongyi Title' });

    expect(result.title).toBe('研究计划');
  });
});

describe('Tongyi model provenance', () => {
  beforeEach(() => localStorage.clear());

  async function parseModelPage(header: string) {
    const { tongyiParser } =
      await import('../../../src/third_party/ai-chat-exporter/platforms/tongyi');
    const doc = new DOMParser().parseFromString(
      `<html><head><title>Model provenance</title></head><body>
      <aside><button aria-haspopup="menu">Qwen9999</button></aside>${header}
      <div class="message-item questionItem user-message"><div class="content">Compare Qwen3-Max with Qwen2-Turbo.</div></div>
      <div class="answerItem assistant-message"><div class="content markdown"><p>Qwen2-Turbo is mentioned in the answer.</p><span class="model">Qwen9999</span></div></div>
    </body></html>`,
      'text/html'
    );
    return tongyiParser.parse(doc);
  }

  it('omits model instead of copying an account nickname or a model mentioned by the conversation', async () => {
    const result = await parseModelPage('');
    expect(result.model).toBeUndefined();
    expect(result.messages.map((item) => item.role)).toEqual(['user', 'assistant']);
    expect(result.messages[0]?.md).toContain('Qwen3-Max');
    expect(result.messages[1]?.md).toContain('Qwen2-Turbo');
  });

  it('prefers an explicit current model control over unrelated local storage and body mentions', async () => {
    localStorage.setItem('selectedQwenModel', 'qwen1-turbo');
    const result = await parseModelPage('<button data-testid="model-selector">Qwen3-Max</button>');
    expect(result.model).toBe('Qwen3-Max');
  });

  it('retains an explicit selected model option', async () => {
    const result = await parseModelPage(
      '<select data-testid="model-selector"><option>Qwen2-Turbo</option><option selected>Qwen3-Plus</option></select>'
    );
    expect(result.model).toBe('Qwen3-Plus');
  });

  it('keeps source model metadata optional when a control only names a mode', async () => {
    const result = await parseModelPage('<button data-testid="model-selector">快速</button>');
    expect(result.model).toBeUndefined();
  });
});
