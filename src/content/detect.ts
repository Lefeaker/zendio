import { isAIChatHost } from '../third_party/ai-chat-exporter/platformRegistry';

export const isAIChat = (url: string, doc: Document) => {
  return isAIChatHost(url, doc);
};
