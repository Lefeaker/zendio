/* @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';

import { createExtractorRegistry } from '@content/extractors/registry';
import type { ContentExtractor, ExtractionContext } from '@content/extractors/types';

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
