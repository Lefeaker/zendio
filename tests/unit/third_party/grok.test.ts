/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createAIChatExtractor } from '../../../src/content/extractors/aiChatExtractor';
import { grokParser } from '../../../src/third_party/ai-chat-exporter/platforms/grok';
import { parseChatDOM } from '../../../src/third_party/ai-chat-exporter/parse';

function loadFixture(): Document {
  const html = readFileSync(
    join(process.cwd(), 'tests/fixtures/ai-chat/current-dom/grok-current-2026-10-31.html'),
    'utf8'
  );
  const doc = new JSDOM(html, { url: 'https://grok.com/share/sanitized' }).window.document;
  const scroller = doc.querySelector('[data-transcript-renderer]');
  if (!scroller) throw new Error('Missing fixture transcript');
  Object.defineProperty(scroller, 'clientHeight', { value: 1000 });
  Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
  return doc;
}

function createExtractor() {
  return createAIChatExtractor({
    getMessages: async () => ({
      exportAiChatFallbackTitleDeepseek: 'DeepSeek conversation',
      exportAiChatFallbackTitleKimi: 'Kimi conversation',
      exportAiChatFallbackTitleTongyi: 'Qianwen conversation'
    })
  });
}

describe('Grok parser', () => {
  it('parses the current shared conversation in DOM order and preserves Markdown blocks', () => {
    const doc = loadFixture();
    const original = doc.documentElement.outerHTML;
    const result = parseChatDOM('grok', doc);

    expect(result.title).toBe('Grok parser compatibility');
    expect(result.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant'
    ]);
    expect(result.messages[0]?.md).toBe('GROK_USER_ONE: compare two options.');
    expect(result.messages[1]?.md).toContain('GROK_REPLY_ONE: a **comparison**');
    expect(result.messages[1]?.md).toContain('- First option');
    expect(result.messages[1]?.md).toContain('| Option | Result |');
    expect(result.messages[1]?.md).toContain('| Alpha | Ready |');
    expect(result.messages[1]?.md).toContain('GROK_REPLY_ONE_END');
    expect(result.messages[2]?.md).toContain('GROK_USER_TWO');
    expect(result.messages[3]?.md).toContain('GROK_REPLY_TWO_END');
    expect(result.messages.map((message) => message.md).join('\n')).not.toMatch(
      /COPY_CONTROL|Sidebar history|Log in to continue/
    );
    expect(result.model).toBeUndefined();
    expect(doc.documentElement.outerHTML).toBe(original);
  });

  it('preserves repeated turns and does not infer roles from alternating positions', () => {
    const doc = loadFixture();
    const user = doc.querySelector('[data-testid="user-message"]');
    if (!user) throw new Error('Missing fixture user message');
    user.after(user.cloneNode(true));

    const result = grokParser.parse(doc);
    expect(result.messages.map((message) => message.role)).toEqual([
      'user',
      'user',
      'assistant',
      'user',
      'assistant'
    ]);
    expect(result.messages[0]?.md).toBe(result.messages[1]?.md);
    expect(new Set(result.messages.map((message) => message.id)).size).toBe(5);
  });

  it('keeps every Markdown part without duplicating nested content', () => {
    const doc = loadFixture();
    const assistant = doc.querySelector('[data-testid="assistant-message"]');
    if (!assistant) throw new Error('Missing fixture assistant message');
    const part = doc.createElement('div');
    part.className = 'response-content-markdown';
    part.innerHTML =
      '<div class="response-content-markdown"><p>SECOND_CONTENT_PART</p><pre><code class="language-python">print("hello")</code></pre><p><a href="https://example.com/reference">Reference</a></p></div>';
    assistant.appendChild(part);
    const thinking = assistant.querySelector('.thinking-container');
    if (thinking) {
      thinking.innerHTML =
        '<div class="response-content-markdown"><p>THINKING_STATUS_NOISE</p><button>THINKING_ACTION_NOISE</button></div>';
    }

    const result = grokParser.parse(doc);
    const markdown = result.messages[1]?.md ?? '';
    expect(markdown).toContain('GROK_REPLY_ONE_END');
    expect(markdown.match(/SECOND_CONTENT_PART/g)).toHaveLength(1);
    expect(markdown).toContain('```python\nprint("hello")\n```');
    expect(markdown).toContain('[Reference](https://example.com/reference)');
    expect(markdown).not.toContain('THINKING_');
  });

  it('ignores matching messages outside the Grok conversation surface', () => {
    const doc = new DOMParser().parseFromString(
      '<title>Grok</title><aside><div role="article" data-testid="user-message">Sidebar prompt</div><div role="article" data-testid="assistant-message"><div class="response-content-markdown">Sidebar answer</div></div></aside><div id="grok-content-area"><h1>Sign in</h1></div>',
      'text/html'
    );
    expect(grokParser.parse(doc).messages).toEqual([]);
  });

  it('rejects a shared transcript that is still loading', async () => {
    const doc = loadFixture();
    doc.querySelector('[data-transcript-renderer]')?.setAttribute('aria-busy', 'true');
    expect(grokParser.parse(doc)).toMatchObject({
      messages: [],
      diagnostics: [{ code: 'grok_transcript_loading', severity: 'warning' }]
    });
    await expect(
      createExtractor().extract({ document: doc, url: 'https://grok.com/share/sanitized' })
    ).rejects.toMatchObject({ code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE' });
  });

  it('does not mistake thinking or role labels for an assistant answer', async () => {
    const doc = new DOMParser().parseFromString(
      '<title>Grok</title><div id="grok-page-content"><div role="article" data-testid="user-message"><h2 data-no-copy="true">You</h2><p>Test prompt</p></div><div role="article" data-testid="assistant-message"><h2 data-no-copy="true">Grok</h2><div class="thinking-container">Working</div></div></div>',
      'text/html'
    );
    expect(grokParser.parse(doc).messages).toEqual([
      expect.objectContaining({ role: 'user', md: 'Test prompt' })
    ]);
    await expect(
      createExtractor().extract({ document: doc, url: 'https://grok.com/' })
    ).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE'
    });
  });

  it.each([
    ['missing body', '<h2 data-no-copy="true">Grok</h2>'],
    [
      'thinking only',
      '<h2 data-no-copy="true">Grok</h2><div class="thinking-container"><div class="response-content-markdown">Still thinking</div></div>'
    ],
    [
      'empty Markdown',
      '<h2 data-no-copy="true">Grok</h2><div class="response-content-markdown"> <button>Copy</button> </div>'
    ]
  ])(
    'rejects %s in the final assistant turn after a complete earlier round',
    async (_label, html) => {
      const doc = loadFixture();
      const assistants = doc.querySelectorAll('[data-testid="assistant-message"]');
      const finalAssistant = assistants[assistants.length - 1];
      if (!finalAssistant) throw new Error('Missing final assistant fixture');
      finalAssistant.innerHTML = html;
      const result = grokParser.parse(doc);
      expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
      expect(result.messages[1]?.md).toContain('GROK_REPLY_ONE_END');
      await expect(
        createExtractor().extract({ document: doc, url: doc.URL })
      ).rejects.toMatchObject({
        code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
        recoverable: true,
        context: { parserDiagnosticCodes: ['grok_message_content_incomplete'] }
      });
      expect(result.diagnostics).toContainEqual({
        code: 'grok_message_content_incomplete',
        severity: 'error'
      });
    }
  );

  it('routes Grok through the real asynchronous extractor and Markdown formatter', async () => {
    const document = loadFixture();
    const extractor = createExtractor();
    const context = { document, url: 'https://grok.com/share/sanitized' };
    await expect(extractor.canHandle(context)).resolves.toBe(true);
    const result = await extractor.extract(context);

    expect(result.type).toBe('ai_chat');
    expect(result.meta).toMatchObject({ platform: 'grok', messageCount: 4 });
    expect(result.markdown).toContain('platform: "grok"');
    expect(result.markdown).toContain('message_count: 4');
    expect(result.markdown).toContain('# 1 USER');
    expect(result.markdown).toContain('# 2 ASSISTANT');
    expect(result.markdown).toContain('GROK_REPLY_TWO_END');
  });
});
