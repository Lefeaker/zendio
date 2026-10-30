/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chatgptParser } from '../../../src/third_party/ai-chat-exporter/platforms/chatgpt';

function parse(html: string) {
  return chatgptParser.parse(new DOMParser().parseFromString(html, 'text/html'));
}

function message(role: string, content: string): string {
  const body =
    role === 'user' ? 'data-user-message-bubble' : 'data-markdown-text-style="assistant-message"';
  return `<div><h4 data-conversation-role="${role}"><span>Role label:</span><span aria-hidden="true">Print label</span></h4><div ${body}>${content}</div><button>Copy</button></div>`;
}

describe('ChatGPT message boundaries', () => {
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

  it('does not guess a missing user from assistant-first content or export empty generation chrome', () => {
    const result = parse(
      message('assistant', '<p>Existing reply</p>') +
        message('user', 'Next question') +
        message('assistant', '<button>Stop generating</button>')
    );
    expect(result.messages.map((item) => [item.role, item.md])).toEqual([
      ['assistant', 'Existing reply'],
      ['user', 'Next question']
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
