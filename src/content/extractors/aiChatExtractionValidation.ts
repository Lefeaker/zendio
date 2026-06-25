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

export function validateAIChatExtraction(input: AIChatValidationInput): void {
  const parserDiagnosticCodes = getParserDiagnosticCodes(input.diagnostics);

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
  if (
    input.messages.length >= 2 &&
    (!recoveredRoleSet.has('user') || !recoveredRoleSet.has('assistant'))
  ) {
    throw extractionErrors.aiChatParseRoleIncomplete({
      url: input.url,
      type: 'ai_chat',
      platform: input.platform,
      messageCount: input.messages.length,
      recoveredRoles,
      ...(parserDiagnosticCodes.length > 0 ? { parserDiagnosticCodes } : {})
    });
  }
}
