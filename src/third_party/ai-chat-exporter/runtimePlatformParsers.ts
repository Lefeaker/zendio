import { monicaParser, perplexityParser } from './platforms/assistantFamily';
import { deepseekParser, doubaoParser, kimiParser, tongyiParser } from './platforms/chineseFamily';
import { geminiParser } from './platforms/gemini';
import { chatgptParser, claudeParser, copilotParser } from './platforms/openaiFamily';
import type { ChatPlatformParser, PlatformId } from './types';

const runtimePlatformParsers: Record<PlatformId, ChatPlatformParser> = {
  chatgpt: chatgptParser,
  claude: claudeParser,
  copilot: copilotParser,
  gemini: geminiParser,
  tongyi: tongyiParser,
  deepseek: deepseekParser,
  kimi: kimiParser,
  doubao: doubaoParser,
  monica: monicaParser,
  perplexity: perplexityParser
};

export function getRuntimePlatformParser(platform: PlatformId): ChatPlatformParser {
  return runtimePlatformParsers[platform];
}
