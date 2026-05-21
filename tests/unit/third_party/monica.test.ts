/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

describe('monica parser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty result when no Monica messages exist', async () => {
    const { monicaParser } = await import(
      '../../../src/third_party/ai-chat-exporter/platforms/monica'
    );
    const doc = new DOMParser().parseFromString(
      '<html><head><title>Blank - Monica</title></head><body></body></html>',
      'text/html'
    );
    const result = monicaParser.parse(doc);
    expect(result.title).toBe('Conversation');
    expect(result.messages).toEqual([]);
  });

  it('filters invalid model candidates, falls back through content selectors, and keeps assistant defaults', async () => {
    const { monicaParser } = await import(
      '../../../src/third_party/ai-chat-exporter/platforms/monica'
    );
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
    const result = monicaParser.parse(doc);

    expect(result.title).toBe('Conversation');
    expect(result.model).toBe('Monica Pro');
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]?.role).toBe('user');
    expect(result.messages[1]?.role).toBe('assistant');
    expect(result.messages[1]?.md).toContain('Assistant lexical body');
    expect(result.messages[1]?.md).not.toContain('Copy');
    expect(result.messages[2]?.md).toContain('Code block reply');
  });

  it('keeps plain text messages even when cloned html is empty and skips non-assistant model containers', async () => {
    const { monicaParser } = await import(
      '../../../src/third_party/ai-chat-exporter/platforms/monica'
    );
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
    expect(result.messages[1]?.md).toContain('Standalone assistant reply');
  });

  it('parses user and assistant Monica messages and extracts model', async () => {
    const { monicaParser } = await import(
      '../../../src/third_party/ai-chat-exporter/platforms/monica'
    );
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title>Weekly Notes - Monica</title></head>
        <body>
          <div class="reply-header"><span>Claude 3.5 Sonnet</span></div>
          <div class="chat-message-- chat-question"><p>Hello Monica</p></div>
          <div class="chat-message-- chat-reply"><div class="markdown"><p>Hi there</p></div><button>Copy</button></div>
        </body>
      </html>
    `,
      'text/html'
    );
    const result = monicaParser.parse(doc);
    expect(result.title).toBe('Weekly Notes');
    expect(result.model).toBe('Claude 3.5 Sonnet');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe('user');
    expect(result.messages[1]?.role).toBe('assistant');
    expect(result.messages[1]?.md).toContain('Hi there');
  });
});
