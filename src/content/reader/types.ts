import type { ExportDestinationMetadata } from '@shared/exportDestination';

export interface ReaderBootstrapHighlight {
  range: Range;
  selectedHtml: string;
  selectedText: string;
  comment: string;
  destination?: ExportDestinationMetadata;
}

export interface ExternalHighlightPayload {
  range: Range;
  selectedHtml: string;
  selectedText: string;
  comment: string;
}
