/* @vitest-environment jsdom */

import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAIChatExtractor } from '../../../src/content/extractors/aiChatExtractor';
import { createExtractorRegistry } from '../../../src/content/extractors/registry';
import type { ContentExtractor } from '../../../src/content/extractors/types';
import * as preparation from '../../../src/content/extractors/aiChatDocumentPreparer';
import * as runtime from '../../../src/third_party/ai-chat-exporter/runtimeRegistry';
import type { PlatformId } from '../../../src/third_party/ai-chat-exporter/types';

type Sample = { platform: PlatformId; url: string; html: string };
const samples: Sample[] = [
  {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/original',
    html: '<article data-message-author-role="user"><div class="markdown"><p>ORIGINAL_PROMPT</p></div></article><article data-message-author-role="assistant"><div class="markdown"><p>ORIGINAL_ANSWER</p></div></article>'
  },
  {
    platform: 'grok',
    url: 'https://grok.com/share/original',
    html: '<main id="grok-content-area"><div role="article" data-testid="user-message"><div class="response-content-markdown"><p>ORIGINAL_PROMPT</p></div></div><div role="article" data-testid="assistant-message"><div class="response-content-markdown"><p>ORIGINAL_ANSWER</p></div></div></main>'
  },
  {
    platform: 'claude',
    url: 'https://claude.ai/chat/original',
    html: '<div data-testid="user-message"><p>ORIGINAL_PROMPT</p></div><div class="font-claude-response"><div class="standard-markdown"><p>ORIGINAL_ANSWER</p></div></div>'
  }
];
const fallbackMessages = {
  exportAiChatFallbackTitleDeepseek: 'DeepSeek',
  exportAiChatFallbackTitleKimi: 'Kimi',
  exportAiChatFallbackTitleTongyi: 'Qianwen'
};
const documents: JSDOM[] = [];

function createDocument(sample: Sample, url = sample.url): JSDOM {
  const dom = new JSDOM(`<title>Original conversation</title>${sample.html}`, { url });
  documents.push(dom);
  return dom;
}

function createGate() {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, promise };
}

function navigate(dom: JSDOM): void {
  dom.window.history.pushState({}, '', '/replacement');
  dom.window.document.title = 'Replacement conversation';
  dom.window.document.body.innerHTML = dom.window.document.body.innerHTML.replaceAll(
    'ORIGINAL',
    'REPLACEMENT'
  );
}

function expectSourceChanged(result: ReturnType<ContentExtractor['extract']>) {
  return expect(result).rejects.toMatchObject({
    code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
    recoverable: true,
    context: { parserDiagnosticCodes: ['ai_chat_source_changed'] }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  documents.splice(0).forEach((dom) => dom.window.close());
});

describe('AI chat extractor source identity', () => {
  const providerStages: Array<'options' | 'messages'> = ['options', 'messages'];
  const providerCases = samples.flatMap((sample) =>
    providerStages.map((stage) => ({ ...sample, stage }))
  );

  it.each(providerCases)(
    'rejects $platform navigation while awaiting $stage',
    async ({ stage, ...sample }) => {
      const dom = createDocument(sample);
      const entered = createGate();
      const release = createGate();
      const pause = async () => {
        entered.open();
        await release.promise;
      };
      const extractor = createAIChatExtractor({
        optionsProvider: {
          get: async () => {
            if (stage === 'options') await pause();
            return {};
          },
          reset: () => undefined
        },
        getMessages: async () => {
          if (stage === 'messages') await pause();
          return fallbackMessages;
        }
      });
      const result = extractor.extract({ document: dom.window.document, url: sample.url });
      await entered.promise;
      navigate(dom);
      release.open();
      await expectSourceChanged(result);
    }
  );

  it.each(samples)(
    'rejects an already stale URL for an active $platform document before reading options',
    async (sample) => {
      const dom = createDocument(sample);
      navigate(dom);
      const get = vi.fn(() => Promise.resolve({}));
      const extractor = createAIChatExtractor({
        optionsProvider: { get, reset: () => undefined },
        getMessages: () => Promise.resolve(fallbackMessages)
      });
      await expectSourceChanged(
        extractor.extract({ document: dom.window.document, url: sample.url })
      );
      expect(get).not.toHaveBeenCalled();
    }
  );

  it.each(samples)('exports a stable connected $platform document normally', async (sample) => {
    const dom = createDocument(sample);
    const extractor = createAIChatExtractor({
      getMessages: () => Promise.resolve(fallbackMessages)
    });
    const result = await extractor.extract({ document: dom.window.document, url: sample.url });
    expect(result.meta).toMatchObject({
      platform: sample.platform,
      url: sample.url,
      messageCount: 2
    });
    expect(result.title).toBe('Original conversation');
    expect(result.markdown).toContain('ORIGINAL_ANSWER');
  });

  it.each(samples)(
    'preserves explicit URLs for detached $platform DOM fixtures',
    async (sample) => {
      const doc = new DOMParser().parseFromString(
        `<title>Offline conversation</title>${sample.html}`,
        'text/html'
      );
      expect(doc.defaultView).toBeNull();
      const result = await createAIChatExtractor({
        getMessages: () => Promise.resolve(fallbackMessages)
      }).extract({ document: doc, url: sample.url });
      expect(result.meta).toMatchObject({
        platform: sample.platform,
        url: sample.url,
        messageCount: 2
      });
    }
  );

  it.each(samples)(
    'preserves explicit URLs for archived $platform HTML on a non-AI source',
    async (sample) => {
      const dom = createDocument(sample, 'https://example.com/archive');
      const result = await createAIChatExtractor({
        getMessages: () => Promise.resolve(fallbackMessages)
      }).extract({ document: dom.window.document, url: sample.url });
      expect(result.meta).toMatchObject({
        platform: sample.platform,
        url: sample.url,
        messageCount: 2
      });
    }
  );

  it('accepts equivalent absolute URL spelling for a stable connected page', async () => {
    const sample = samples[0];
    if (!sample) throw new Error('Missing source fixture');
    const dom = createDocument(sample, 'https://chatgpt.com/');
    const result = await createAIChatExtractor({
      getMessages: () => Promise.resolve(fallbackMessages)
    }).extract({
      document: dom.window.document,
      url: 'https://chatgpt.com'
    });
    expect(result.meta.url).toBe('https://chatgpt.com');
  });

  it('allows a title refresh when the conversation source URL stays the same', async () => {
    const sample = samples[0];
    if (!sample) throw new Error('Missing source fixture');
    const dom = createDocument(sample);
    const result = await createAIChatExtractor({
      optionsProvider: {
        get: () => {
          dom.window.document.title = 'Updated conversation title';
          return Promise.resolve({});
        },
        reset: () => undefined
      },
      getMessages: () => Promise.resolve(fallbackMessages)
    }).extract({ document: dom.window.document, url: sample.url });
    expect(result.title).toBe('Updated conversation title');
    expect(result.meta.url).toBe(sample.url);
  });

  const parseStages: Array<'preparation' | 'parser'> = ['preparation', 'parser'];
  it.each(parseStages)('rejects navigation while awaiting the %s', async (stage) => {
    const sample = samples[0];
    if (!sample) throw new Error('Missing source fixture');
    const dom = createDocument(sample);
    const entered = createGate();
    const release = createGate();
    if (stage === 'preparation') {
      const original = preparation.prepareAIChatDocumentForExtraction;
      vi.spyOn(preparation, 'prepareAIChatDocumentForExtraction').mockImplementation(
        async (...args) => {
          entered.open();
          await release.promise;
          return original(...args);
        }
      );
    } else {
      const original = runtime.resolveParserAsync;
      vi.spyOn(runtime, 'resolveParserAsync').mockImplementation(async (...args) => {
        entered.open();
        await release.promise;
        return original(...args);
      });
    }
    const result = createAIChatExtractor({
      getMessages: () => Promise.resolve(fallbackMessages)
    }).extract({
      document: dom.window.document,
      url: sample.url
    });
    await entered.promise;
    navigate(dom);
    release.open();
    await expectSourceChanged(result);
  });

  it('rejects a request that became stale during registry lazy loading', async () => {
    const sample = samples[0];
    if (!sample) throw new Error('Missing source fixture');
    const dom = createDocument(sample);
    const entered = createGate();
    const release = createGate();
    const registry = createExtractorRegistry();
    registry.register({
      id: 'ai.chat',
      priority: 200,
      canHandle: () => true,
      load: async () => {
        entered.open();
        await release.promise;
        return createAIChatExtractor({ getMessages: () => Promise.resolve(fallbackMessages) });
      }
    });
    const result = registry.extract({ document: dom.window.document, url: sample.url });
    await entered.promise;
    navigate(dom);
    release.open();
    await expectSourceChanged(result);
  });
});
