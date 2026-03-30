import type { ChatPlatformParser, ParseConfig, ParsedResult, PlatformId } from './types';
import { DEFAULT_CHAT_TITLE } from './shared/constants';

const EMPTY_RESULT: ParsedResult = {
  title: DEFAULT_CHAT_TITLE,
  messages: [],
  assets: []
};

type ParserLoader = () => Promise<ChatPlatformParser>;

const parserLoaders = new Map<string, ParserLoader>([
  ['chatgpt', () => import('./platforms/chatgpt').then((m) => m.chatgptParser)],
  ['claude', () => import('./platforms/claude').then((m) => m.claudeParser)],
  ['copilot', () => import('./platforms/copilot').then((m) => m.copilotParser)],
  ['gemini', () => import('./platforms/gemini').then((m) => m.geminiParser)],
  ['tongyi', () => import('./platforms/tongyi').then((m) => m.tongyiParser)],
  ['deepseek', () => import('./platforms/deepseek').then((m) => m.deepseekParser)],
  ['kimi', () => import('./platforms/kimi').then((m) => m.kimiParser)],
  ['doubao', () => import('./platforms/doubao').then((m) => m.doubaoParser)],
  ['monica', () => import('./platforms/monica').then((m) => m.monicaParser)],
  ['perplexity', () => import('./platforms/perplexity').then((m) => m.perplexityParser)]
]);

const parserAliases: Partial<Record<PlatformId, string[]>> = {
  kimi: ['moonshot'],
  perplexity: ['pplx']
};

export async function resolveParserAsync(
  platform: string
): Promise<ChatPlatformParser | undefined> {
  const key = platform.toLowerCase();
  const direct = parserLoaders.get(key);
  if (direct) {
    return direct();
  }

  for (const [id, aliases] of Object.entries(parserAliases)) {
    if (aliases?.includes(key)) {
      return parserLoaders.get(id)?.();
    }
  }

  return undefined;
}

export async function parseChatDOMAsync(
  platform: string,
  doc: Document,
  config?: ParseConfig
): Promise<ParsedResult> {
  const parser = await resolveParserAsync(platform);
  if (!parser) {
    return EMPTY_RESULT;
  }
  return parser.parse(doc, config);
}
