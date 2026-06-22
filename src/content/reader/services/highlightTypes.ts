export interface ReaderHighlightRecord {
  id: string;
  selectedHtml: string;
  selectedText: string;
  comment: string;
  fragmentUrl: string;
  wrapper: HTMLElement;
  wrapperSegments: HTMLElement[];
  footnoteIndex?: number;
  createdAt: number;
}
