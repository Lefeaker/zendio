export interface VideoCaptureScreenshot {
  id: string;
  fileName: string;
  mimeType: 'image/jpeg';
  dataUrl: string;
  capturedAt: number;
}

export interface VideoTimestampCapture {
  kind: 'timestamp';
  id: string;
  timeSec: number;
  url: string;
  comment: string;
  createdAt: number;
  screenshotRequested?: boolean;
  screenshot?: VideoCaptureScreenshot;
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
