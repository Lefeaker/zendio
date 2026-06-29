import { deepseekParser, doubaoParser, kimiParser, tongyiParser } from './platforms/chineseFamily';
import { geminiParser } from './platforms/gemini';
import { monicaParser } from './platforms/monica';
import { chatgptParser, claudeParser, copilotParser } from './platforms/openaiFamily';
import { perplexityParser } from './platforms/perplexity';
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
