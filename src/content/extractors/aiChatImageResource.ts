import type { MessagingService } from '../../platform/interfaces/messaging';
import type { BinaryClipAttachment } from '../../shared/types/clip';
import { withRequestDeadline } from '../../shared/utils/requestDeadline';
import {
  AI_CHAT_IMAGE_TIMEOUT_MS,
  AIChatImageResourceError,
  assertAIChatImageAttachment,
  readAIChatImageResponse
} from '../../shared/attachments/aiChatImageBytes';
import {
  isAIChatImageBackgroundUrl,
  isKimiSignedImageUrl,
  parseAIChatImagePageUrl,
  resolveAIChatImageUrl
} from '../../shared/attachments/aiChatImagePolicy';
import {
  FETCH_AI_CHAT_IMAGE,
  type AIChatImageFetchRequest
} from '../../shared/types/aiChatImageMessages';
import { resolveAIChatPlatformByUrl } from '../../third_party/ai-chat-exporter/platformIdentity';
import type { PlatformId } from '../../third_party/ai-chat-exporter/types';

export interface AIChatImageLoaderDependencies {
  fetch?: typeof fetch;
  messaging?: Pick<MessagingService, 'send'>;
  sendBackground?: (request: AIChatImageFetchRequest) => Promise<unknown>;
}

export function createAIChatImageLoader(deps: AIChatImageLoaderDependencies = {}) {
  const messaging = deps.messaging;
  const sendBackground =
    deps.sendBackground ??
    (messaging
      ? (input: AIChatImageFetchRequest) => messaging.send({ type: FETCH_AI_CHAT_IMAGE, ...input })
      : undefined);
  return (
    sourceUrl: string,
    sourcePageUrl: string,
    platform: PlatformId,
    signal: AbortSignal
  ): Promise<BinaryClipAttachment> =>
    withRequestDeadline(AI_CHAT_IMAGE_TIMEOUT_MS, { signal }, async (request) => {
      const source = parseAIChatImagePageUrl(sourcePageUrl);
      if (resolveAIChatPlatformByUrl(source.href) !== platform)
        throw new AIChatImageResourceError('AI_CHAT_IMAGE_SOURCE');
      const url = resolveAIChatImageUrl(sourceUrl, source);
      const authenticatedGrokAsset =
        platform === 'grok' &&
        source.origin === 'https://grok.com' &&
        url.origin === 'https://assets.grok.com';
      const kimiSignedImage = isKimiSignedImageUrl(url, source, platform);
      const requestBackground = sendBackground
        ? async () => {
            request.check();
            const attachment = await sendBackground({
              url: url.href,
              sourceUrl: source.href,
              platform
            });
            request.check();
            assertAIChatImageAttachment(attachment);
            return attachment;
          }
        : undefined;
      let response: Response;
      try {
        response = await (deps.fetch ?? globalThis.fetch).call(globalThis, url.href, {
          credentials: authenticatedGrokAsset
            ? 'include'
            : url.origin === source.origin
              ? 'same-origin'
              : 'omit',
          cache: authenticatedGrokAsset ? 'no-store' : 'default',
          redirect: 'manual',
          signal: request.signal
        });
      } catch (error) {
        request.check();
        if (
          !(error instanceof TypeError) ||
          (url.origin === source.origin && !kimiSignedImage) ||
          !isAIChatImageBackgroundUrl(url, source, platform) ||
          !requestBackground
        )
          throw new AIChatImageResourceError('AI_CHAT_IMAGE_NETWORK');
        return requestBackground();
      }
      if (kimiSignedImage && response.type === 'opaqueredirect' && requestBackground) {
        void response.body?.cancel().catch(() => undefined);
        return requestBackground();
      }
      return readAIChatImageResponse(response, request.signal);
    });
}

export const loadAIChatImage = createAIChatImageLoader();
