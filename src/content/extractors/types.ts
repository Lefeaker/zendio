import type { ExtractionResult } from '../../shared/types/extraction';

export interface ExtractionContext {
  url: string;
  document: Document;
  selection?: Selection | null;
}

export interface ContentExtractor {
  readonly id: string;
  readonly priority: number;
  canHandle(context: ExtractionContext): boolean | Promise<boolean>;
  extract(context: ExtractionContext): Promise<ExtractionResult>;
}

export interface LazyContentExtractorSource {
  readonly id: string;
  readonly priority: number;
  canHandle(context: ExtractionContext): boolean | Promise<boolean>;
  load(): ContentExtractor | Promise<ContentExtractor>;
}
