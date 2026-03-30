import { buildChatMarkdown } from '../formatters/markdown';
import { chatHtmlToMarkdown } from '../../third_party/ai-chat-exporter/parse';
import { formatDateTime } from '../clipper/utils/datetime';
import { isAIChat } from '../detect';
import type { StoredOptions, OptionsState } from '../../shared/types/options';
import type { ContentExtractor, ExtractionContext } from './types';
import type { OptionsRepository } from '../../shared/interfaces/optionsRepository';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { ParsedMessage } from '../../third_party/ai-chat-exporter/types';

interface OptionsProvider {
  get(): Promise<StoredOptions>;
  reset(): void;
}

export interface AIChatExtractorDeps {
  optionsRepository?: OptionsRepository | IOptionsRepository;
  optionsProvider?: OptionsProvider;
  detectPlatform(url: string): string;
  now(): Date;
}

interface ResolvedAIChatExtractorDeps {
  optionsProvider: OptionsProvider;
  detectPlatform(url: string): string;
  now(): Date;
}

function isLegacyOptionsRepository(
  repository: OptionsRepository | IOptionsRepository
): repository is OptionsRepository {
  return 'load' in repository && typeof repository.load === 'function';
}

function createOptionsProviderFromRepository(
  repository: OptionsRepository | IOptionsRepository
): OptionsProvider {
  let cached: StoredOptions | undefined;
  let pending: Promise<StoredOptions> | null = null;
  let unsubscribe: (() => void) | null = null;

  const ensureSubscription = () => {
    if (unsubscribe) {
      return;
    }
    if (isLegacyOptionsRepository(repository)) {
      unsubscribe = repository.subscribe((value) => {
        cached = value;
      });
      return;
    }

    unsubscribe = repository.onChange((value) => {
      cached = value as StoredOptions;
    });
  };

  return {
    async get(): Promise<StoredOptions> {
      ensureSubscription();

      if (cached) {
        return cached;
      }

      if (pending === null) {
        pending = (isLegacyOptionsRepository(repository) ? repository.load() : repository.get())
          .then((value) => {
            cached = value;
            return value;
          })
          .finally(() => {
            pending = null;
          });
      }

      return pending;
    },
    reset(): void {
      cached = undefined;
      pending = null;
      unsubscribe?.();
      unsubscribe = null;
    }
  };
}

function createEmptyOptionsProvider(): OptionsProvider {
  return {
    get: async () => ({}) as StoredOptions,
    reset: () => undefined
  };
}

function defaultDetectPlatform(url: string): string {
  if (/(chatgpt|chat\.openai\.com)/.test(url)) return 'chatgpt';
  if (/claude/.test(url)) return 'claude';
  if (/gemini/.test(url)) return 'gemini';
  if (/copilot/.test(url)) return 'copilot';
  if (/tongyi/.test(url)) return 'tongyi';
  if (/deepseek/.test(url)) return 'deepseek';
  if (/kimi|moonshot/.test(url)) return 'kimi';
  if (/doubao/.test(url)) return 'doubao';
  if (/monica/.test(url)) return 'monica';
  if (/perplexity/.test(url)) return 'perplexity';
  return 'chat';
}

interface ChatMarkdownMessage {
  id: string;
  role: ParsedMessage['role'];
  text: string;
  timestamp?: string;
}

interface ChatMarkdownOptions {
  includeTimestamps?: boolean;
  userName?: string;
}

interface ChatMarkdownInput {
  title: string;
  platform: string;
  url: string;
  messages: ChatMarkdownMessage[];
  model?: string;
  createdAt?: string;
  options: ChatMarkdownOptions;
}

function normalizeMessages(messages: ParsedMessage[]): ChatMarkdownMessage[] {
  return messages.map((message, index) => {
    const text =
      message.md ?? (message.html ? chatHtmlToMarkdown(message.html) : (message.text ?? ''));
    const normalized: ChatMarkdownMessage = {
      id: message.id || `m${index}`,
      role: message.role,
      text
    };

    if (message.timestamp) {
      normalized.timestamp = message.timestamp;
    }

    return normalized;
  });
}

export const createAIChatExtractor = (deps?: Partial<AIChatExtractorDeps>): ContentExtractor => {
  const optionsProvider =
    deps?.optionsProvider ??
    (deps?.optionsRepository
      ? createOptionsProviderFromRepository(deps.optionsRepository)
      : createEmptyOptionsProvider());

  const resolvedDeps: ResolvedAIChatExtractorDeps = {
    optionsProvider,
    detectPlatform: deps?.detectPlatform ?? defaultDetectPlatform,
    now: deps?.now ?? (() => new Date())
  };

  const extract = async ({ document, url }: ExtractionContext) => {
    const platform = resolvedDeps.detectPlatform(url);
    const storedOptions = await resolvedDeps.optionsProvider.get();
    const options = storedOptions as OptionsState;

    const parseConfig = {
      deepResearch: {
        pureMode: options?.deepResearch?.pureMode || false
      }
    };

    const { parseChatDOMAsync } = await import(
      '../../third_party/ai-chat-exporter/runtimeRegistry'
    );
    const { title, messages, assets, model, createdAt } = await parseChatDOMAsync(
      platform,
      document,
      parseConfig
    );
    const aiChatOptions: ChatMarkdownOptions = {
      includeTimestamps: options?.aiChat?.includeTimestamps ?? false,
      userName: options?.aiChat?.userName || 'USER'
    };
    const normalizedMessages = normalizeMessages(messages);

    const baseInput: ChatMarkdownInput = {
      title,
      platform,
      url,
      messages: normalizedMessages,
      options: aiChatOptions
    };

    const chatMarkdownInput: ChatMarkdownInput = {
      ...baseInput,
      ...(model !== undefined ? { model } : {}),
      ...(createdAt !== undefined ? { createdAt } : {})
    };

    const markdown = buildChatMarkdown(chatMarkdownInput);

    return {
      type: 'ai_chat' as const,
      title,
      markdown,
      assets,
      meta: {
        url,
        platform,
        model,
        messageCount: normalizedMessages.length,
        ...(createdAt ? { createdAt } : {}),
        clippedAtISO: formatDateTime(resolvedDeps.now())
      }
    };
  };

  return {
    id: 'ai.chat',
    priority: 200,
    canHandle(context: ExtractionContext): Promise<boolean> {
      return Promise.resolve(isAIChat(context.url, context.document));
    },
    extract
  };
};

export async function extractAIChat(
  doc: Document,
  url: string,
  deps?: Partial<
    Pick<AIChatExtractorDeps, 'optionsRepository' | 'optionsProvider' | 'detectPlatform' | 'now'>
  >
) {
  return createAIChatExtractor(deps).extract({ document: doc, url });
}
