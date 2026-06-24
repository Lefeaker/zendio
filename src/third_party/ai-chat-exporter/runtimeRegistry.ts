import type { ChatPlatformParser, ParseConfig, ParsedResult, PlatformId } from './types';
import { DEFAULT_CHAT_TITLE, SUPPORTED_PLATFORMS } from './shared/constants';
import { getAIChatPlatformAliases } from './platformRegistry';

const EMPTY_RESULT: ParsedResult = {
  title: DEFAULT_CHAT_TITLE,
  messages: [],
  assets: []
};

type ParserLoader = () => Promise<ChatPlatformParser>;

async function loadRuntimePlatformParser(platform: PlatformId): Promise<ChatPlatformParser> {
  const { getRuntimePlatformParser } = await import('./runtimePlatformParsers');
  return getRuntimePlatformParser(platform);
}

const parserLoaders = new Map<string, ParserLoader>(
  SUPPORTED_PLATFORMS.map((platform) => [platform, () => loadRuntimePlatformParser(platform)])
);

const platformAliases = getAIChatPlatformAliases();

export async function resolveParserAsync(
  platform: string
): Promise<ChatPlatformParser | undefined> {
  const key = platform.toLowerCase();
  const direct = parserLoaders.get(key);
  if (direct) {
    return direct();
  }

  for (const [id, aliases] of platformAliases.entries()) {
    if (aliases.includes(key)) {
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
