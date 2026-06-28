import type { PlatformId } from './types';

export type AIChatFallbackTitleMessageKey =
  | 'exportAiChatFallbackTitleDeepseek'
  | 'exportAiChatFallbackTitleKimi'
  | 'exportAiChatFallbackTitleTongyi';

export type AIChatFallbackTitlePolicy =
  | {
      kind: 'localized';
      messageKey: AIChatFallbackTitleMessageKey;
      required: true;
    }
  | {
      kind: 'neutral';
      title: string;
    };

export type AIChatPlatformDefinition = {
  id: PlatformId;
  displayName: string;
  productSurfaceLabel?: string;
  hostPatterns: readonly RegExp[];
  aliases?: readonly string[];
  analyticsPlatform?: string;
  optionsUrl: string;
  fallbackTitlePolicy?: AIChatFallbackTitlePolicy;
};

export type AIChatProductSurfacePlatform = {
  id: PlatformId;
  label: string;
  url: string;
};

export const AI_CHAT_PLATFORM_DEFINITIONS: readonly AIChatPlatformDefinition[] = [
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
    productSurfaceLabel: 'Tongyi/Qianwen',
    hostPatterns: [
      /^(?:www\.)?tongyi\.aliyun\.com$/i,
      /^(?:www\.)?tongyi\.com$/i,
      /^(?:www\.)?qianwen\.com$/i
    ],
    aliases: ['qianwen'],
    analyticsPlatform: 'tongyi',
    optionsUrl: 'https://tongyi.aliyun.com/',
    fallbackTitlePolicy: {
      kind: 'localized',
      messageKey: 'exportAiChatFallbackTitleTongyi',
      required: true
    }
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    hostPatterns: [/^(?:www\.|chat\.)?deepseek\.com$/i],
    analyticsPlatform: 'deepseek',
    optionsUrl: 'https://chat.deepseek.com/',
    fallbackTitlePolicy: {
      kind: 'localized',
      messageKey: 'exportAiChatFallbackTitleDeepseek',
      required: true
    }
  },
  {
    id: 'kimi',
    displayName: 'Kimi',
    hostPatterns: [/^(?:www\.)?kimi\.com$/i, /^kimi\.moonshot\.cn$/i],
    aliases: ['moonshot'],
    analyticsPlatform: 'kimi',
    optionsUrl: 'https://www.kimi.com/',
    fallbackTitlePolicy: {
      kind: 'localized',
      messageKey: 'exportAiChatFallbackTitleKimi',
      required: true
    }
  },
  {
    id: 'doubao',
    displayName: 'Doubao',
    hostPatterns: [/^(?:[a-z0-9-]+\.)*doubao\.com$/i],
    analyticsPlatform: 'doubao',
    optionsUrl: 'https://www.doubao.com/',
    fallbackTitlePolicy: {
      kind: 'neutral',
      title: 'Doubao Chat'
    }
  },
  {
    id: 'monica',
    displayName: 'Monica',
    hostPatterns: [/^(?:[a-z0-9-]+\.)*monica\.im$/i],
    analyticsPlatform: 'monica',
    optionsUrl: 'https://monica.im/',
    fallbackTitlePolicy: {
      kind: 'neutral',
      title: 'Monica Chat'
    }
  },
  {
    id: 'perplexity',
    displayName: 'Perplexity',
    hostPatterns: [/^(?:www\.)?perplexity\.ai$/i],
    aliases: ['pplx'],
    analyticsPlatform: 'perplexity',
    optionsUrl: 'https://www.perplexity.ai/'
  }
] as const;

export function getAIChatPlatformDefinition(
  platform: PlatformId
): AIChatPlatformDefinition | undefined {
  return AI_CHAT_PLATFORM_DEFINITIONS.find((definition) => definition.id === platform);
}

export function getAIChatProductSurfacePlatforms(): AIChatProductSurfacePlatform[] {
  return AI_CHAT_PLATFORM_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.productSurfaceLabel ?? definition.displayName,
    url: definition.optionsUrl
  }));
}

export function getAIChatFallbackTitlePolicy(
  platform: PlatformId
): AIChatFallbackTitlePolicy | undefined {
  return getAIChatPlatformDefinition(platform)?.fallbackTitlePolicy;
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
    if (definition.aliases) {
      entries.push([definition.id, definition.aliases]);
    }
  }

  return new Map(entries);
}
