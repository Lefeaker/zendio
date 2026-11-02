import { extractionErrors } from '../../shared/errors/extractionErrors';
import type { ParseDiagnostic } from '../../third_party/ai-chat-exporter/types';

type AIChatValidationMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: string;
};

export type AIChatValidationInput = {
  platform: string;
  url: string;
  title: string;
  messages: AIChatValidationMessage[];
  diagnostics?: readonly ParseDiagnostic[] | undefined;
};

function getParserDiagnosticCodes(diagnostics: readonly ParseDiagnostic[] | undefined): string[] {
  if (!diagnostics?.length) {
    return [];
  }

  return [...new Set(diagnostics.map((diagnostic) => diagnostic.code).filter(Boolean))];
}

function getRecoveredRoles(messages: AIChatValidationMessage[]): AIChatValidationMessage['role'][] {
  return [...new Set(messages.map((message) => message.role))];
}

function getFirstConversationRole(
  messages: AIChatValidationMessage[]
): AIChatValidationMessage['role'] | undefined {
  return messages.find((message) => message.role !== 'system')?.role;
}

function throwRoleIncomplete(
  input: AIChatValidationInput,
  recoveredRoles: AIChatValidationMessage['role'][],
  parserDiagnosticCodes: string[],
  firstConversationRole: AIChatValidationMessage['role'] | undefined
): never {
  throw extractionErrors.aiChatParseRoleIncomplete({
    url: input.url,
    type: 'ai_chat',
    platform: input.platform,
    messageCount: input.messages.length,
    recoveredRoles,
    ...(firstConversationRole ? { firstConversationRole } : {}),
    requiredFirstConversationRole: 'user',
    ...(parserDiagnosticCodes.length > 0 ? { parserDiagnosticCodes } : {})
  });
}

export function validateAIChatExtraction(input: AIChatValidationInput): void {
  const parserDiagnosticCodes = getParserDiagnosticCodes(input.diagnostics);
  const hasFatalDiagnostic = input.diagnostics?.some(
    (diagnostic) => diagnostic.severity === 'error'
  );

  if (
    input.diagnostics?.some(
      (diagnostic) =>
        diagnostic.severity === 'error' &&
        (diagnostic.code === 'chatgpt_generation_in_progress' ||
          diagnostic.code === 'chatgpt_message_content_incomplete' ||
          diagnostic.code === 'grok_message_content_incomplete')
    )
  ) {
    throw extractionErrors.aiChatPreparationIncomplete({
      url: input.url,
      type: 'ai_chat',
      platform: input.platform,
      messageCount: input.messages.length,
      parserDiagnosticCodes
    });
  }

  if (input.messages.length === 0) {
    throw extractionErrors.aiChatParseEmpty({
      url: input.url,
      type: 'ai_chat',
      platform: input.platform,
      messageCount: 0,
      ...(parserDiagnosticCodes.length > 0 ? { parserDiagnosticCodes } : {})
    });
  }

  const recoveredRoles = getRecoveredRoles(input.messages);
  const recoveredRoleSet = new Set(recoveredRoles);
  const firstConversationRole = getFirstConversationRole(input.messages);
  if (hasFatalDiagnostic) {
    throwRoleIncomplete(input, recoveredRoles, parserDiagnosticCodes, firstConversationRole);
  }
  if (firstConversationRole !== 'user') {
    throwRoleIncomplete(input, recoveredRoles, parserDiagnosticCodes, firstConversationRole);
  }

  if (!recoveredRoleSet.has('user') || !recoveredRoleSet.has('assistant')) {
    throwRoleIncomplete(input, recoveredRoles, parserDiagnosticCodes, firstConversationRole);
  }
}
