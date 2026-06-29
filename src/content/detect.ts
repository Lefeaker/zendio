import { isAIChatHost } from '../third_party/ai-chat-exporter/platformIdentity';

export const isAIChat = (url: string, doc: Document) => {
  return isAIChatHost(url, doc);
};
