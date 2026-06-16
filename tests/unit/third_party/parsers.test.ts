/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { parseChatDOM } from '../../../src/third_party/ai-chat-exporter/parse';

function loadFixture(name: string): Document {
  const filePath = join(process.cwd(), 'tests/fixtures/ai-chat', name);
  const html = readFileSync(filePath, 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com' });
  return dom.window.document;
}

describe('ai chat platform parsers', () => {
  it('parses ChatGPT conversations', () => {
    const doc = loadFixture('chatgpt.html');
    const result = parseChatDOM('chatgpt', doc);

    expect(result.title).toBe('Test Conversation');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({ role: 'user' });
    expect(result.messages[1]).toMatchObject({ role: 'assistant' });
    expect(result.messages[1].md).toContain('How can I help you today');
  });

  it('strips native Chinese ChatGPT role labels without changing message roles', () => {
    const doc = new DOMParser().parseFromString(
      `
      <html>
        <head><title>测试会话 - ChatGPT</title></head>
        <body>
          <article data-message-author-role="user" class="user">
            <h5>您说：</h5>
            <div class="markdown prose"><p>你好</p></div>
          </article>
          <article data-message-author-role="assistant">
            <h5>ChatGPT 说：</h5>
            <div class="markdown prose"><p>当然可以帮你。</p></div>
          </article>
        </body>
      </html>
    `,
      'text/html'
    );
    const result = parseChatDOM('chatgpt', doc);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({ role: 'user', md: '你好' });
    expect(result.messages[1]).toMatchObject({ role: 'assistant' });
    expect(result.messages[1]?.md).toContain('当然可以帮你。');
    expect(result.messages.some((message) => /您说|ChatGPT 说/.test(message.md ?? ''))).toBe(false);
  });

  it('parses Claude conversations with model metadata', () => {
    const doc = loadFixture('claude.html');
    const result = parseChatDOM('claude', doc);

    expect(result.title).toBe('Planning Session');
    expect(result.model).toBe('Claude Sonnet 3.5');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].md).toContain('plan overview');
  });

  it('parses Copilot conversations and extracts selected title', () => {
    const doc = loadFixture('copilot.html');
    const result = parseChatDOM('copilot', doc);

    expect(result.title).toBe('Travel Ideas');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1].role).toBe('assistant');
  });

  it('parses Tongyi conversations and derives model info', () => {
    const doc = loadFixture('tongyi.html');
    const result = parseChatDOM('tongyi', doc);

    expect(result.title).toBe('研究计划');
    expect(result.model).toBe('Qwen2-Turbo');
    expect(result.messages).toHaveLength(2);
  });

  it('parses new Tongyi layout with hashed class names', () => {
    const doc = loadFixture('tongyi-new.html');
    const result = parseChatDOM('tongyi', doc);

    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].md).toContain('请列出三个 AI 公司');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[1].md).toContain('OpenAI');
    expect(result.messages[2].role).toBe('user');
    expect(result.messages[3].md).toContain('不同优势');
  });

  it('preserves code fences and languages for Tongyi code blocks', () => {
    const doc = loadFixture('tongyi-code.html');
    const result = parseChatDOM('tongyi', doc);

    const assistant = result.messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeTruthy();

    const markdown = assistant?.md || '';
    expect(markdown).toContain('```TypeScript');
    expect(markdown).toContain('interface AIModel');
    expect(markdown).toContain('```python');
    expect(markdown).not.toMatch(/^\s*1\s/m);
    expect(markdown).not.toContain('预览');
    expect(markdown).not.toContain('hover:text');
  });

  it('strips inline numeric prefixes in Tongyi code content without removing indentation', () => {
    const doc = loadFixture('tongyi-inline-numbers.html');
    const result = parseChatDOM('tongyi', doc);

    const assistant = result.messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeTruthy();

    const markdown = assistant?.md || '';
    expect(markdown).toContain('```TypeScript');
    expect(markdown).toContain('const counter = 0;');
    expect(markdown).not.toMatch(/^1\/\//m);
    expect(markdown).toMatch(/console\.log\('Start'\);/);
  });

  it('parses DeepSeek conversations and keeps fallback title', () => {
    const doc = loadFixture('deepseek.html');
    const result = parseChatDOM('deepseek', doc);

    expect(result.title).toBe('Team Sync');
    expect(result.model).toContain('DeepSeek');
    expect(result.messages[1].md).toContain('concise summary');
  });

  it('normalises DeepSeek code responses and drops toolbar actions', () => {
    const doc = loadFixture('deepseek-code.html');
    const result = parseChatDOM('deepseek', doc);

    const assistantMessages = result.messages.filter((m) => m.role === 'assistant');
    expect(assistantMessages).toHaveLength(2);

    const firstReply = assistantMessages[0].md;
    expect(firstReply).toContain('```python');
    expect(firstReply).toContain('def greet(name):');
    expect(firstReply).not.toMatch(/Copy/);
    expect(firstReply).not.toMatch(/toolbar/i);

    const secondReply = assistantMessages[1].md;
    expect(secondReply).toContain('| Step | Description |');
    expect(secondReply).toContain('| Call | Invoke greet() |');
  });

  it('parses Kimi conversations', () => {
    const doc = loadFixture('kimi.html');
    const result = parseChatDOM('kimi', doc);

    expect(result.title).toBe('创意草稿');
    expect(result.model).toContain('Kimi');
    expect(result.messages[0].role).toBe('user');
  });

  it('parses Doubao conversations while removing toolbars', () => {
    const doc = loadFixture('doubao.html');
    const result = parseChatDOM('doubao', doc);

    expect(result.title).toBe('示例会话');
    expect(result.model).toBe('Doubao');
    expect(result.messages).toHaveLength(2);

    const [userMessage, assistantMessage] = result.messages;
    expect(userMessage.role).toBe('user');
    expect(userMessage.md).toContain('请使用表格比较三家人工智能公司');

    expect(assistantMessage.role).toBe('assistant');
    expect(assistantMessage.md).toContain('| 公司 |');
    expect(assistantMessage.md).toContain('```python');
    expect(assistantMessage.md).not.toMatch(/复制/);
  });

  it('extracts Doubao model name from header containers', () => {
    const doc = loadFixture('doubao-model.html');
    const result = parseChatDOM('doubao', doc);

    expect(result.model).toBe('豆包旗舰版');
    expect(result.messages).toHaveLength(2);
    const assistant = result.messages.find((m) => m.role === 'assistant');
    expect(assistant?.md).toContain('旗舰版');
  });

  it('parses Monica conversations and keeps assistant markdown', () => {
    const doc = loadFixture('monica.html');
    const result = parseChatDOM('monica', doc);

    expect(result.title).toBe('AI 对话摘要');
    expect(result.model).toBe('GPT-4o');
    expect(result.messages).toHaveLength(2);

    const [userMessage, assistantMessage] = result.messages;
    expect(userMessage.role).toBe('user');
    expect(userMessage.md).toContain('请总结三家人工智能公司');

    expect(assistantMessage.role).toBe('assistant');
    expect(assistantMessage.md).toContain('OpenAI');
    expect(assistantMessage.md).toContain('Anthropic');
    expect(assistantMessage.md).not.toMatch(/复制/);
  });

  it('falls back to default Monica model when header labels are missing', () => {
    const doc = loadFixture('monica-fallback.html');
    const result = parseChatDOM('monica', doc);

    expect(result.model).toBe('Monica');
    expect(result.messages).toHaveLength(2);
  });

  it('parses Perplexity conversations and strips toolbar buttons', () => {
    const doc = loadFixture('perplexity.html');
    const result = parseChatDOM('perplexity', doc);

    expect(result.title).toBe('AI Research Thread');
    expect(result.model).toBe('Sonar Pro');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[1].md).toContain('OpenAI continues to lead frontier deployment.');
    expect(result.messages[1].md).not.toMatch(/Copy/);
  });

  it('preserves Claude language fences while removing copy buttons', () => {
    const doc = loadFixture('claude-code.html');
    const result = parseChatDOM('claude', doc);

    const assistant = result.messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeTruthy();

    const markdown = assistant?.md || '';
    expect(markdown).toContain('```typescript');
    expect(markdown).toContain('interface Task');
    expect(markdown).toContain('```bash');
    expect(markdown).toContain('npm run build');
    expect(markdown).not.toMatch(/Copy code/);
  });

  it('parses new Kimi domain layout', () => {
    const doc = loadFixture('kimi-new.html');
    const result = parseChatDOM('kimi', doc);

    expect(result.title).toBe('研究计划');
    expect(result.model).toContain('Kimi');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].md).toContain('学习计划');
    expect(result.messages[1].md).toContain('两周的学习计划');
    expect(result.messages[1].md).not.toContain('Gemini AI company profile');
    expect(result.messages[1].md).not.toContain('分享');
    expect(result.messages[1].md).toContain(
      '| 表格 | Feature | OpenAI | Google DeepMind (Gemini) | Anthropic (Claude) |'
    );
  });

  it('strips Kimi code headers while keeping fenced code', () => {
    const doc = loadFixture('kimi-code.html');
    const result = parseChatDOM('kimi', doc);

    expect(result.messages).toHaveLength(2);

    const htmlSnippet = result.messages[0].md;
    expect(htmlSnippet).toContain('```html');
    expect(htmlSnippet).not.toMatch(/HTML\s+预览|复制/);

    const tsSnippet = result.messages[1]?.md ?? '';
    expect(tsSnippet).not.toBe('');
    expect(tsSnippet).toMatch(/```(ts|typescript)/);
    expect((tsSnippet.match(/```/g) || []).length).toBe(2);
    expect(tsSnippet).not.toMatch(/TypeScript\s+复制/);
  });

  it('parses Gemini conversations with deep research content', () => {
    const doc = loadFixture('gemini.html');
    const result = parseChatDOM('gemini', doc, { deepResearch: { pureMode: false } });

    expect(result.title).toBe('Sample Session');
    expect(result.messages).toHaveLength(2);
    const assistantMessage = result.messages.find((m) => m.role === 'assistant');
    expect(assistantMessage).toBeTruthy();
    expect(assistantMessage?.md).toContain('Gemini Canvas Snapshot');
    expect(assistantMessage?.md).toContain('Deep Research Report');
  });

  it('falls back to default ChatGPT title for empty docs and derives model from body text', () => {
    const emptyDom = new JSDOM('<html><head><title> - ChatGPT</title></head><body></body></html>');
    const emptyResult = parseChatDOM('chatgpt', emptyDom.window.document);
    expect(emptyResult.title).toBe('Conversation');
    expect(emptyResult.messages).toHaveLength(0);

    const bodyModelDom = new JSDOM(`
      <html>
        <head><title>Thread - ChatGPT</title></head>
        <body>
          <div>Model: GPT-4.1</div>
          <article><h5>You said:</h5><p>Hello</p></article>
          <article><div>ChatGPT said: Hi there</div></article>
        </body>
      </html>
    `);
    const bodyModelResult = parseChatDOM('chatgpt', bodyModelDom.window.document);
    expect(bodyModelResult.title).toBe('Thread');
    expect(bodyModelResult.model).toBe('GPT-4.1');
    expect(bodyModelResult.messages).toHaveLength(2);
    expect(bodyModelResult.messages[0]).toMatchObject({ role: 'user', md: 'Hello' });
    expect(bodyModelResult.messages[1]).toMatchObject({ role: 'assistant', md: 'Hi there' });
  });

  it('uses selected model option and skips empty ChatGPT articles', () => {
    const dom = new JSDOM(`
      <html>
        <head><title>Session - ChatGPT</title></head>
        <body>
          <select><option selected>ChatGPT 4.5</option></select>
          <article data-message-author-role="user"><div>   </div></article>
          <article data-message-author-role="user"><div>Prompt body</div></article>
          <article><div>Answer body</div></article>
        </body>
      </html>
    `);
    const result = parseChatDOM('chatgpt', dom.window.document);
    expect(result.model).toBe('ChatGPT 4.5');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
  });

  it('returns empty result for unsupported platforms', () => {
    const doc = loadFixture('chatgpt.html');
    const result = parseChatDOM('unknown', doc);
    expect(result.messages).toHaveLength(0);
  });
});
