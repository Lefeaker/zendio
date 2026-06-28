import { describe, expect, it } from 'vitest';

import { validateAIChatExtraction } from '../../../src/content/extractors/aiChatExtractionValidation';
import type { AppError } from '../../../src/shared/errors/types';
import type { ParsedMessage } from '../../../src/third_party/ai-chat-exporter/types';

type ValidationMessage = Pick<ParsedMessage, 'id' | 'role' | 'timestamp'> & {
  text: string;
};

function validate(messages: ValidationMessage[]): void {
  validateAIChatExtraction({
    platform: 'perplexity',
    url: 'https://www.perplexity.ai/search/sanitized',
    title: 'Sanitized conversation',
    messages
  });
}

function expectValidationError(
  messages: ValidationMessage[],
  expectedContext: Record<string, unknown>
): void {
  let error: AppError | undefined;
  try {
    validate(messages);
  } catch (caught) {
    error = caught as AppError;
  }

  expect(error).toMatchObject({
    code: 'EXTRACTION_AI_CHAT_PARSE_ROLE_INCOMPLETE',
    context: expect.objectContaining(expectedContext)
  });
}

describe('validateAIChatExtraction', () => {
  it('rejects a single assistant message because the user prompt was not recovered', () => {
    expectValidationError(
      [{ id: 'a1', role: 'assistant', text: 'Recovered answer without the prompt.' }],
      {
        messageCount: 1,
        firstConversationRole: 'assistant',
        requiredFirstConversationRole: 'user',
        recoveredRoles: ['assistant']
      }
    );
  });

  it('rejects a single user message because no assistant turn was recovered', () => {
    expectValidationError(
      [{ id: 'u1', role: 'user', text: 'Recovered prompt without an answer.' }],
      {
        messageCount: 1,
        firstConversationRole: 'user',
        requiredFirstConversationRole: 'user',
        recoveredRoles: ['user']
      }
    );
  });

  it('rejects system-only output because no conversation turn was recovered', () => {
    expectValidationError([{ id: 's1', role: 'system', text: 'Conversation metadata only.' }], {
      messageCount: 1,
      requiredFirstConversationRole: 'user',
      recoveredRoles: ['system']
    });
  });

  it('rejects assistant-first multi-message results even when both roles are present', () => {
    expectValidationError(
      [
        { id: 'a1', role: 'assistant', text: 'Recovered answer before prompt.' },
        { id: 'u1', role: 'user', text: 'Recovered prompt after answer.' }
      ],
      {
        messageCount: 2,
        firstConversationRole: 'assistant',
        requiredFirstConversationRole: 'user',
        recoveredRoles: ['assistant', 'user']
      }
    );
  });

  it('ignores leading system messages when enforcing the first conversation role', () => {
    expect(() =>
      validate([
        { id: 's1', role: 'system', text: 'Conversation metadata.' },
        { id: 'u1', role: 'user', text: 'Recovered prompt.' },
        { id: 'a1', role: 'assistant', text: 'Recovered answer.' }
      ])
    ).not.toThrow();
  });

  it('rejects system-leading assistant output when no user prompt precedes the answer', () => {
    expectValidationError(
      [
        { id: 's1', role: 'system', text: 'Conversation metadata.' },
        { id: 'a1', role: 'assistant', text: 'Recovered answer without the prompt.' }
      ],
      {
        messageCount: 2,
        firstConversationRole: 'assistant',
        requiredFirstConversationRole: 'user',
        recoveredRoles: ['system', 'assistant']
      }
    );
  });
});
