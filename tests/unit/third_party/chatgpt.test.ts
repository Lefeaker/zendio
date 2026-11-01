/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chatgptParser } from '../../../src/third_party/ai-chat-exporter/platforms/chatgpt';
import { extractAIChat } from '../../../src/content/extractors/aiChatExtractor';
import { chatGPTContentSignature } from '../../../src/third_party/ai-chat-exporter/shared/chatgptCodeBlocks';

function parse(html: string) {
  return chatgptParser.parse(new DOMParser().parseFromString(html, 'text/html'));
}

function message(role: string, content: string): string {
  const body =
    role === 'user' ? 'data-user-message-bubble' : 'data-markdown-text-style="assistant-message"';
  return `<div><h4 data-conversation-role="${role}"><span>Role label:</span><span aria-hidden="true">Print label</span></h4><div ${body}>${content}</div><button>Copy</button></div>`;
}

describe('ChatGPT message boundaries', () => {
  const hiddenAttributes = [
    'hidden',
    'aria-hidden="true"',
    'style="display:none"',
    'style="display: none"'
  ];
  it.each(hiddenAttributes)('ignores a %s modern role copy inside the visible reply', (hidden) => {
    const result = parse(
      message('user', 'Question') +
        message(
          'assistant',
          `Answer<div ${hidden}><h4 data-conversation-role="assistant">Hidden copy</h4></div>`
        )
    );
    expect(result.diagnostics).toBeUndefined();
    expect(result.messages.map((item) => [item.role, item.md])).toEqual([
      ['user', 'Question'],
      ['assistant', 'Answer']
    ]);
  });

  it.each(hiddenAttributes)('keeps a legacy owner with only %s modern descendants', (hidden) => {
    const result = parse(
      message('user', 'Question') +
        `<article data-message-author-role="assistant"><div class="markdown">Answer</div><div ${hidden}><h4 data-conversation-role="assistant">Hidden copy</h4></div></article>`
    );
    expect(result.diagnostics).toBeUndefined();
    expect(result.messages.map((item) => [item.role, item.md])).toEqual([
      ['user', 'Question'],
      ['assistant', 'Answer']
    ]);
  });

  it.each(hiddenAttributes)(
    'keeps an inferred article with only %s legacy descendants',
    (hidden) => {
      const result = parse(
        message('user', 'Question') +
          `<article><h5>ChatGPT said:</h5><div class="markdown">Answer</div><div ${hidden}><div data-message-author-role="user">Hidden copy</div></div></article>`
      );
      expect(result.diagnostics).toBeUndefined();
      expect(result.messages.map((item) => [item.role, item.md])).toEqual([
        ['user', 'Question'],
        ['assistant', 'Answer']
      ]);
    }
  );

  it.each(hiddenAttributes)(
    'ignores %s h5 copies before visible legacy role evidence',
    (hidden) => {
      for (const visible of [
        '<h5>You said:</h5><div class="markdown">Question</div>',
        'You said: Question'
      ]) {
        const result = parse(
          `<article><h5 ${hidden}>ChatGPT said:</h5>${visible}</article>` +
            message('assistant', 'Answer')
        );
        expect(result.messages.map((item) => [item.role, item.md])).toEqual([
          ['user', 'Question'],
          ['assistant', 'Answer']
        ]);
      }
    }
  );

  it.each(['', 'aria-hidden="false"', 'style="display:block"'])(
    'still rejects a genuinely visible duplicate role boundary with %s',
    (attributes) => {
      const result = parse(
        message('user', 'Question') +
          message(
            'assistant',
            `Answer<div ${attributes}><h4 data-conversation-role="assistant">Visible duplicate</h4></div>`
          )
      );
      expect(result.messages).toEqual([]);
      expect(result.diagnostics?.[0]?.code).toBe('chatgpt_message_boundary_ambiguous');
    }
  );

  it.each(['hidden', 'aria-hidden="true"', 'style="display:none"'])(
    'keeps %s semantic code sources excluded',
    (attribute) => {
      const codeBlock = `<div data-code-block="true"><div data-markdown-copy="exclude">JavaScript</div><div data-code-block-source="true" ${attribute}><code>EXCLUDED_CODE</code></div></div>`;
      const result = parse(
        message('user', 'Question') + message('assistant', `<p>Visible answer.</p>${codeBlock}`)
      );
      expect(result.messages[1]?.md).toContain('Visible answer.');
      expect(result.messages[1]?.md).not.toContain('EXCLUDED_CODE');
      const doc = new DOMParser().parseFromString(codeBlock, 'text/html');
      const before = chatGPTContentSignature(doc.body);
      doc.querySelector('code')?.setAttribute('data-language', 'ruby');
      expect(chatGPTContentSignature(doc.body)).toBe(before);
    }
  );

  it.each(['data-language', 'data-code-language', 'data-lang'])(
    'preserves existing pre %s metadata ahead of a conflicting action label',
    (attribute) => {
      const codeBlock = `<div data-code-block="true"><div data-markdown-copy="exclude">JavaScript</div><div data-code-block-source="true"><pre ${attribute}="python"><code>print(1)</code></pre></div></div>`;
      const result = parse(message('user', 'Question') + message('assistant', codeBlock));
      expect(result.messages[1]?.md).toBe('```python\nprint(1)\n```');
      const doc = new DOMParser().parseFromString(codeBlock, 'text/html');
      const before = chatGPTContentSignature(doc.body);
      doc.querySelector('[data-markdown-copy]')?.replaceChildren('TypeScript');
      expect(chatGPTContentSignature(doc.body)).toBe(before);
      doc.querySelector('pre')?.setAttribute(attribute, 'ruby');
      expect(chatGPTContentSignature(doc.body)).not.toBe(before);
    }
  );

  it('normalizes the observed semantic code source without changing the live DOM or ordinary prose', () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ai-chat/current-dom/chatgpt-code-source-2026-11-01.html'),
      'utf8'
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const before = doc.body.innerHTML;
    const result = chatgptParser.parse(doc);
    expect(result.messages.map((item) => item.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant'
    ]);
    expect(result.messages[1]?.md).toContain('Python\n\n普通段落中的代码。');
    expect(result.messages[1]?.md).toMatch(/```javascript\nconst x = 1;\nconsole\.log\(x\);\n```/i);
    expect(result.messages[3]?.md).toContain('```\nline one\nline two\n```');
    expect(result.messages[3]?.md).toContain('```typescript\nconst oldShape = true;\n```');
    expect(result.messages[3]?.md).toContain('$x^2$');
    expect(result.messages[3]?.md).not.toMatch(/(?:^|\n)代码(?:\n|$)/);
    expect(
      result.messages
        .map((item) => item.md)
        .join('\n')
        .match(/```/g)
    ).toHaveLength(6);
    expect(doc.body.innerHTML).toBe(before);
  });

  it('reads both roles in each current live turn without article or legacy role attributes', () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ai-chat/current-dom/chatgpt-current-2026-10-31.html'),
      'utf8'
    );
    const result = parse(html);
    expect(result.messages.map((item) => item.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant'
    ]);
    expect(result.messages[0]?.md).toContain('Zendio 扩展兼容性测试');
    expect(result.messages[1]?.md).toBe('ZENDIO_TEST_OK');
    expect(result.messages[2]?.md).toContain('继续做格式测试');
    expect(result.messages[3]?.md).toContain('const x = 1;');
    expect(result.messages[3]?.md).toMatch(/```javascript\nconst x = 1;/i);
    expect(result.messages[3]?.md).not.toMatch(/(?:^|\n)JavaScript\s*\n\s*```/);
    expect(result.messages[3]?.md).toContain('$x^2$');
    expect(
      result.messages.every(
        (item) => !/你说：|ChatGPT 说：|复制消息|重新生成回复/.test(item.md ?? '')
      )
    ).toBe(true);
  });

  it('preserves identical messages in distinct turns and collects every assistant content block', () => {
    const turn = `<div data-turn-key="turn">${message('user', 'Repeat this')}
      <div data-message-author-role="assistant"><h4 data-conversation-role="assistant">ChatGPT said:</h4>
        <div data-markdown-text-style="assistant-message"><p>First segment</p></div>
        <div data-markdown-text-style="assistant-message"><p>Second segment</p></div>
      </div></div>`;
    const result = parse(turn + turn);
    expect(result.messages.map((item) => item.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant'
    ]);
    expect(result.messages[0]?.md).toBe('Repeat this');
    expect(result.messages[2]?.md).toBe('Repeat this');
    expect(result.messages[1]?.md).toBe('First segment\n\nSecond segment');
    expect(result.messages[3]?.md).toBe(result.messages[1]?.md);
  });

  it('uses explicit roles rather than localized labels, article ancestry or position', () => {
    const result =
      parse(`<article>${message('user', 'Question')}${message('assistant', 'Answer')}</article>
      <article><p>Unrelated article</p></article><div class="markdown">Unrelated markdown</div>`);
    expect(result.messages.map((item) => [item.role, item.md])).toEqual([
      ['user', 'Question'],
      ['assistant', 'Answer']
    ]);
  });

  it('fails closed with a diagnostic when an explicit conversation role is unknown', () => {
    const result = parse(
      message('user', 'Question') +
        message('assistant', 'Answer') +
        message('future-role', 'Unrecognized message')
    );
    expect(result.messages).toEqual([]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'chatgpt_role_unrecognized', severity: 'error' })
      ])
    );
  });

  it('fails closed when a semantic message body has no role evidence', () => {
    const result = parse(
      message('user', 'Question') +
        message('assistant', 'Answer') +
        '<div data-user-message-bubble>Missing role</div>'
    );
    expect(result.messages).toEqual([]);
    expect(result.diagnostics?.[0]?.code).toBe('chatgpt_role_missing');
  });

  it('does not guess a missing user from assistant-first content', () => {
    const result = parse(message('assistant', '<p>Existing reply</p>'));
    expect(result.messages.map((item) => [item.role, item.md])).toEqual([
      ['assistant', 'Existing reply']
    ]);
  });

  it('retains role-label phrases inside the actual message body', () => {
    const result = parse(
      message('user', '<p>Explain the phrase You said: in this sentence.</p>') +
        message('assistant', '<p>ChatGPT said: is quoted content here.</p>')
    );
    expect(result.messages[0]?.md).toBe('Explain the phrase You said: in this sentence.');
    expect(result.messages[1]?.md).toBe('ChatGPT said: is quoted content here.');
  });

  it('keeps old nested role roots once and ignores hidden copied message trees', () => {
    const result =
      parse(`<article data-message-author-role="user"><div data-message-author-role="user"><div class="whitespace-pre-wrap">Old question</div></div></article>
      <article><h5>ChatGPT said:</h5><div class="markdown">Old answer</div></article>
      <div hidden>${message('assistant', 'Hidden copy')}</div>`);
    expect(result.messages.map((item) => [item.role, item.md])).toEqual([
      ['user', 'Old question'],
      ['assistant', 'Old answer']
    ]);
  });

  it('does not merge nested legacy roots with contradictory role evidence', () => {
    const result = parse(
      '<article data-message-author-role="user"><div class="markdown">Question</div><div data-message-author-role="assistant"><div class="markdown">Answer</div></div></article>'
    );
    expect(result.messages).toEqual([]);
    expect(result.diagnostics?.[0]?.code).toBe('chatgpt_message_boundary_ambiguous');
  });
});

describe('ChatGPT generation completion', () => {
  const parseDocument = (state: string) =>
    new DOMParser().parseFromString(
      `<title>Streaming regression</title><div data-talvt-turn-state="complete">${message('user', 'First question')}${message('assistant', 'Completed first answer')}</div>
    <div data-talvt-turn-state="${state}">${message('user', 'Output eighty neutral lines')}${message('assistant', '<p>First partial line</p>')}</div>`,
      'text/html'
    );
  const extract = (doc: Document) =>
    extractAIChat(doc, 'https://chatgpt.com/c/sanitized-streaming', {
      getMessages: () =>
        Promise.resolve({
          exportAiChatFallbackTitleDeepseek: 'DeepSeek',
          exportAiChatFallbackTitleKimi: 'Kimi',
          exportAiChatFallbackTitleTongyi: 'Tongyi'
        })
    });

  it('rejects a real in_progress turn even when user and partial assistant text are already mounted', async () => {
    const doc = parseDocument('in_progress');
    await expect(extract(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      recoverable: true,
      context: { parserDiagnosticCodes: ['chatgpt_generation_in_progress'] }
    });
    const result = chatgptParser.parse(doc);
    expect(result.messages).toEqual([]);
    expect(result.diagnostics).toEqual([
      { code: 'chatgpt_generation_in_progress', severity: 'error' }
    ]);
  });

  it('does not silently drop a mounted empty modern reply while preserving earlier turns', async () => {
    const doc = parseDocument('complete');
    doc.querySelectorAll('[data-markdown-text-style="assistant-message"]')[1]?.replaceChildren();
    await expect(extract(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['chatgpt_message_content_incomplete'] }
    });
  });

  it.each([true, false])(
    'rejects an unanswered last user turn with transcript busy=%s',
    async (busy) => {
      const doc = new DOMParser().parseFromString(
        `<div data-thread-user-message-navigation-content>
      ${message('user', 'First question')}${message('assistant', 'Completed first answer')}${message('user', 'Waiting for the next answer')}
      ${busy ? '<span role="status" aria-busy="true"></span>' : ''}
    </div>`,
        'text/html'
      );
      await expect(extract(doc)).rejects.toMatchObject({
        code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
        context: {
          parserDiagnosticCodes: [
            busy ? 'chatgpt_generation_in_progress' : 'chatgpt_message_content_incomplete'
          ]
        }
      });
    }
  );

  it('does not confuse an unrelated page status with a busy conversation', async () => {
    const doc = parseDocument('complete');
    const unrelated = doc.createElement('span');
    unrelated.setAttribute('role', 'status');
    unrelated.setAttribute('aria-busy', 'true');
    doc.body.append(unrelated);
    await expect(extract(doc)).resolves.toMatchObject({ meta: { messageCount: 4 } });
  });

  it('ignores hidden stale in_progress turns when exporting the visible finished conversation', async () => {
    const doc = parseDocument('complete');
    const hidden = doc.createElement('div');
    hidden.hidden = true;
    hidden.setAttribute('data-talvt-turn-state', 'in_progress');
    doc.body.append(hidden);
    await expect(extract(doc)).resolves.toMatchObject({ meta: { messageCount: 4 } });
  });

  it('exports the finished response after the observed state becomes complete', async () => {
    const doc = parseDocument('complete');
    const lastAnswer = doc.querySelectorAll('[data-markdown-text-style="assistant-message"]')[1];
    lastAnswer?.append(doc.createTextNode(' Final line eighty.'));
    const result = await extract(doc);
    expect(result.meta?.messageCount).toBe(4);
    expect(result.markdown).toContain('Completed first answer');
    expect(result.markdown).toContain('First partial line');
    expect(result.markdown).toContain('Final line eighty.');
  });
});
