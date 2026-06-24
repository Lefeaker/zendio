import type { PlatformId } from './types';

export type AIChatPlatformDefinition = {
  id: PlatformId;
  displayName: string;
  hostPatterns: readonly RegExp[];
  aliases?: readonly string[];
  analyticsPlatform?: string;
  optionsUrl?: string;
};

export const AI_CHAT_PLATFORM_DEFINITIONS = [
  {
    id: 'chatgpt',
    displayName: 'ChatGPT',
    hostPatterns: [/^(?:www\.)?chatgpt\.com$/i, /^(?:www\.)?chat\.openai\.com$/i],
    analyticsPlatform: 'chatgpt',
    optionsUrl: 'https://chatgpt.com/'
  },
  {
    id: 'claude',
    displayName: 'Claude',
    hostPatterns: [/^(?:www\.)?claude\.ai$/i],
    analyticsPlatform: 'claude',
    optionsUrl: 'https://claude.ai/'
  },
  {
    id: 'copilot',
    displayName: 'Copilot',
    hostPatterns: [/^(?:www\.)?copilot\.microsoft\.com$/i],
    analyticsPlatform: 'copilot',
    optionsUrl: 'https://copilot.microsoft.com/'
  },
  {
    id: 'gemini',
    displayName: 'Gemini',
    hostPatterns: [/^(?:www\.)?gemini\.google\.com$/i],
    analyticsPlatform: 'gemini',
    optionsUrl: 'https://gemini.google.com/'
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
    analyticsPlatform: 'tongyi',
    optionsUrl: 'https://tongyi.aliyun.com/'
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    hostPatterns: [/^(?:www\.|chat\.)?deepseek\.com$/i],
    analyticsPlatform: 'deepseek',
    optionsUrl: 'https://chat.deepseek.com/'
  },
  {
    id: 'kimi',
    displayName: 'Kimi',
    hostPatterns: [/^(?:www\.)?kimi\.com$/i, /^kimi\.moonshot\.cn$/i],
    aliases: ['moonshot'],
    analyticsPlatform: 'kimi',
    optionsUrl: 'https://www.kimi.com/'
  },
  {
    id: 'doubao',
    displayName: 'Doubao',
    hostPatterns: [/^(?:[a-z0-9-]+\.)*doubao\.com$/i],
    analyticsPlatform: 'doubao',
    optionsUrl: 'https://www.doubao.com/'
  },
  {
    id: 'monica',
    displayName: 'Monica',
    hostPatterns: [/^(?:[a-z0-9-]+\.)*monica\.im$/i],
    analyticsPlatform: 'monica',
    optionsUrl: 'https://monica.im/'
  },
  {
    id: 'perplexity',
    displayName: 'Perplexity',
    hostPatterns: [/^(?:www\.)?perplexity\.ai$/i],
    aliases: ['pplx'],
    analyticsPlatform: 'perplexity',
    optionsUrl: 'https://www.perplexity.ai/'
  }
] as const satisfies readonly AIChatPlatformDefinition[];

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

  const definition = AI_CHAT_PLATFORM_DEFINITIONS.find((candidate) =>
    candidate.hostPatterns.some((pattern) => pattern.test(hostname))
  );

  return definition?.id ?? null;
}

export function isAIChatHost(inputUrl: string, doc?: Document): boolean {
  return resolveAIChatPlatformByUrl(inputUrl, doc) !== null;
}

export function getAIChatPlatformAliases(): ReadonlyMap<PlatformId, readonly string[]> {
  const entries: Array<readonly [PlatformId, readonly string[]]> = [];

  for (const definition of AI_CHAT_PLATFORM_DEFINITIONS) {
    if ('aliases' in definition) {
      entries.push([definition.id, definition.aliases]);
    }
  }

  return new Map(entries);
}
