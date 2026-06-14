import type { VideoScreenshotCacheRef } from './videoScreenshotCacheTypes';

export interface VideoCaptureScreenshotContent {
  kind: 'blob';
  blob: Blob;
  byteLength: number;
}

interface VideoCaptureScreenshotBase {
  id: string;
  fileName: string;
  mimeType: 'image/jpeg';
  capturedAt: number;
}

export type VideoCaptureScreenshot =
  | (VideoCaptureScreenshotBase & {
      content: VideoCaptureScreenshotContent;
      dataUrl?: string;
    })
  | (VideoCaptureScreenshotBase & {
      // Legacy compatibility bridge for exporter/background follow-up work.
      dataUrl: string;
      content?: VideoCaptureScreenshotContent;
    });

export interface VideoTimestampCapture {
  kind: 'timestamp';
  id: string;
  timeSec: number;
  url: string;
  comment: string;
  createdAt: number;
  screenshotRequested?: boolean;
  screenshot?: VideoCaptureScreenshot;
  screenshotRef?: VideoScreenshotCacheRef;
  screenshotPreparationFailed?: true;
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
