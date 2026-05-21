import { describe, expect, it } from 'vitest';

import { buildChatMarkdown } from '@content/formatters/markdown';

describe('content/formatters/markdown', () => {
  it('builds chat markdown with timestamps and user names', () => {
    const markdown = buildChatMarkdown({
      platform: 'gemini',
      url: 'https://gemini.google.com/app',
      model: 'Gemini 2.0',
      createdAt: '2026-03-09T10:00:00Z',
      options: { includeTimestamps: true, userName: 'Alice' },
      messages: [
        { id: '1', role: 'user', text: 'Hello\nWorld', timestamp: '2026-03-09T10:01:00Z' },
        { id: '2', role: 'assistant', text: 'Hi back' }
      ]
    });

    expect(markdown).toContain('# 1 Alice');
    expect(markdown).toContain('> Hello');
    expect(markdown).toContain('# 2 Gemini 2.0');
    expect(markdown).toContain('Hi back');
    expect(markdown).toContain('url: "https://gemini.google.com/app"');
  });

  it('falls back safely when url is invalid', () => {
    const markdown = buildChatMarkdown({
      platform: 'web',
      url: 'not-a-url',
      messages: [{ id: '1', role: 'assistant', text: 'ok' }]
    });
    expect(markdown).toContain('# 1 ASSISTANT');
    expect(markdown).not.toContain('domain:');
  });
});
