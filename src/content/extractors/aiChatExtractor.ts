import { buildChatMarkdown } from '../formatters/markdown';
import { chatHtmlToMarkdown } from '../../third_party/ai-chat-exporter/shared/markdown';
import { formatDateTime } from '../clipper/utils/datetime';
import { isAIChat } from '../detect';
import type { StoredOptions } from '../../shared/types/options';
import type { ContentExtractor, ExtractionContext } from './types';
import type { OptionsRepository } from '../../shared/interfaces/optionsRepository';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { ParsedMessage, PlatformId } from '../../third_party/ai-chat-exporter/types';
import { resolveAIChatPlatformByUrl } from '../../third_party/ai-chat-exporter/platformRegistry';
import { getContentI18nResource, getContentMessages } from '../i18n/context';
import type { Messages } from '@i18n';
import { validateAIChatExtraction } from './aiChatExtractionValidation';
import { prepareAIChatDocumentForExtraction } from './aiChatDocumentPreparer';

interface OptionsProvider {
  get(): Promise<StoredOptions>;
  reset(): void;
}

type AIChatFallbackMessages = Pick<
  Messages,
  | 'exportAiChatFallbackTitleDeepseek'
  | 'exportAiChatFallbackTitleKimi'
  | 'exportAiChatFallbackTitleTongyi'
>;

const ENGLISH_NEUTRAL_AI_CHAT_FALLBACK_TITLES = {
  doubao: 'Doubao Chat',
  monica: 'Monica Chat'
};

export interface AIChatExtractorDeps {
  optionsRepository?: OptionsRepository | IOptionsRepository;
  optionsProvider?: OptionsProvider;
  getMessages?(): Promise<AIChatFallbackMessages>;
  detectPlatform(url: string, doc?: Document): PlatformId | null;
  now(): Date;
}

interface ResolvedAIChatExtractorDeps {
  optionsProvider: OptionsProvider;
  getMessages(): Promise<AIChatFallbackMessages>;
  detectPlatform(url: string, doc?: Document): PlatformId | null;
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
      cached = value;
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
    get: () => Promise.resolve({}),
    reset: () => undefined
  };
}

function createMessagesProvider(): () => Promise<AIChatFallbackMessages> {
  return () => Promise.resolve(getContentI18nResource()?.messages ?? getContentMessages());
}

function defaultDetectPlatform(url: string, doc?: Document): PlatformId | null {
  return resolveAIChatPlatformByUrl(url, doc);
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

function resolveFallbackTitle(
  platform: string,
  messages: AIChatFallbackMessages
): string | undefined {
  switch (platform) {
    case 'deepseek':
      return messages.exportAiChatFallbackTitleDeepseek;
    case 'kimi':
      return messages.exportAiChatFallbackTitleKimi;
    case 'tongyi':
      return messages.exportAiChatFallbackTitleTongyi;
    case 'doubao':
      return ENGLISH_NEUTRAL_AI_CHAT_FALLBACK_TITLES.doubao;
    case 'monica':
      return ENGLISH_NEUTRAL_AI_CHAT_FALLBACK_TITLES.monica;
    default:
      return undefined;
  }
}

function requireFallbackTitle(
  platform: string,
  messages: AIChatFallbackMessages
): string | undefined {
  const fallbackTitle = resolveFallbackTitle(platform, messages)?.trim();
  if (fallbackTitle) {
    return fallbackTitle;
  }

  if (platform === 'deepseek' || platform === 'kimi' || platform === 'tongyi') {
    throw new Error(`Missing localized AI chat fallback title for ${platform}`);
  }

  return undefined;
}

export const createAIChatExtractor = (deps?: Partial<AIChatExtractorDeps>): ContentExtractor => {
  const optionsProvider =
    deps?.optionsProvider ??
    (deps?.optionsRepository
      ? createOptionsProviderFromRepository(deps.optionsRepository)
      : createEmptyOptionsProvider());

  const resolvedDeps: ResolvedAIChatExtractorDeps = {
    optionsProvider,
    getMessages: deps?.getMessages ?? createMessagesProvider(),
    detectPlatform: deps?.detectPlatform ?? defaultDetectPlatform,
    now: deps?.now ?? (() => new Date())
  };

  const extract = async ({ document, url }: ExtractionContext) => {
    const platform = resolvedDeps.detectPlatform(url, document);
    if (!platform) {
      throw new Error(`Unsupported AI chat platform for ${url}`);
    }

    const storedOptions = await resolvedDeps.optionsProvider.get();
    const options = storedOptions;
    const fallbackTitle = requireFallbackTitle(platform, await resolvedDeps.getMessages());

    const parseConfig = {
      deepResearch: {
        pureMode: options?.deepResearch?.pureMode || false
      },
      ...(fallbackTitle ? { fallbackTitle } : {})
    };

    const { parseChatDOMAsync } =
      await import('../../third_party/ai-chat-exporter/runtimeRegistry');
    const preparedDocument = await prepareAIChatDocumentForExtraction(platform, document);
    const { title, messages, assets, model, createdAt, diagnostics } = await parseChatDOMAsync(
      platform,
      preparedDocument,
      parseConfig
    );
    const aiChatOptions: ChatMarkdownOptions = {
      includeTimestamps: options?.aiChat?.includeTimestamps ?? false,
      userName: options?.aiChat?.userName || 'USER'
    };
    const normalizedMessages = normalizeMessages(messages);
    validateAIChatExtraction({ title, platform, url, messages: normalizedMessages, diagnostics });

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
    Pick<
      AIChatExtractorDeps,
      'optionsRepository' | 'optionsProvider' | 'getMessages' | 'detectPlatform' | 'now'
    >
  >
) {
  return createAIChatExtractor(deps).extract({ document: doc, url });
}
