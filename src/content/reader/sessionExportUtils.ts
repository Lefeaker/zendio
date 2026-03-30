import type { ReaderMarkdownPayload } from './utils/markdownBuilder';
import type { ReaderHighlightRecord } from './services/highlightManager';
import type { ReadingClipData } from '../../shared/repositories/IReaderRepository';
import type { ReadingSessionOptions } from '../../shared/types/options';

interface ClipContext {
  doc: Document;
  url: string;
  readingConfig: ReadingSessionOptions;
}

export function buildReadingClipData(
  payload: ReaderMarkdownPayload,
  highlightRecords: ReaderHighlightRecord[],
  context: ClipContext
): ReadingClipData {
  const baseTimestamp = Date.now();
  return {
    content: payload.markdown ?? '',
    title: payload.title ?? context.doc.title ?? 'Reading Clip',
    url: payload.meta?.url ?? context.url,
    highlights: highlightRecords.map((record) => ({
      text: record.selectedText,
      color: context.readingConfig.highlightTheme,
      ...(record.comment ? { note: record.comment } : {}),
      timestamp: record.createdAt ?? baseTimestamp
    })),
    exportMode: context.readingConfig.exportMode
  };
}
