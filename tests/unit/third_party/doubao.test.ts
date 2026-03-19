/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

describe('doubao parser', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty result when no Doubao messages exist', async () => {
    const { doubaoParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/doubao');
    const doc = new DOMParser().parseFromString('<html><head><title>豆包</title></head><body></body></html>', 'text/html');
    const result = doubaoParser.parse(doc);
    expect(result.messages).toEqual([]);
  });

  it('parses assistant and user Doubao containers and extracts model text', async () => {
    const { doubaoParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/doubao');
    const doc = new DOMParser().parseFromString(`
      <html>
        <head><title>Project Chat - 豆包</title></head>
        <body>
          <header><span>豆包 Pro</span></header>
          <div class="message-block-container"><div class="send-text">你好</div></div>
          <div class="message-block-container"><img alt="豆包助手" /><div class="flow-markdown-body"><p>已收到</p></div></div>
        </body>
      </html>
    `, 'text/html');
    const result = doubaoParser.parse(doc);
    expect(result.title).toBe('Project Chat');
    expect(result.model).toBe('豆包 Pro');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe('user');
    expect(result.messages[1]?.role).toBe('assistant');
    expect(result.messages[1]?.md).toContain('已收到');
  });
});
