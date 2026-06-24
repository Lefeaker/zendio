import * as profileEngine from '../shared/profileEngine';
import type { ParserProfile } from '../shared/profileTypes';
import type { ChatPlatformParser, ParseConfig } from '../types';

const MONICA_MESSAGE_SELECTOR = '[class*="chat-message--"]';
const USER_CLASS_HINT = 'chat-question';
const ASSISTANT_CLASS_HINT = 'chat-reply';
const MONICA_NEUTRAL_FALLBACK_TITLE = 'Monica Chat';
// Native Monica browser-title tokens from the source site. These are parser tokens, not extension UI copy.
const MONICA_NATIVE_TITLE_TOKENS = ['Monica', '莫妮卡'] as const;
const MONICA_NATIVE_TITLE_LOOKUP = new Set(
  MONICA_NATIVE_TITLE_TOKENS.map((token) => token.toLowerCase())
);
const MONICA_MODEL_CANDIDATE_SELECTORS = [
  '[class*="reply-header"] span',
  '[class*="header"] span',
  '[class*="model"]',
  '[data-testid*="model"]',
  'header span'
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMonicaNativeTitlePattern(): string {
  return MONICA_NATIVE_TITLE_TOKENS.map(escapeRegExp).join('|');
}

const MONICA_NATIVE_TITLE_SUFFIX_RE = new RegExp(
  `\\s*-\\s*(${buildMonicaNativeTitlePattern()})\\s*$`,
  'iu'
);

function resolveFallbackTitle(config?: ParseConfig): string {
  return config?.fallbackTitle?.trim() || MONICA_NEUTRAL_FALLBACK_TITLE;
}

function isMonicaNativeTitlePlaceholder(title: string): boolean {
  return MONICA_NATIVE_TITLE_LOOKUP.has(title.toLowerCase());
}

function normaliseTitle(rawTitle: string, config?: ParseConfig): string {
  const cleaned = rawTitle.replace(MONICA_NATIVE_TITLE_SUFFIX_RE, '').trim();
  if (!cleaned || isMonicaNativeTitlePlaceholder(cleaned)) {
    return resolveFallbackTitle(config);
  }
  return cleaned;
}

function normaliseModelCandidate(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (cleaned.length > 40) return null;
  if (cleaned.split(/\s+/).length > 5) return null;
  if (/[。！？…:：]/.test(cleaned)) return null;
  if (
    !/(GPT|Claude|Gemini|Monica|o[0-9]|LLaMA|Llama|Sonnet|Haiku|Pro|Turbo|Qwen|通义|文心|讯飞|DeepSeek|Copilot|Mistral|Yi|Yuanbao|Qianwen|Spark)/i.test(
      cleaned
    )
  ) {
    return null;
  }
  return cleaned;
}

function extractModel(doc: Document): string {
  const model = profileEngine.findFirstNormalizedText(
    doc,
    MONICA_MODEL_CANDIDATE_SELECTORS,
    (text, el) => {
      const container = el.closest<HTMLElement>(MONICA_MESSAGE_SELECTOR);
      if (container && !container.className.includes(ASSISTANT_CLASS_HINT)) {
        return false;
      }
      return normaliseModelCandidate(text) !== null;
    }
  );

  return model ?? 'Monica';
}

const monicaProfile: ParserProfile = {
  platform: 'monica',
  title: (doc, config) => normaliseTitle(doc.title || '', config),
  model: (doc) => extractModel(doc),
  containers: MONICA_MESSAGE_SELECTOR,
  role: profileEngine.roleByClassName(
    {
      [USER_CLASS_HINT]: 'user',
      [ASSISTANT_CLASS_HINT]: 'assistant'
    },
    'assistant'
  ),
  content: ({ container }) =>
    profileEngine.pickFirstElement(container, [
      '[class*="markdown"]',
      '[data-lexical-editor]',
      '[data-slate-editor]',
      'article',
      'pre',
      'code',
      'p'
    ]) ?? container,
  cleanup: profileEngine.removeElements('[class*="toolbar"], [class*="reply-header"], button, svg')
};

export const monicaParser: ChatPlatformParser = {
  id: 'monica',
  parse: (doc, config: ParseConfig | undefined) =>
    profileEngine.parseWithProfile(doc, monicaProfile, config)
};
