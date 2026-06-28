import type { PlatformId } from './types';

export type AIChatPlatformIdentityDefinition = {
  id: PlatformId;
  displayName: string;
  hostPatterns: readonly RegExp[];
  aliases?: readonly string[];
  analyticsPlatform?: string;
};

export const AI_CHAT_PLATFORM_IDENTITIES: readonly AIChatPlatformIdentityDefinition[] = [
  {
    id: 'chatgpt',
    displayName: 'ChatGPT',
    hostPatterns: [/^(?:www\.)?chatgpt\.com$/i, /^(?:www\.)?chat\.openai\.com$/i],
    analyticsPlatform: 'chatgpt'
  },
  {
    id: 'claude',
    displayName: 'Claude',
    hostPatterns: [/^(?:www\.)?claude\.ai$/i],
    analyticsPlatform: 'claude'
  },
  {
    id: 'copilot',
    displayName: 'Copilot',
    hostPatterns: [/^(?:www\.)?copilot\.microsoft\.com$/i],
    analyticsPlatform: 'copilot'
  },
  {
    id: 'gemini',
    displayName: 'Gemini',
    hostPatterns: [/^(?:www\.)?gemini\.google\.com$/i],
    analyticsPlatform: 'gemini'
  },
  {
    id: 'tongyi',
    displayName: 'Tongyi',
    hostPatterns: [
      /^(?:www\.)?tongyi\.aliyun\.com$/i,
      /^(?:www\.)?tongyi\.com$/i,
      /^(?:www\.)?qianwen\.com$/i
    ],
    aliases: ['qianwen'],
    analyticsPlatform: 'tongyi'
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    hostPatterns: [/^(?:www\.|chat\.)?deepseek\.com$/i],
    analyticsPlatform: 'deepseek'
  },
  {
    id: 'kimi',
    displayName: 'Kimi',
    hostPatterns: [/^(?:www\.)?kimi\.com$/i, /^kimi\.moonshot\.cn$/i],
    aliases: ['moonshot'],
    analyticsPlatform: 'kimi'
  },
  {
    id: 'doubao',
    displayName: 'Doubao',
    hostPatterns: [/^(?:[a-z0-9-]+\.)*doubao\.com$/i],
    analyticsPlatform: 'doubao'
  },
  {
    id: 'monica',
    displayName: 'Monica',
    hostPatterns: [/^(?:[a-z0-9-]+\.)*monica\.im$/i],
    analyticsPlatform: 'monica'
  },
  {
    id: 'perplexity',
    displayName: 'Perplexity',
    hostPatterns: [/^(?:www\.)?perplexity\.ai$/i],
    aliases: ['pplx'],
    analyticsPlatform: 'perplexity'
  }
] as const;

export function getAIChatPlatformIdentityDefinition(
  platform: PlatformId
): AIChatPlatformIdentityDefinition | undefined {
  return AI_CHAT_PLATFORM_IDENTITIES.find((definition) => definition.id === platform);
}

export function getAIChatSupportedPlatformIds(): PlatformId[] {
  return AI_CHAT_PLATFORM_IDENTITIES.map((definition) => definition.id);
}

export function normalizeHostname(inputUrl: string, doc?: Document): string | null {
  try {
    const hostname = new URL(inputUrl).hostname.trim().toLowerCase();
    return hostname ? hostname.replace(/\.$/, '') : null;
  } catch {
    const fallback = doc?.location?.hostname?.trim().toLowerCase();
    return fallback ? fallback.replace(/\.$/, '') : null;
  }
}

export function resolveAIChatPlatformByUrl(inputUrl: string, doc?: Document): PlatformId | null {
  const hostname = normalizeHostname(inputUrl, doc);
  if (!hostname) {
    return null;
  }

  const definition = AI_CHAT_PLATFORM_IDENTITIES.find((candidate) =>
    candidate.hostPatterns.some((pattern) => pattern.test(hostname))
  );

  return definition?.id ?? null;
}

export function isAIChatHost(inputUrl: string, doc?: Document): boolean {
  return resolveAIChatPlatformByUrl(inputUrl, doc) !== null;
}

export function getAIChatPlatformAliases(): ReadonlyMap<PlatformId, readonly string[]> {
  const entries: Array<readonly [PlatformId, readonly string[]]> = [];

  for (const definition of AI_CHAT_PLATFORM_IDENTITIES) {
    if (definition.aliases) {
      entries.push([definition.id, definition.aliases]);
    }
  }

  return new Map(entries);
}
