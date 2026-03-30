import type { ExtractionResult } from '../../shared/types/extraction';
import type { ContentExtractor, ExtractionContext } from './types';
import { extractionErrors } from '../../shared/errors';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';

type ExtractorSource = ContentExtractor | (() => ContentExtractor | Promise<ContentExtractor>);

class ExtractorRegistry {
  private readonly sources: ExtractorSource[] = [];
  private readonly cache = new Map<ExtractorSource, ContentExtractor>();

  register(source: ExtractorSource): void {
    this.sources.push(source);
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const extractors = await this.getOrderedExtractors();

    for (const extractor of extractors) {
      const canHandle = await extractor.canHandle(context);
      if (!canHandle) {
        continue;
      }
      return extractor.extract(context);
    }

    throw extractionErrors.unsupportedContent({ url: context.url, type: 'unknown' });
  }

  list(): Promise<ContentExtractor[]> {
    return this.getOrderedExtractors();
  }

  private async getOrderedExtractors(): Promise<ContentExtractor[]> {
    const extractors = await Promise.all(this.sources.map((source) => this.resolve(source)));
    return extractors.sort((a, b) => b.priority - a.priority);
  }

  private async resolve(source: ExtractorSource): Promise<ContentExtractor> {
    if (this.cache.has(source)) {
      return this.cache.get(source);
    }

    let extractor: ContentExtractor;
    if (isContentExtractor(source)) {
      extractor = source;
    } else {
      const resolved = source();
      extractor = await Promise.resolve(resolved);
    }

    this.cache.set(source, extractor);
    return extractor;
  }
}

function isContentExtractor(candidate: ExtractorSource): candidate is ContentExtractor {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'canHandle' in candidate &&
    'extract' in candidate
  );
}

export interface ExtractorRegistryApi {
  register(source: ExtractorSource): void;
  extract(context: ExtractionContext): Promise<ExtractionResult>;
  list(): Promise<ContentExtractor[]>;
}

export function createExtractorRegistry(): ExtractorRegistryApi {
  return new ExtractorRegistry();
}

export interface DefaultExtractorRegistryDependencies {
  optionsRepository?: IOptionsRepository;
}

export function createDefaultExtractorRegistry(
  dependencies: DefaultExtractorRegistryDependencies = {}
): ExtractorRegistryApi {
  const optionsRepository =
    dependencies.optionsRepository ??
    resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  const registry = createExtractorRegistry();
  registry.register(async () => {
    const { createAIChatExtractor } = await import('./aiChatExtractor');
    return createAIChatExtractor({
      optionsRepository
    });
  });
  registry.register(async () => {
    const { createArticleExtractor } = await import('./articleExtractor');
    return createArticleExtractor();
  });
  return registry;
}
