import type { PlatformId } from '../types';
import { getAIChatSupportedPlatformIds } from '../platformIdentity';

export const DEFAULT_CHAT_TITLE = 'Conversation';

export const SUPPORTED_PLATFORMS: PlatformId[] = getAIChatSupportedPlatformIds();
