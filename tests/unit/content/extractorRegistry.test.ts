/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultExtractorRegistry,
  createExtractorRegistry
} from '../../../src/content/extractors/registry';
import type { ContentExtractor, ExtractionContext } from '../../../src/content/extractors/types';

function createContext(url: string): ExtractionContext {
  return {
    url,
    document
  };
}

function extractor(id: string, priority: number, markdown: string): ContentExtractor {
  return {
    id,
    priority,
    canHandle: () => true,
    extract: async () => ({
      type: 'article',
      title: id,
      markdown,
      meta: { url: 'https://example.com' }
    })
  };
}

function createStubExtractor(overrides: Partial<ContentExtractor> = {}): ContentExtractor {
  const base: ContentExtractor = {
    id: overrides.id ?? 'extractor',
    priority: overrides.priority ?? 0,
    canHandle: overrides.canHandle ?? vi.fn().mockResolvedValue(true),
    extract:
      overrides.extract ??
      vi.fn().mockImplementation((context: ExtractionContext) =>
        Promise.resolve({
          type: 'stub',
          title: 'stub',
          markdown: '# stub',
          meta: { url: context.url, sourceUrl: context.url }
        })
      )
  };
  return base;
}

describe('extractor registry', () => {
  const context: ExtractionContext = { url: 'https://example.com', document };

  it('selects the highest priority extractor that can handle the context', async () => {
    const registry = createExtractorRegistry();

    const lowPriorityExtract = vi.fn().mockResolvedValue({
      type: 'low',
      title: 'low',
      markdown: 'low',
      meta: { url: context.url }
    });
    const highPriorityExtract = vi.fn().mockResolvedValue({
      type: 'high',
      title: 'high',
      markdown: 'high',
      meta: { url: context.url }
    });

    const lowPriority = createStubExtractor({
      id: 'low',
      priority: 10,
      canHandle: vi.fn().mockResolvedValue(true),
      extract: lowPriorityExtract
    });

    const highPriority = createStubExtractor({
      id: 'high',
      priority: 90,
      canHandle: vi.fn().mockResolvedValue(true),
      extract: highPriorityExtract
    });

    registry.register(lowPriority);
    registry.register(highPriority);

    const result = await registry.extract(context);
    expect(highPriorityExtract).toHaveBeenCalledTimes(1);
    expect(lowPriorityExtract).not.toHaveBeenCalled();
    expect(result.type).toBe('high');
  });

  it('ignores extractors that cannot handle the context', async () => {
    const registry = createExtractorRegistry();

    const refusingExtractorExtract = vi.fn();
    const acceptingExtractorExtract = vi.fn().mockResolvedValue({
      type: 'accept',
      title: 'accept',
      markdown: 'ok',
      meta: { url: context.url }
    });

    const refusingExtractor = createStubExtractor({
      id: 'refuse',
      priority: 100,
      canHandle: vi.fn().mockResolvedValue(false),
      extract: refusingExtractorExtract
    });

    const acceptingExtractor = createStubExtractor({
      id: 'accept',
      priority: 50,
      canHandle: vi.fn().mockResolvedValue(true),
      extract: acceptingExtractorExtract
    });

    registry.register(refusingExtractor);
    registry.register(acceptingExtractor);

    const result = await registry.extract(context);
    expect(refusingExtractorExtract).not.toHaveBeenCalled();
    expect(acceptingExtractorExtract).toHaveBeenCalledTimes(1);
    expect(result.type).toBe('accept');
  });

  it('supports lazy factory registration and throws when no extractor matches', async () => {
    const registry = createExtractorRegistry();

    registry.register(() =>
      Promise.resolve(
        createStubExtractor({
          id: 'async',
          priority: 10,
          canHandle: vi.fn().mockResolvedValue(false)
        })
      )
    );

    await expect(registry.extract(context)).rejects.toMatchObject({
      code: 'EXTRACTION_CONTENT_UNSUPPORTED',
      context: { url: context.url, type: 'unknown' }
    });
  });
});

describe('ExtractorRegistry lazy source ordering', () => {
  it('does not load a lazy source when its preflight rejects the page', async () => {
    const registry = createExtractorRegistry();
    const loadAi = vi.fn(async () => extractor('ai.chat', 200, 'ai'));
    const loadArticle = vi.fn(async () => extractor('article.default', 0, 'article'));

    registry.register({
      id: 'ai.chat',
      priority: 200,
      canHandle: () => false,
      load: loadAi
    });
    registry.register({
      id: 'article.default',
      priority: 0,
      canHandle: () => true,
      load: loadArticle
    });

    const result = await registry.extract(
      createContext('https://developer.mozilla.org/en-US/docs/Web/JavaScript')
    );

    expect(result.markdown).toBe('article');
    expect(loadAi).not.toHaveBeenCalled();
    expect(loadArticle).toHaveBeenCalledTimes(1);
  });

  it('loads a high-priority lazy source when its preflight accepts the page', async () => {
    const registry = createExtractorRegistry();
    const loadAi = vi.fn(async () => extractor('ai.chat', 200, 'ai'));
    const loadArticle = vi.fn(async () => extractor('article.default', 0, 'article'));

    registry.register({
      id: 'ai.chat',
      priority: 200,
      canHandle: () => true,
      load: loadAi
    });
    registry.register({
      id: 'article.default',
      priority: 0,
      canHandle: () => true,
      load: loadArticle
    });

    const result = await registry.extract(createContext('https://chatgpt.com/c/abc'));

    expect(result.markdown).toBe('ai');
    expect(loadAi).toHaveBeenCalledTimes(1);
    expect(loadArticle).not.toHaveBeenCalled();
  });

  it('keeps default registry from importing AI chat extractor for non-AI hosts', async () => {
    const registry = createDefaultExtractorRegistry({
      optionsRepository: { get: vi.fn(), onChange: vi.fn() } as never
    });

    const result = await registry.extract(
      createContext('https://developer.mozilla.org/en-US/docs/Web/JavaScript')
    );

    expect(result.type).toBe('article');
  });
});
