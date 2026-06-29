import {
  AI_CHAT_PLATFORM_IDENTITIES,
  type AIChatPlatformIdentityDefinition
} from './platformIdentity';
import {
  getAIChatPlatformProductDefinition,
  type AIChatPlatformProductDefinition
} from './platformProductSurface';
import type { PlatformId } from './types';

export type {
  AIChatPlatformIdentityDefinition,
  AIChatPlatformIdentityDefinition as AIChatPlatformDefinitionIdentity
} from './platformIdentity';
export {
  AI_CHAT_PLATFORM_IDENTITIES,
  getAIChatPlatformAliases,
  getAIChatPlatformIdentityDefinition,
  getAIChatSupportedPlatformIds,
  isAIChatHost,
  normalizeHostname,
  resolveAIChatPlatformByUrl
} from './platformIdentity';
export type {
  AIChatFallbackTitleMessageKey,
  AIChatFallbackTitlePolicy,
  AIChatPlatformProductDefinition,
  AIChatProductSurfacePlatform
} from './platformProductSurface';
export {
  AI_CHAT_PLATFORM_PRODUCT_DEFINITIONS,
  getAIChatFallbackTitlePolicy,
  getAIChatPlatformProductDefinition,
  getAIChatProductSurfaceLabel,
  getAIChatProductSurfacePlatforms
} from './platformProductSurface';

export type AIChatPlatformDefinition = AIChatPlatformIdentityDefinition &
  AIChatPlatformProductDefinition;

function mergePlatformDefinition(
  identity: AIChatPlatformIdentityDefinition
): AIChatPlatformDefinition {
  const product = getAIChatPlatformProductDefinition(identity.id);
  if (!product) {
    throw new Error(`Missing AI chat product-surface metadata for ${identity.id}`);
  }

  const definition: AIChatPlatformDefinition = {
    ...identity,
    optionsUrl: product.optionsUrl
  };

  if (product.productSurfaceLabel) {
    definition.productSurfaceLabel = product.productSurfaceLabel;
  }
  if (product.fallbackTitlePolicy) {
    definition.fallbackTitlePolicy = product.fallbackTitlePolicy;
  }

  return definition;
}

export const AI_CHAT_PLATFORM_DEFINITIONS: readonly AIChatPlatformDefinition[] =
  AI_CHAT_PLATFORM_IDENTITIES.map(mergePlatformDefinition);

export function getAIChatPlatformDefinition(
  platform: PlatformId
): AIChatPlatformDefinition | undefined {
  return AI_CHAT_PLATFORM_DEFINITIONS.find((definition) => definition.id === platform);
}
