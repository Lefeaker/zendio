import { chatgptParser } from './platforms/chatgpt';
import { claudeParser } from './platforms/claude';
import { copilotParser } from './platforms/copilot';
import { deepseekParser } from './platforms/deepseek';
import { doubaoParser } from './platforms/doubao';
import { geminiParser } from './platforms/gemini';
import { kimiParser } from './platforms/kimi';
import { monicaParser } from './platforms/monica';
import { perplexityParser } from './platforms/perplexity';
import { tongyiParser } from './platforms/tongyi';
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
