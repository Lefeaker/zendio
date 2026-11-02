import type { PlatformId } from '../../../src/third_party/ai-chat-exporter/types';

// Controlled adapter contract fixtures, not captures of current image galleries.
type MessageBuilder = (role: 'user' | 'assistant', body: string, gallery: string, id: string) => string;
const builders: Record<PlatformId, MessageBuilder> = {
  chatgpt: (role, body, gallery, id) => `<section data-message-id="${id}"><h4 data-conversation-role="${role}"></h4><div ${role === 'user' ? 'data-user-message-bubble' : 'data-markdown-text-style="assistant-message"'}>${body}</div>${gallery}</section>`,
  claude: (role, body, gallery, id) => role === 'user'
    ? `<div data-testid="user-message" data-message-id="${id}">${body}${gallery}</div>`
    : `<div class="font-claude-response" data-message-id="${id}"><div class="standard-markdown">${body}</div>${gallery}</div>`,
  copilot: (role, body, gallery, id) => `<div data-content="${role === 'user' ? 'user' : 'ai'}-message" data-message-id="${id}">${body}${gallery}</div>`,
  gemini: (role, body, gallery, id) => role === 'user'
    ? `<user-query data-message-id="${id}"><div role="presentation">${body}</div>${gallery}</user-query>`
    : `<model-response data-message-id="${id}"><message-content>${body}</message-content>${gallery}</model-response>`,
  tongyi: (role, body, gallery, id) => `<div class="${role === 'user' ? 'chat-question-wrap' : 'answerItem'}" data-message-id="${id}"><div class="${role === 'user' ? 'qwen-message-bubble' : 'tongyi-markdown'}">${body}</div>${gallery}</div>`,
  deepseek: (role, body, gallery, id) => `<div class="ds-message" data-message-role="${role}" data-message-id="${id}"><div data-message-content class="${role === 'assistant' ? 'ds-assistant-message-main-content' : 'user-content'}">${body}</div>${gallery}</div>`,
  kimi: (role, body, gallery, id) => `<div class="chat-content-item chat-content-item-${role}" data-message-id="${id}"><div class="${role === 'user' ? 'segment-text' : 'segment-content'}">${body}</div>${gallery}</div>`,
  doubao: (role, body, gallery, id) => `<div class="message-block-container" data-testid="message_${role}" data-message-id="${id}"><div class="${role === 'user' ? 'send-text' : 'flow-markdown-body'}">${body}</div>${gallery}</div>`,
  monica: (role, body, gallery, id) => `<div class="chat-message--sample ${role === 'user' ? 'chat-question' : 'chat-reply'}" data-message-id="${id}"><div class="markdown">${body}</div>${gallery}</div>`,
  perplexity: (role, body, gallery, id) => `<div data-testid="${role}-message" data-message-id="${id}"><div data-testid="message-content">${body}</div>${gallery}</div>`,
  grok: (role, body, gallery, id) => `<article role="article" data-testid="${role}-message" data-message-id="${id}"><div class="response-content-markdown">${body}</div>${gallery}</article>`
};

export function imageAdapterDocument(platform: PlatformId, body: string, gallery = ''): Document {
  const message = builders[platform];
  const html = `<title>Image adapter contract</title><main id="grok-content-area">${message('user', body, gallery, 'user-1')}${message('assistant', body, gallery, 'assistant-1')}</main>`;
  return new DOMParser().parseFromString(html, 'text/html');
}
