/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { resolveAIChatPlatformByUrl } from '../../../src/third_party/ai-chat-exporter/platformRegistry';
import { AI_CHAT_FIXTURE_MANIFEST } from '../../fixtures/ai-chat/fixtureManifest';

const fixtureRoot = join(process.cwd(), 'tests/fixtures/ai-chat');

const residualFixtures = {
  deepseek: 'current-dom/deepseek-live-residual-2026-06-25.html',
  doubao: 'current-dom/doubao-live-residual-2026-06-25.html',
  perplexity: 'current-dom/perplexity-live-residual-2026-06-25.html',
  tongyi: 'current-dom/tongyi-qianwen-live-residual-2026-06-25.html'
} as const;

function loadFixture(file: string, url = 'https://example.com'): Document {
  const html = readFileSync(join(fixtureRoot, file), 'utf8');
  return new JSDOM(html, { url }).window.document;
}

function count(doc: Document, selector: string): number {
  return doc.querySelectorAll(selector).length;
}

function countAll(doc: Document, selectors: readonly string[]): number {
  return selectors.reduce((total, selector) => total + count(doc, selector), 0);
}

describe('AI chat current-DOM residual fixture shapes', () => {
  it('keeps residual fixtures pending with sanitized 2026-06-25 metadata', () => {
    const residualFiles: readonly string[] = Object.values(residualFixtures).sort();
    const manifestRows = AI_CHAT_FIXTURE_MANIFEST.filter((fixture) =>
      residualFiles.includes(fixture.file)
    ).sort((left, right) => left.file.localeCompare(right.file));

    expect(manifestRows.map((fixture) => fixture.file)).toEqual(residualFiles);

    for (const fixture of manifestRows) {
      expect(fixture.status).toBe('pending');
      expect(fixture.sourceCaptureDate).toBe('2026-06-25');
      expect(fixture.captureKind).toBe('current-dom-sanitized');
      expect(fixture.privacyStatus).toBe('sanitized');
      expect(fixture.ownerMilestone).toMatch(/^P10\/P1[23]$/u);
    }
  });

  it('preserves DeepSeek ds-* live tokens without friendly role wrappers', () => {
    const doc = loadFixture(residualFixtures.deepseek);
    const previous = loadFixture('current-dom/deepseek-current-2026-06-24.html');
    const previousFriendlySelectors = [
      '[data-message-role]',
      '[class*="ds-message-row-user"]',
      '[class*="ds-message-row-assistant"]'
    ];
    const currentContainerSelectors = [
      '[data-message-role]',
      '[data-role="user"]',
      '[data-role="assistant"]',
      'article[data-message-author-role]',
      '[class~="message"]',
      '[class*="message-row"]',
      '[class*="MessageRow"]',
      '[class*="chat-message"]',
      '[class*="ChatMessage"]'
    ];

    expect(count(previous, '[data-message-role]')).toBeGreaterThan(0);
    expect(countAll(doc, previousFriendlySelectors)).toBe(0);
    expect(count(doc, '[class~="ds-message"]')).toBe(2);
    expect(count(doc, '[class~="ds-markdown"]')).toBeGreaterThan(0);
    expect(count(doc, '[class~="ds-markdown-paragraph"]')).toBeGreaterThan(0);
    expect(count(doc, '[class~="ds-markdown-cite"]')).toBeGreaterThan(0);
    expect(count(doc, '[class~="ds-assistant-message-main-content"]')).toBeGreaterThan(0);
    expect(countAll(doc, currentContainerSelectors)).toBe(0);
  });

  it('preserves Qianwen/Tongyi live wrappers while old role selectors stay empty', () => {
    const url = 'https://www.qianwen.com/chat/sanitized-residual';
    const doc = loadFixture(residualFixtures.tongyi, url);
    const previous = loadFixture('current-dom/tongyi-qianwen-current-2026-06-24.html', url);
    const currentRoleSelectors = [
      '[class*="assistant-message"]',
      '[class*="assistantMessage"]',
      '[class*="bot-message"]',
      '[class*="contentBox--"]',
      '[class*="questionItem--"]',
      '[class*="qwen-chat-answer"]',
      '[class*="qwen-chat-question"]',
      '[class*="user-message"]',
      '[class*="userMessage"]',
      '[data-role="assistant"]',
      '[data-role="user"]'
    ];

    expect(resolveAIChatPlatformByUrl(url, doc)).toBe('tongyi');
    expect(count(previous, '[data-role="user"], [data-role="assistant"]')).toBeGreaterThan(0);
    expect(count(doc, '[class*="message-select-wrapper-question-"]')).toBeGreaterThan(0);
    expect(count(doc, '[class*="message-select-wrapper-answer-"]')).toBeGreaterThan(0);
    expect(count(doc, '[class~="chat-question-wrap"]')).toBeGreaterThan(0);
    expect(count(doc, '[class*="answerItem-"]')).toBeGreaterThan(0);
    expect(count(doc, '[class~="qk-md-text"]')).toBeGreaterThan(0);
    expect(count(doc, '[data-msgid]')).toBeGreaterThan(0);
    expect(count(doc, '[data-chat-id]')).toBeGreaterThan(0);
    expect(count(doc, '[data-req-id]')).toBeGreaterThan(0);
    expect(countAll(doc, currentRoleSelectors)).toBe(0);
  });

  it('preserves Doubao live data attributes without legacy message roots', () => {
    const doc = loadFixture(residualFixtures.doubao);
    const previous = loadFixture('current-dom/doubao-current-2026-06-24.html');
    const currentMessageRootSelectors = [
      '[class*="message-block-container"]',
      '[class~="semi-chat-message"]',
      '[data-testid="message_assistant"]',
      '[data-testid="message_user"]'
    ];

    expect(count(previous, '[class~="semi-chat-message"]')).toBeGreaterThan(0);
    expect(count(doc, '[data-message-id]')).toBeGreaterThanOrEqual(2);
    expect(count(doc, '[data-container-type]')).toBeGreaterThanOrEqual(2);
    expect(count(doc, '[data-thinking-box]')).toBeGreaterThan(0);
    expect(count(doc, '[data-render-engine]')).toBeGreaterThan(0);
    expect(count(doc, '[class~="send-text"]')).toBeGreaterThan(0);
    expect(doc.body.textContent).toContain('Do not collect sidebar history');
    expect(doc.body.textContent).toContain('Do not collect suggestion chip text');
    expect(countAll(doc, currentMessageRootSelectors)).toBe(0);
  });

  it('preserves Perplexity all-user risk tokens and assistant-selector gap', () => {
    const doc = loadFixture(residualFixtures.perplexity);
    const previous = loadFixture('current-dom/perplexity-current-2026-06-24.html');
    const currentUserSelectors = [
      '[data-testid*="question" i]',
      '[data-testid*="query" i]',
      '[aria-label*="question" i]',
      '[aria-label*="query" i]',
      '[class*="query"]'
    ];
    const currentAssistantSelectors = [
      '[data-testid*="answer" i]',
      '[data-testid*="response" i]',
      '[aria-label*="answer" i]',
      '[aria-label*="response" i]',
      '[class*="answer"]',
      '[class*="response"]'
    ];

    expect(count(previous, '[data-testid="answer"]')).toBeGreaterThan(0);
    expect(count(doc, '[class~="group/query"]')).toBeGreaterThanOrEqual(4);
    expect(count(doc, '[class~="max-w-threadContentWidth"]')).toBeGreaterThan(0);
    expect(count(doc, '[class~="prose"]')).toBeGreaterThan(0);
    expect(countAll(doc, currentUserSelectors)).toBeGreaterThan(0);
    expect(countAll(doc, currentAssistantSelectors)).toBe(0);
    expect(doc.body.textContent).toContain('Sanitized source card should not become a message.');
    expect(doc.body.textContent).toContain('Sidebar suggestion should not become a message.');
    expect(doc.body.textContent).toContain('Copy');
  });

  it.todo('P12 enables DeepSeek residual parse: two messages with user then assistant roles');
  it.todo('P12 enables Qianwen/Tongyi residual parse through the Tongyi parser with both roles');
  it.todo(
    'P12 enables Doubao residual parse while excluding sidebar, thinking, and suggestion noise'
  );
  it.todo(
    'P13 enables Perplexity residual parse with user and assistant roles, not all user roles'
  );
});
