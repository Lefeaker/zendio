import type { PlatformId } from '../types';
import { AI_CHAT_PLATFORM_DEFINITIONS } from '../platformRegistry';

export const DEFAULT_CHAT_TITLE = 'Conversation';

export const SUPPORTED_PLATFORMS: PlatformId[] = AI_CHAT_PLATFORM_DEFINITIONS.map(
  (definition) => definition.id
);
