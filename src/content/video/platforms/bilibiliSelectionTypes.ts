export interface BilibiliSelectionHelpers {
  document: Document;
  normalizeWhitespace: (value: string) => string;
  wrapPlainTextAsHtml: (value: string) => string;
  escapeHtml: (value: string) => string;
  shouldSkipTextNode: (node: Text) => boolean;
  isWhitespace: (value: string) => boolean;
}
