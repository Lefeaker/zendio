/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

describe('deepseek parser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty result when no DeepSeek messages exist', async () => {
    const { deepseekParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/deepseek');
    const doc = new DOMParser().parseFromString('<html><head><title>DeepSeek</title></head><body></body></html>', 'text/html');
    const result = deepseekParser.parse(doc);
    expect(result.messages).toEqual([]);
  });

  it('parses DeepSeek user and assistant messages with sidebar title fallback', async () => {
    const { deepseekParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/deepseek');
    const doc = new DOMParser().parseFromString(`
      <html>
        <head><title> - DeepSeek</title></head>
        <body>
          <div class="conversation-title">Reasoning Session</div>
          <div class="model-chip">DeepSeek R1</div>
          <div class="message user"><div class="content">Question</div></div>
          <div class="message assistant"><div class="markdown"><p>Answer</p></div></div>
        </body>
      </html>
    `, 'text/html');
    const result = deepseekParser.parse(doc);
    expect(result.title).toBe('- DeepSeek');
    expect(result.model).toBe('DeepSeek R1');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe('user');
    expect(result.messages[1]?.role).toBe('assistant');
    expect(result.messages[1]?.md).toContain('Answer');
  });
});
