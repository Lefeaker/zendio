import { DEFAULT_CHAT_TITLE } from './shared/constants';
import { chatgptParser } from './platforms/chatgpt';
import { claudeParser } from './platforms/claude';
import { copilotParser } from './platforms/copilot';
import { geminiParser } from './platforms/gemini';
import { tongyiParser } from './platforms/tongyi';
import { deepseekParser } from './platforms/deepseek';
import { kimiParser } from './platforms/kimi';
import type { ChatPlatformParser, ParsedResult } from './types';

const registeredParsers: ChatPlatformParser[] = [
  chatgptParser,
  claudeParser,
  copilotParser,
  geminiParser,
  tongyiParser,
  deepseekParser,
  kimiParser
];

const parserMap = new Map<string, ChatPlatformParser>();

registeredParsers.forEach(parser => {
  parserMap.set(parser.id, parser);
  parser.aliases?.forEach(alias => parserMap.set(alias, parser));
});

export function resolveParser(platform: string): ChatPlatformParser | undefined {
  const key = platform.toLowerCase();
  return parserMap.get(key);
}

export function listParsers(): ChatPlatformParser[] {
  return [...registeredParsers];
}

export const EMPTY_RESULT: ParsedResult = {
  title: DEFAULT_CHAT_TITLE,
  messages: [],
  assets: []
};
