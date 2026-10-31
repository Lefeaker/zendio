import type { MessageSenderInfo } from '../../platform/interfaces/messaging';
import type { BinaryClipAttachment } from '../../shared/types/clip';
import { withRequestDeadline } from '../../shared/utils/requestDeadline';
import {
  AI_CHAT_IMAGE_TIMEOUT_MS,
  AIChatImageResourceError,
  readAIChatImageResponse
} from '../../shared/attachments/aiChatImageBytes';
import {
  isAIChatImageBackgroundUrl,
  isKimiSignedImageUrl,
  parseAIChatImagePageUrl,
  resolveAIChatImageUrl
} from '../../shared/attachments/aiChatImagePolicy';
import {
  isAIChatImageFetchRequest,
  type AIChatImageFetchRequest
} from '../../shared/types/aiChatImageMessages';
import { resolveAIChatPlatformByUrl } from '../../third_party/ai-chat-exporter/platformIdentity';

export interface AIChatImageSourceDocument {
  tabId: number;
  frameId: number;
  documentId: string;
  url: string;
}
export interface AIChatImageFetchDependencies {
  extensionId: string;
  resolveSourceDocument(sender: MessageSenderInfo): Promise<AIChatImageSourceDocument | undefined>;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export async function fetchAIChatImage(
  input: AIChatImageFetchRequest,
  sender: MessageSenderInfo,
  deps: AIChatImageFetchDependencies
): Promise<BinaryClipAttachment> {
  return withRequestDeadline(
    AI_CHAT_IMAGE_TIMEOUT_MS,
    deps.signal ? { signal: deps.signal } : {},
    async (request) => {
      if (
        !isAIChatImageFetchRequest(input) ||
        !deps.extensionId ||
        sender.id !== deps.extensionId ||
        !Number.isInteger(sender.tabId) ||
        (sender.tabId ?? -1) < 0 ||
        !Number.isInteger(sender.frameId) ||
        (sender.frameId ?? -1) < 0 ||
        !sender.documentId ||
        !sender.url
      )
        throw new AIChatImageResourceError('AI_CHAT_IMAGE_SENDER');
      const source = parseAIChatImagePageUrl(input.sourceUrl);
      if (
        resolveAIChatPlatformByUrl(source.href) !== input.platform ||
        parseAIChatImagePageUrl(sender.url).href !== source.href ||
        (sender.origin !== undefined && sender.origin !== source.origin)
      )
        throw new AIChatImageResourceError('AI_CHAT_IMAGE_SOURCE');
      const url = resolveAIChatImageUrl(input.url, source);
      if (!isAIChatImageBackgroundUrl(url, source, input.platform))
        throw new AIChatImageResourceError('AI_CHAT_IMAGE_URL');
      const kimiSignedImage = isKimiSignedImageUrl(url, source, input.platform);
      const verifySource = async () => {
        const current = await deps.resolveSourceDocument(sender);
        request.check();
        if (
          !current ||
          current.tabId !== sender.tabId ||
          current.frameId !== sender.frameId ||
          current.documentId !== sender.documentId ||
          current.url !== source.href
        )
          throw new AIChatImageResourceError('AI_CHAT_IMAGE_SOURCE');
      };
      await verifySource();
      let response: Response;
      try {
        response = await (deps.fetch ?? globalThis.fetch).call(globalThis, url.href, {
          credentials: 'omit',
          redirect: kimiSignedImage ? 'follow' : 'manual',
          cache: kimiSignedImage ? 'no-store' : 'default',
          signal: request.signal
        });
      } catch {
        request.check();
        throw new AIChatImageResourceError('AI_CHAT_IMAGE_NETWORK');
      }
      if (kimiSignedImage) {
        // Fetch cannot prevalidate intermediate hops; trust is limited to this signing route.
        try {
          const final = parseAIChatImagePageUrl(response.url);
          if (final.origin !== 'https://prod-chat-kimi.tos-cn-beijing.volces.com')
            throw new AIChatImageResourceError('AI_CHAT_IMAGE_REDIRECT');
        } catch {
          void response.body?.cancel().catch(() => undefined);
          throw new AIChatImageResourceError('AI_CHAT_IMAGE_REDIRECT');
        }
      }
      const attachment = await readAIChatImageResponse(response, request.signal, kimiSignedImage);
      await verifySource();
      return attachment;
    }
  );
}
