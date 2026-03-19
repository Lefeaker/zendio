export interface VideoTimestampCapture {
  kind: 'timestamp';
  id: string;
  timeSec: number;
  url: string;
  comment: string;
  createdAt: number;
}

export interface VideoFragmentCapture {
  kind: 'fragment';
  id: string;
  timeSec?: number;
  comment: string;
  selectedText: string;
  selectedHtml: string;
  fragmentUrl: string;
  createdAt: number;
  wrapperId?: string;
}

export type VideoCapture = VideoTimestampCapture | VideoFragmentCapture;
