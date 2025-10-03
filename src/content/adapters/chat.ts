import { buildChatMarkdown } from '../formatters/markdown';
import { parseChatDOM, chatHtmlToMarkdown } from '../../third_party/ai-chat-exporter/parse';

function detectPlatform(url: string): string {
  if (/chatgpt/.test(url)) return 'chatgpt';
  if (/claude/.test(url))  return 'claude';
  if (/gemini/.test(url))  return 'gemini';
  if (/copilot/.test(url)) return 'copilot';
  // tongyi.com is the actual domain (not tongyi.aliyun.com)
  if (/tongyi/.test(url)) return 'tongyi';
  if (/deepseek/.test(url)) return 'deepseek';
  if (/kimi|moonshot/.test(url)) return 'kimi';
  if (/perplexity/.test(url)) return 'perplexity';
  return 'chat';
}

export async function extractAIChat(doc: Document, url: string) {
  const platform = detectPlatform(url);

  // Get user options from storage
  const { options } = await chrome.storage.sync.get('options');

  // Prepare parse config for Gemini Deep Research
  const parseConfig = {
    deepResearch: {
      pureMode: options?.deepResearch?.pureMode || false
    }
  };

  // Use the real AI Chat Exporter parser
  const { title, messages, assets, model, createdAt } = parseChatDOM(platform, doc, parseConfig);

  const aiChatOptions = {
    includeTimestamps: options?.aiChat?.includeTimestamps ?? false,
    userName: options?.aiChat?.userName || 'USER'
  };

  // Convert messages to our format, prioritizing markdown content
  const normalizedMessages = messages.map((m, i) => ({
    id: m.id || `m${i}`,
    role: m.role,
    text: m.md || (m.html ? chatHtmlToMarkdown(m.html) : m.text || ''),
    timestamp: m.timestamp
  }));

  const markdown = buildChatMarkdown({
    title,
    platform,
    url,
    messages: normalizedMessages,
    model,
    createdAt,
    options: aiChatOptions
  });

  return {
    type: 'ai_chat',
    title,
    markdown,
    assets,
    meta: {
      url, platform, model,
      messageCount: normalizedMessages.length,
      ...(createdAt ? { createdAt } : {}), // Only include if actually captured
      clippedAtISO: new Date().toISOString()
    }
  };
}