import { deepseekParser, doubaoParser, kimiParser, tongyiParser } from './platforms/chineseFamily';
import { geminiParser } from './platforms/gemini';
import { monicaParser } from './platforms/monica';
import { chatgptParser, claudeParser, copilotParser } from './platforms/openaiFamily';
import { perplexityParser } from './platforms/perplexity';
import { grokParser } from './platforms/grok';
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
  perplexity: perplexityParser,
  grok: grokParser
};

export function getRuntimePlatformParser(platform: PlatformId): ChatPlatformParser {
  return runtimePlatformParsers[platform];
}
