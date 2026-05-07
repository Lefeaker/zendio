import type { ExtractionResult } from '../../shared/types/extraction';
import type { ContentExtractor, ExtractionContext, LazyContentExtractorSource } from './types';
import { extractionErrors } from '../../shared/errors';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import { isAIChat } from '../detect';

type ExtractorSource =
  | ContentExtractor
  | LazyContentExtractorSource
  | (() => ContentExtractor | Promise<ContentExtractor>);

class ExtractorRegistry {
  private readonly sources: ExtractorSource[] = [];
  private readonly cache = new Map<ExtractorSource, ContentExtractor>();

  register(source: ExtractorSource): void {
    this.sources.push(source);
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const sources = this.getOrderedSources();

    for (const source of sources) {
      if (isLazyContentExtractorSource(source)) {
        const accepted = await source.canHandle(context);
        if (!accepted) {
          continue;
        }
        const extractor = await this.resolve(source);
        return extractor.extract(context);
      }

      const extractor = await this.resolve(source);
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
    const extractors = await Promise.all(
      this.getOrderedSources().map((source) => this.resolve(source))
    );
    return extractors.sort((a, b) => b.priority - a.priority);
  }

  private getOrderedSources(): ExtractorSource[] {
    return [...this.sources].sort((a, b) => getSourcePriority(b) - getSourcePriority(a));
  }

  private async resolve(source: ExtractorSource): Promise<ContentExtractor> {
    const cached = this.cache.get(source);
    if (cached) {
      return cached;
    }

    let extractor: ContentExtractor;
    if (isContentExtractor(source)) {
      extractor = source;
    } else if (isLazyContentExtractorSource(source)) {
      extractor = await Promise.resolve(source.load());
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

function isLazyContentExtractorSource(
  candidate: ExtractorSource
): candidate is LazyContentExtractorSource {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'load' in candidate &&
    'canHandle' in candidate &&
    'priority' in candidate
  );
}

function getSourcePriority(source: ExtractorSource): number {
  if (typeof source === 'function') {
    return 0;
  }
  return source.priority;
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
  registry.register({
    id: 'ai.chat',
    priority: 200,
    canHandle(context) {
      return isAIChat(context.url, context.document);
    },
    async load() {
      const { createAIChatExtractor } = await import('./aiChatExtractor');
      return createAIChatExtractor({
        optionsRepository
      });
    }
  });
  registry.register({
    id: 'article.default',
    priority: 0,
    canHandle() {
      return true;
    },
    async load() {
      const { createArticleExtractor } = await import('./articleExtractor');
      return createArticleExtractor();
    }
  });
  return registry;
}
