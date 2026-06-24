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
  diagnostics?: readonly ParseDiagnostic[];
};

function getParserDiagnosticCodes(diagnostics: readonly ParseDiagnostic[] | undefined): string[] {
  if (!diagnostics?.length) {
    return [];
  }

  return [...new Set(diagnostics.map((diagnostic) => diagnostic.code).filter(Boolean))];
}

export function validateAIChatExtraction(input: AIChatValidationInput): void {
  if (input.messages.length > 0) {
    return;
  }

  const parserDiagnosticCodes = getParserDiagnosticCodes(input.diagnostics);

  throw extractionErrors.aiChatParseEmpty({
    url: input.url,
    type: 'ai_chat',
    platform: input.platform,
    messageCount: 0,
    ...(parserDiagnosticCodes.length > 0 ? { parserDiagnosticCodes } : {})
  });
}
