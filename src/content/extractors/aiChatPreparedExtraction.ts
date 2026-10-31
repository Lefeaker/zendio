import type {
  ChatPlatformParser,
  ParseConfig,
  PlatformId
} from '../../third_party/ai-chat-exporter/types';
import { prepareAIChatDocumentForExtraction } from './aiChatDocumentPreparer';
import { AIChatImagePreparation, type PreparedAIChatDocument } from './aiChatImagePreparation';
import { loadAIChatImage } from './aiChatImageResource';

const inFlight = new WeakMap<Document, { key: string; promise: Promise<PreparedAIChatDocument> }>();

/** Share the entire frozen bundle, never a document with caller-local missing bytes. */
export function prepareAIChatExtraction(
  platform: PlatformId,
  doc: Document,
  url: string,
  parser: ChatPlatformParser,
  config: ParseConfig,
  checkSource: () => void,
  loadImage = loadAIChatImage
): Promise<PreparedAIChatDocument> {
  const key = JSON.stringify([platform, url, config.deepResearch, config.fallbackTitle]);
  const images = new AIChatImagePreparation(parser, config, url, checkSource, loadImage);
  const existing = inFlight.get(doc);
  if (existing) {
    if (existing.key !== key) images.fail('ai_chat_preparation_owner_changed');
    checkSource();
    return existing.promise;
  }
  const promise = (async () => {
    try {
      const prepared = await prepareAIChatDocumentForExtraction(platform, doc, images);
      const frozen = prepared === doc ? images.clone(doc, 'document') : prepared;
      await images.flush();
      return images.finish(frozen);
    } finally {
      images.dispose();
      inFlight.delete(doc);
    }
  })();
  inFlight.set(doc, { key, promise });
  return promise;
}
