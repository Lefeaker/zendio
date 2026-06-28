/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { validateAIChatExtraction } from '../../../src/content/extractors/aiChatExtractionValidation';
import type { AppError } from '../../../src/shared/errors/types';
import { parseChatDOM } from '../../../src/third_party/ai-chat-exporter/parse';
import { resolveAIChatPlatformByUrl } from '../../../src/third_party/ai-chat-exporter/platformIdentity';
import { resolveParser } from '../../../src/third_party/ai-chat-exporter/registry';
import {
  CURRENT_DOM_AI_CHAT_FIXTURES,
  PENDING_CURRENT_DOM_AI_CHAT_FIXTURES
} from '../../fixtures/ai-chat/fixtureManifest';

function loadCurrentDomFixture(file: string): Document {
  const filePath = join(process.cwd(), 'tests/fixtures/ai-chat', file);
  const html = readFileSync(filePath, 'utf8');
  const url = file.includes('tongyi-qianwen')
    ? 'https://www.qianwen.com/chat/sanitized-session'
    : 'https://example.com';
  const dom = new JSDOM(html, { url });
  return dom.window.document;
}

function validateParsedFixture(
  fixture: (typeof CURRENT_DOM_AI_CHAT_FIXTURES)[number],
  result: ReturnType<typeof parseChatDOM>
): AppError | undefined {
  try {
    validateAIChatExtraction({
      platform: fixture.platform,
      url: fixture.file.includes('tongyi-qianwen')
        ? 'https://www.qianwen.com/chat/sanitized-session'
        : `https://example.com/${fixture.platform}`,
      title: result.title,
      messages: result.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text ?? message.md ?? ''
      })),
      diagnostics: result.diagnostics
    });
  } catch (caught) {
    return caught as AppError;
  }

  return undefined;
}

describe('AI chat current-DOM fixture matrix', () => {
  it('keeps unrepaired current-DOM fixture slots pending and out of the parser matrix', () => {
    expect(PENDING_CURRENT_DOM_AI_CHAT_FIXTURES.map((fixture) => fixture.file).sort()).toEqual([
      'current-dom/gemini-current-pass-regression-2026-06-24.html',
      'current-dom/kimi-current-pass-regression-2026-06-24.html',
      'current-dom/monica-current-pass-regression-2026-06-24.html'
    ]);
  });

  it('routes Qianwen current-DOM hosts to the Tongyi parser family', () => {
    const doc = loadCurrentDomFixture('current-dom/tongyi-qianwen-current-2026-06-24.html');

    expect(resolveAIChatPlatformByUrl('https://www.qianwen.com/chat/sanitized-session', doc)).toBe(
      'tongyi'
    );
  });

  it.each(CURRENT_DOM_AI_CHAT_FIXTURES)(
    'parses current-DOM fixture $file with $platform parser',
    (fixture) => {
      const parser = resolveParser(fixture.platform);
      const result = parseChatDOM(fixture.platform, loadCurrentDomFixture(fixture.file), {
        fallbackTitle: 'Catalog Qianwen Title'
      });

      expect(fixture.status).toBe('active');
      expect(parser?.id).toBe(fixture.platform);
      expect(result.messages.length).toBeGreaterThan(0);

      if (fixture.expectedTitle) {
        expect(result.title).toBe(fixture.expectedTitle);
      }

      if (fixture.expectedMessageCount !== undefined) {
        expect(result.messages).toHaveLength(fixture.expectedMessageCount);
      }

      if (fixture.expectedRoles) {
        expect(result.messages.map((message) => message.role)).toEqual(fixture.expectedRoles);
      }

      const markdown = result.messages.map((message) => message.md ?? '').join('\n\n');
      for (const sentinel of fixture.sentinels) {
        expect(markdown).toContain(sentinel);
      }

      for (const sentinel of fixture.absentSentinels ?? []) {
        expect(markdown).not.toContain(sentinel);
      }

      const validationError = validateParsedFixture(fixture, result);
      if (fixture.expectedValidation === 'role-incomplete') {
        expect(validationError).toMatchObject({
          code: 'EXTRACTION_AI_CHAT_PARSE_ROLE_INCOMPLETE',
          context: expect.objectContaining({
            platform: fixture.platform,
            firstConversationRole: 'assistant',
            requiredFirstConversationRole: 'user'
          })
        });
      } else {
        expect(validationError).toBeUndefined();
      }
    }
  );
});
