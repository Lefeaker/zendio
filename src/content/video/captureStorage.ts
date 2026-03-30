import type { VideoCapture, VideoFragmentCapture, VideoTimestampCapture } from './types';

export interface StoredVideoTimestampEntry {
  kind?: 'timestamp';
  id: string;
  timeSec: number;
  comment: string;
  url: string;
  createdAt: number;
}

export interface StoredVideoFragmentEntry {
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

export type StoredVideoCaptureEntry = StoredVideoTimestampEntry | StoredVideoFragmentEntry;

export interface StoredVideoCaptureData {
  title?: string;
  url?: string;
  entries: StoredVideoCaptureEntry[];
  updatedAt: number;
}

export interface StorageNamespace {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface DeserializeContext {
  fallbackUrl: string;
}

export function deserializeStoredCaptures(entries: StoredVideoCaptureEntry[], ctx: DeserializeContext): VideoCapture[] {
  return entries.map((entry) => {
    if ((entry as StoredVideoFragmentEntry).kind === 'fragment') {
      const fragmentEntry = entry as StoredVideoFragmentEntry;
      const selectedHtml = fragmentEntry.selectedHtml ?? fragmentEntry.selectedText ?? '';
      const fragmentUrl = fragmentEntry.fragmentUrl ?? ctx.fallbackUrl;
      const capture: VideoFragmentCapture = {
        kind: 'fragment',
        id: fragmentEntry.id,
        comment: fragmentEntry.comment ?? '',
        selectedText: fragmentEntry.selectedText ?? '',
        selectedHtml,
        fragmentUrl,
        createdAt: fragmentEntry.createdAt ?? Date.now()
      };
      if (fragmentEntry.wrapperId !== undefined) {
        capture.wrapperId = fragmentEntry.wrapperId;
      }
      return capture;
    }
    const timestampEntry = entry as StoredVideoTimestampEntry;
    const capture: VideoTimestampCapture = {
      kind: 'timestamp',
      id: timestampEntry.id,
      timeSec: timestampEntry.timeSec ?? 0,
      comment: timestampEntry.comment ?? '',
      url: timestampEntry.url ?? ctx.fallbackUrl,
      createdAt: timestampEntry.createdAt ?? Date.now()
    };
    return capture;
  });
}

export function serializeCaptures(captures: VideoCapture[]): StoredVideoCaptureEntry[] {
  return captures.map((capture) => {
    if (capture.kind === 'fragment') {
      const fragmentEntry: StoredVideoFragmentEntry = {
        kind: 'fragment',
        id: capture.id,
        comment: capture.comment,
        selectedText: capture.selectedText,
        selectedHtml: capture.selectedHtml,
        fragmentUrl: capture.fragmentUrl,
        createdAt: capture.createdAt
      };
      if (capture.wrapperId !== undefined) {
        fragmentEntry.wrapperId = capture.wrapperId;
      }
      return fragmentEntry;
    }
    const timestampEntry: StoredVideoTimestampEntry = {
      kind: 'timestamp',
      id: capture.id,
      timeSec: capture.timeSec,
      comment: capture.comment,
      url: capture.url,
      createdAt: capture.createdAt
    };
    return timestampEntry;
  });
}

export async function loadStoredCaptureData(
  storage: StorageNamespace,
  key: string
): Promise<StoredVideoCaptureData | undefined> {
  return storage.get<StoredVideoCaptureData>(key);
}

export async function saveCaptureData(
  storage: StorageNamespace,
  key: string,
  data: StoredVideoCaptureData
): Promise<void> {
  await storage.set(key, data);
}
