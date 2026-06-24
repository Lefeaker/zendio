/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  composeRoleResolvers,
  parseWithProfile,
  removeElements,
  roleByContainerAttribute,
  roleByDescendant
} from '../../../src/third_party/ai-chat-exporter/shared/profileEngine';
import type { ParserProfile } from '../../../src/third_party/ai-chat-exporter/shared/profileTypes';

function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function baseProfile(overrides: Partial<ParserProfile> = {}): ParserProfile {
  return {
    platform: 'monica',
    title: () => 'Synthetic Thread',
    containers: '[data-message]',
    role: () => 'assistant',
    content: ['.message-body'],
    ...overrides
  };
}

describe('profile parser engine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves roles from container attributes and creates stable message ids', () => {
    const doc = parseDocument(`
      <main>
        <article data-message data-role="human"><div class="message-body">Prompt</div></article>
        <article data-message data-role="ai"><div class="message-body">Answer</div></article>
      </main>
    `);
    const profile = baseProfile({
      role: roleByContainerAttribute('data-role', {
        human: 'user',
        ai: 'assistant'
      })
    });

    const result = parseWithProfile(doc, profile);

    expect(result.title).toBe('Synthetic Thread');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({ id: 'msg-1', role: 'user', md: 'Prompt' });
    expect(result.messages[1]).toMatchObject({ id: 'msg-2', role: 'assistant', md: 'Answer' });
  });

  it('resolves roles from descendant markers through composed resolvers', () => {
    const doc = parseDocument(`
      <main>
        <article data-message>
          <span data-author="user"></span>
          <div class="message-body">Follow-up question</div>
        </article>
        <article data-message>
          <span data-author="assistant"></span>
          <div class="message-body">Follow-up answer</div>
        </article>
      </main>
    `);
    const profile = baseProfile({
      role: composeRoleResolvers(
        roleByDescendant('[data-author="user"]', 'user'),
        roleByDescendant('[data-author="assistant"]', 'assistant')
      )
    });

    const result = parseWithProfile(doc, profile);

    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('uses ordered content selector fallback', () => {
    const doc = parseDocument(`
      <main>
        <article data-message>
          <p>Fallback paragraph</p>
          <div class="markdown"><strong>Preferred markdown</strong></div>
        </article>
      </main>
    `);
    const profile = baseProfile({
      content: ['.missing', '.markdown', 'p']
    });

    const result = parseWithProfile(doc, profile);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.md).toBe('**Preferred markdown**');
  });

  it('runs cleanup hooks before markdown conversion', () => {
    const doc = parseDocument(`
      <main>
        <article data-message>
          <div class="message-body">
            <p>Useful answer</p>
            <button type="button">Copy</button>
            <svg><title>icon</title></svg>
          </div>
        </article>
      </main>
    `);
    const profile = baseProfile({
      cleanup: removeElements(['button', 'svg'])
    });

    const result = parseWithProfile(doc, profile);

    expect(result.messages[0]?.md).toContain('Useful answer');
    expect(result.messages[0]?.md).not.toContain('Copy');
    expect(result.messages[0]?.md).not.toContain('icon');
  });

  it('suppresses duplicate messages by normalized content when configured', () => {
    const doc = parseDocument(`
      <main>
        <article data-message><div class="message-body">Repeated answer</div></article>
        <article data-message><div class="message-body">  Repeated   answer  </div></article>
        <article data-message><div class="message-body">Distinct answer</div></article>
      </main>
    `);
    const profile = baseProfile({
      dedupe: 'content'
    });

    const result = parseWithProfile(doc, profile);

    expect(result.messages.map((message) => message.md)).toEqual([
      'Repeated answer',
      'Distinct answer'
    ]);
  });

  it('returns diagnostics when no containers are found', () => {
    const doc = parseDocument('<main><p>No chat here</p></main>');

    const result = parseWithProfile(doc, baseProfile());

    expect(result.messages).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      code: 'profile_no_containers',
      severity: 'warning',
      detail: 'monica'
    });
  });

  it('returns diagnostics when containers produce no messages', () => {
    const doc = parseDocument(`
      <main>
        <article data-message><div class="message-body">   </div></article>
      </main>
    `);

    const result = parseWithProfile(doc, baseProfile());

    expect(result.messages).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      code: 'profile_no_messages',
      severity: 'warning',
      detail: 'monica'
    });
  });
});
