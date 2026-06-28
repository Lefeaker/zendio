import {
  AI_CHAT_PLATFORM_IDENTITIES,
  getAIChatPlatformIdentityDefinition
} from './platformIdentity';
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

export type AIChatPlatformProductDefinition = {
  id: PlatformId;
  productSurfaceLabel?: string;
  optionsUrl: string;
  fallbackTitlePolicy?: AIChatFallbackTitlePolicy;
};

export type AIChatProductSurfacePlatform = {
  id: PlatformId;
  label: string;
  url: string;
};

export const AI_CHAT_PLATFORM_PRODUCT_DEFINITIONS: readonly AIChatPlatformProductDefinition[] = [
  {
    id: 'chatgpt',
    optionsUrl: 'https://chatgpt.com/'
  },
  {
    id: 'claude',
    optionsUrl: 'https://claude.ai/'
  },
  {
    id: 'copilot',
    optionsUrl: 'https://copilot.microsoft.com/'
  },
  {
    id: 'gemini',
    optionsUrl: 'https://gemini.google.com/'
  },
  {
    id: 'tongyi',
    productSurfaceLabel: 'Tongyi/Qianwen',
    optionsUrl: 'https://tongyi.aliyun.com/',
    fallbackTitlePolicy: {
      kind: 'localized',
      messageKey: 'exportAiChatFallbackTitleTongyi',
      required: true
    }
  },
  {
    id: 'deepseek',
    optionsUrl: 'https://chat.deepseek.com/',
    fallbackTitlePolicy: {
      kind: 'localized',
      messageKey: 'exportAiChatFallbackTitleDeepseek',
      required: true
    }
  },
  {
    id: 'kimi',
    optionsUrl: 'https://www.kimi.com/',
    fallbackTitlePolicy: {
      kind: 'localized',
      messageKey: 'exportAiChatFallbackTitleKimi',
      required: true
    }
  },
  {
    id: 'doubao',
    optionsUrl: 'https://www.doubao.com/',
    fallbackTitlePolicy: {
      kind: 'neutral',
      title: 'Doubao Chat'
    }
  },
  {
    id: 'monica',
    optionsUrl: 'https://monica.im/',
    fallbackTitlePolicy: {
      kind: 'neutral',
      title: 'Monica Chat'
    }
  },
  {
    id: 'perplexity',
    optionsUrl: 'https://www.perplexity.ai/'
  }
] as const;

export function getAIChatPlatformProductDefinition(
  platform: PlatformId
): AIChatPlatformProductDefinition | undefined {
  return AI_CHAT_PLATFORM_PRODUCT_DEFINITIONS.find((definition) => definition.id === platform);
}

function getRequiredProductDefinition(platform: PlatformId): AIChatPlatformProductDefinition {
  const product = getAIChatPlatformProductDefinition(platform);
  if (!product) {
    throw new Error(`Missing AI chat product-surface metadata for ${platform}`);
  }
  return product;
}

export function getAIChatProductSurfacePlatforms(): AIChatProductSurfacePlatform[] {
  return AI_CHAT_PLATFORM_IDENTITIES.map((identity) => {
    const product = getRequiredProductDefinition(identity.id);
    return {
      id: identity.id,
      label: product.productSurfaceLabel ?? identity.displayName,
      url: product.optionsUrl
    };
  });
}

export function getAIChatFallbackTitlePolicy(
  platform: PlatformId
): AIChatFallbackTitlePolicy | undefined {
  return getAIChatPlatformProductDefinition(platform)?.fallbackTitlePolicy;
}

export function getAIChatProductSurfaceLabel(platform: PlatformId): string {
  const identity = getAIChatPlatformIdentityDefinition(platform);
  const product = getRequiredProductDefinition(platform);
  return product.productSurfaceLabel ?? identity?.displayName ?? platform;
}
