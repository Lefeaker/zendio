import type { ReaderHighlightTheme } from '@shared/types/options';

function getHighlightThemeHost(doc: Document): HTMLElement {
  return doc.body ?? doc.documentElement;
}

export function applyHighlightThemeState(doc: Document, theme: ReaderHighlightTheme): void {
  const host = getHighlightThemeHost(doc);
  host.dataset.aiobReaderHighlight = theme;
  host.dataset.aiobReaderHighlightTheme = theme;
}

export function clearHighlightThemeState(doc: Document): void {
  const host = getHighlightThemeHost(doc);
  delete host.dataset.aiobReaderHighlight;
  delete host.dataset.aiobReaderHighlightTheme;
}
