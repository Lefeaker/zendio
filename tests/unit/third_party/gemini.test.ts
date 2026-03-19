/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/third_party/ai-chat-exporter/shared/assets', () => ({
  convertBlobImageToBase64: vi.fn(() => 'data:image/png;base64,abc')
}));

describe('gemini parser', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns empty result when no gemini messages exist', async () => {
    const { geminiParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/gemini');
    const doc = new DOMParser().parseFromString('<html><head><title>Gemini - Empty</title></head><body></body></html>', 'text/html');
    const result = geminiParser.parse(doc);
    expect(result.messages).toEqual([]);
  });

  it('parses user and assistant messages and strips gemini title prefix', async () => {
    const { geminiParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/gemini');
    const doc = new DOMParser().parseFromString(`
      <html>
        <head><title>Gemini - Planning Chat</title></head>
        <body>
          <user-query><div role="presentation"><p>Hello there</p></div></user-query>
          <model-response><message-content><p>General Kenobi</p></message-content></model-response>
        </body>
      </html>
    `, 'text/html');
    const result = geminiParser.parse(doc);
    expect(result.title).toBe('Planning Chat');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.role).toBe('user');
    expect(result.messages[1]?.role).toBe('assistant');
    expect(result.messages[1]?.md).toContain('General Kenobi');
  });

  it('supports pure deep research mode fallback', async () => {
    const { geminiParser } = await import('../../../src/third_party/ai-chat-exporter/platforms/gemini');
    const doc = new DOMParser().parseFromString('<html><body><model-response><div>No report</div></model-response></body></html>', 'text/html');
    const result = geminiParser.parse(doc, { deepResearch: { pureMode: true } });
    expect(result.title).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });
});
