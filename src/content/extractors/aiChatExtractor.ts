import { buildChatMarkdown } from '../formatters/markdown';
import { parseChatDOM, chatHtmlToMarkdown } from '../../third_party/ai-chat-exporter/parse';
import { formatDateTime } from '../clipper/utils/datetime';
import type { OptionsState } from '../../shared/types/options';

type OptionsCache = {
  value?: OptionsState;
  pending: Promise<OptionsState | undefined> | null;
  listenerRegistered: boolean;
};

const optionsCache: OptionsCache = {
  value: undefined,
  pending: null,
  listenerRegistered: false
};

function ensureOptionsListener() {
  if (optionsCache.listenerRegistered) {
    return;
  }
  optionsCache.listenerRegistered = true;

  const onChanged = chrome?.storage?.onChanged;
  if (onChanged && typeof onChanged.addListener === 'function') {
    onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.options) {
        optionsCache.value = changes.options.newValue as OptionsState | undefined;
      }
    });
  }
}

async function getCachedOptions(): Promise<OptionsState | undefined> {
  ensureOptionsListener();

  if (optionsCache.value) {
    return optionsCache.value;
  }

  if (!optionsCache.pending) {
    optionsCache.pending = chrome.storage.sync.get('options')
      .then(({ options }) => {
        optionsCache.value = options as OptionsState | undefined;
        return optionsCache.value;
      })
      .finally(() => {
        optionsCache.pending = null;
      });
  }

  return optionsCache.pending;
}

function detectPlatform(url: string): string {
  if (/(chatgpt|chat\.openai\.com)/.test(url)) return 'chatgpt';
  if (/claude/.test(url)) return 'claude';
  if (/gemini/.test(url)) return 'gemini';
  if (/copilot/.test(url)) return 'copilot';
  if (/tongyi/.test(url)) return 'tongyi';
  if (/deepseek/.test(url)) return 'deepseek';
  if (/kimi|moonshot/.test(url)) return 'kimi';
  if (/perplexity/.test(url)) return 'perplexity';
  return 'chat';
}

export async function extractAIChat(doc: Document, url: string) {
  const platform = detectPlatform(url);
  const options = await getCachedOptions();

  const parseConfig = {
    deepResearch: {
      pureMode: options?.deepResearch?.pureMode || false
    }
  };

  const { title, messages, assets, model, createdAt } = parseChatDOM(platform, doc, parseConfig);

  const aiChatOptions = {
    includeTimestamps: options?.aiChat?.includeTimestamps ?? false,
    userName: options?.aiChat?.userName || 'USER'
  };

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
      url,
      platform,
      model,
      messageCount: normalizedMessages.length,
      ...(createdAt ? { createdAt } : {}),
      clippedAtISO: formatDateTime(new Date())
    }
  };
}

export function __resetAIChatOptionsCacheForTests() {
  optionsCache.value = undefined;
  optionsCache.pending = null;
  optionsCache.listenerRegistered = false;
}
