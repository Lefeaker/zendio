/* @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeParser } from '../../../src/third_party/ai-chat-exporter/platforms/claude';
import { validateAIChatExtraction } from '../../../src/content/extractors/aiChatExtractionValidation';
import type { ParsedResult } from '../../../src/third_party/ai-chat-exporter/types';

function fixture(name: string): Document {
  return new DOMParser().parseFromString(
    readFileSync(join(process.cwd(), 'tests/fixtures/ai-chat', name), 'utf8'),
    'text/html'
  );
}
function failedCapture(): Document {
  return fixture('current-dom/claude-upload-failed-current-2026-10-31.html');
}
function semanticUser(doc: Document): HTMLElement {
  const root = doc.querySelector<HTMLElement>('[data-cds="UserMessage"][data-turn-key]');
  if (!root) throw new Error('Captured semantic Claude user owner missing');
  return root;
}

// Synthetic completion variant only: captured failure state removed, with the
// existing legacy assistant fixture. This does not claim live Claude success.
function syntheticCompleted(): Document {
  const doc = failedCapture();
  doc
    .querySelectorAll('[data-state="failed"]')
    .forEach((node) => node.removeAttribute('data-state'));
  const assistant = fixture('claude.html').querySelector('.font-claude-response');
  if (!assistant) throw new Error('Existing Claude assistant fixture missing');
  doc.body.append(doc.importNode(assistant, true));
  return doc;
}

function validate(result: ParsedResult) {
  validateAIChatExtraction({
    platform: 'claude',
    url: 'https://claude.ai/chat/synthetic-validation',
    title: result.title,
    diagnostics: result.diagnostics,
    messages: result.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.md ?? message.text ?? ''
    }))
  });
}

function parsePrepared(doc: Document) {
  const candidates = claudeParser.collectImages?.(doc);
  if (!candidates) throw new Error('Claude image collector missing');
  candidates.forEach((candidate, index) =>
    candidate.node.setAttribute('data-aiob-image-token', `claude-test-${index}`)
  );
  const before = doc.documentElement.outerHTML;
  const result = claudeParser.parse(doc, {
    imageResolver(node) {
      const token = node.getAttribute('data-aiob-image-token');
      if (!token) throw new Error('Image was not prepared');
      return `![${node.getAttribute('alt') ?? ''}](aiob-attachment:${token})`;
    }
  });
  expect(doc.documentElement.outerHTML).toBe(before);
  return { candidates, result };
}

describe('Claude semantic user message image ownership', () => {
  it('rejects the actual failed upload/send capture without registering its preview', () => {
    const doc = failedCapture();
    const result = claudeParser.parse(doc);
    expect(result.diagnostics).toContainEqual({ code: 'claude_message_failed', severity: 'error' });
    expect(result.messages).toEqual([]);
    expect(claudeParser.collectImages?.(doc)).toEqual([]);
    expect(() => validate(result)).toThrow();
  });

  it('rejects the whole batch when a failed new user follows an older completed exchange', () => {
    const doc = fixture('claude.html');
    doc.body.append(doc.importNode(semanticUser(failedCapture()), true));
    const result = claudeParser.parse(doc);
    expect(result.diagnostics).toContainEqual({ code: 'claude_message_failed', severity: 'error' });
    expect(result.messages).toEqual([]);
    expect(() => validate(result)).toThrow();
  });

  it('also rejects an attachment failure when the outer user row has no failed state', () => {
    const doc = failedCapture();
    semanticUser(doc).removeAttribute('data-state');
    expect(claudeParser.parse(doc).diagnostics).toContainEqual({
      code: 'claude_message_failed',
      severity: 'error'
    });
    expect(claudeParser.collectImages?.(doc)).toEqual([]);
  });

  it('preserves the sibling image once while selecting only the real text body', () => {
    const doc = syntheticCompleted();
    const { candidates, result } = parsePrepared(doc);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.messageRoot).toBe(semanticUser(doc));
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    const user = result.messages[0];
    expect(user?.md).toContain('![shared-test-image.jpg](aiob-attachment:claude-test-0)');
    expect(user?.md).toContain('Zendio 图片保存兼容性测试');
    expect(user?.md).not.toMatch(/上传失败|发送失败|重试|分钟前/u);
    expect(() => validate(result)).not.toThrow();
  });

  it('retains a synthetic image-only semantic user without a nested text body', () => {
    const doc = syntheticCompleted();
    semanticUser(doc).querySelector('[data-testid="user-message"]')?.remove();
    const { result } = parsePrepared(doc);
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(result.messages[0]?.md).toBe('![shared-test-image.jpg](aiob-attachment:claude-test-0)');
  });

  it('never pulls images or failure flags from an unrelated attachment panel', () => {
    const doc = syntheticCompleted();
    const unrelated = doc.createElement('div');
    unrelated.innerHTML =
      '<div data-cds="MessageAttachmentsImage" data-state="failed"><img src="/unrelated.jpg"></div>';
    doc.body.prepend(unrelated);
    const { candidates, result } = parsePrepared(doc);
    expect(candidates).toHaveLength(1);
    expect(result.diagnostics).toBeUndefined();
    expect(() => validate(result)).not.toThrow();
  });
});
