import {
  serializeBlobAttachmentContent,
  serializedAttachmentContentToBlob
} from '../../shared/attachments/clipAttachmentBinary';
import type { StorageAreaService } from '../../platform/interfaces/storage';
import type { VideoCaptureScreenshot } from './types';
import {
  pruneVideoScreenshotCacheIndexEntries,
  type VideoScreenshotCacheIndexState
} from './videoScreenshotCacheIndex';
import { runSerializedVideoScreenshotCacheIndexMutation } from './videoScreenshotCacheIndexMutationQueue';
import {
  VIDEO_SCREENSHOT_CACHE_INDEX_KEY,
  VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES,
  VIDEO_SCREENSHOT_CACHE_MAX_GLOBAL_ENTRIES,
  VIDEO_SCREENSHOT_CACHE_MAX_PAGE_ENTRIES,
  VIDEO_SCREENSHOT_CACHE_TTL_MS,
  createVideoScreenshotCacheIndex,
  createVideoScreenshotCacheStorageKey,
  isVideoScreenshotCachePageKey,
  normalizeVideoScreenshotCacheEntry,
  normalizeVideoScreenshotCacheIndex,
  normalizeVideoScreenshotCacheIndexEntry,
  normalizeVideoScreenshotCacheRef,
  type VideoScreenshotCacheEntry,
  type VideoScreenshotCacheIndexEntry,
  type VideoScreenshotCacheRef
} from './videoScreenshotCacheTypes';

export interface VideoScreenshotCacheRepositoryOptions {
  ttlMs?: number;
  maxGlobalEntries?: number;
  maxPageEntries?: number;
  maxContentBytes?: number;
  now?: () => number;
}

export interface VideoScreenshotCacheSaveInput {
  pageKey: string;
  captureId: string;
  screenshot: VideoCaptureScreenshot;
}

export type VideoScreenshotCacheSaveResult =
  | {
      status: 'saved';
      ref: VideoScreenshotCacheRef;
    }
  | {
      status: 'skipped';
      reason: 'missing-blob-content';
    }
  | {
      status: 'skipped';
      reason: 'invalid-metadata';
      field: 'pageKey';
    }
  | {
      status: 'skipped';
      reason: 'content-too-large';
      byteLength: number;
      maxContentBytes: number;
    }
  | {
      status: 'skipped';
      reason: 'serialize-failed';
      error: string;
    };

export interface VideoScreenshotCacheRepository {
  save(input: VideoScreenshotCacheSaveInput): Promise<VideoScreenshotCacheSaveResult>;
  load(ref: VideoScreenshotCacheRef): Promise<VideoCaptureScreenshot | null>;
  remove(ref: VideoScreenshotCacheRef): Promise<void>;
  removeMany(refs: readonly VideoScreenshotCacheRef[]): Promise<void>;
  pruneExpired(): Promise<void>;
  pruneToLimits(): Promise<void>;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function hasBlobContent(
  screenshot: VideoCaptureScreenshot
): screenshot is VideoCaptureScreenshot & {
  content: NonNullable<VideoCaptureScreenshot['content']>;
} {
  return screenshot.content?.kind === 'blob';
}

function buildRef(entry: VideoScreenshotCacheEntry): VideoScreenshotCacheRef {
  const ref = normalizeVideoScreenshotCacheRef({
    schemaVersion: entry.schemaVersion,
    key: entry.key,
    pageKey: entry.pageKey,
    captureId: entry.captureId,
    id: entry.id,
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    byteLength: entry.byteLength,
    capturedAt: entry.capturedAt,
    expiresAt: entry.expiresAt
  });
  if (ref === null) {
    throw new Error('Invalid video screenshot cache ref.');
  }
  return ref;
}

function buildIndexEntry(entry: VideoScreenshotCacheEntry): VideoScreenshotCacheIndexEntry {
  const indexEntry = normalizeVideoScreenshotCacheIndexEntry({
    schemaVersion: entry.schemaVersion,
    key: entry.key,
    pageKey: entry.pageKey,
    captureId: entry.captureId,
    id: entry.id,
    fileName: entry.fileName,
    mimeType: entry.mimeType,
    byteLength: entry.byteLength,
    capturedAt: entry.capturedAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    expiresAt: entry.expiresAt
  });
  if (indexEntry === null) {
    throw new Error('Invalid video screenshot cache index entry.');
  }
  return indexEntry;
}

function matchesRef(entry: VideoScreenshotCacheEntry, ref: VideoScreenshotCacheRef): boolean {
  return (
    entry.schemaVersion === ref.schemaVersion &&
    entry.key === ref.key &&
    entry.pageKey === ref.pageKey &&
    entry.captureId === ref.captureId &&
    entry.id === ref.id &&
    entry.fileName === ref.fileName &&
    entry.mimeType === ref.mimeType &&
    entry.byteLength === ref.byteLength &&
    entry.capturedAt === ref.capturedAt &&
    entry.expiresAt === ref.expiresAt
  );
}

export function createVideoScreenshotCacheRepository(
  area: StorageAreaService,
  options: VideoScreenshotCacheRepositoryOptions = {}
): VideoScreenshotCacheRepository {
  const ttlMs = normalizePositiveInteger(options.ttlMs, VIDEO_SCREENSHOT_CACHE_TTL_MS);
  const maxGlobalEntries = normalizePositiveInteger(
    options.maxGlobalEntries,
    VIDEO_SCREENSHOT_CACHE_MAX_GLOBAL_ENTRIES
  );
  const maxPageEntries = normalizePositiveInteger(
    options.maxPageEntries,
    VIDEO_SCREENSHOT_CACHE_MAX_PAGE_ENTRIES
  );
  const maxContentBytes = normalizePositiveInteger(
    options.maxContentBytes,
    VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES
  );
  const now = options.now ?? (() => Date.now());

  async function readIndexState(): Promise<VideoScreenshotCacheIndexState> {
    const raw = await area.get(VIDEO_SCREENSHOT_CACHE_INDEX_KEY);
    if (raw === undefined) {
      return {
        entries: [],
        dirty: false
      };
    }

    const parsed = normalizeVideoScreenshotCacheIndex(raw);
    if (parsed === null) {
      return {
        entries: [],
        dirty: true
      };
    }

    return {
      entries: parsed.entries,
      dirty: false
    };
  }

  async function persistIndex(
    entries: VideoScreenshotCacheIndexEntry[],
    removedKeys: readonly string[],
    dirty: boolean
  ): Promise<void> {
    const uniqueRemovedKeys = Array.from(new Set(removedKeys));
    if (uniqueRemovedKeys.length > 0) {
      await area.remove(uniqueRemovedKeys);
    }
    if (dirty || uniqueRemovedKeys.length > 0) {
      await area.set(VIDEO_SCREENSHOT_CACHE_INDEX_KEY, createVideoScreenshotCacheIndex(entries));
    }
  }

  async function removeKeys(keys: Iterable<string>): Promise<void> {
    const keySet = new Set([...keys].filter((key) => typeof key === 'string' && key.length > 0));
    if (keySet.size === 0) {
      return;
    }

    await runSerializedVideoScreenshotCacheIndexMutation(area, async () => {
      const indexState = await readIndexState();
      const nextEntries = indexState.entries.filter((entry) => !keySet.has(entry.key));
      await persistIndex(
        nextEntries,
        [...keySet],
        indexState.dirty || nextEntries.length !== indexState.entries.length
      );
    });
  }

  async function prune(applyLimits: boolean): Promise<void> {
    await runSerializedVideoScreenshotCacheIndexMutation(area, async () => {
      const indexState = await readIndexState();
      const nextState = pruneVideoScreenshotCacheIndexEntries(indexState.entries, {
        now: now(),
        maxGlobalEntries,
        maxPageEntries,
        applyLimits
      });

      if (!indexState.dirty && !nextState.dirty && nextState.removedKeys.length === 0) {
        return;
      }

      await persistIndex(nextState.entries, nextState.removedKeys, true);
    });
  }

  return {
    async save(input) {
      const { pageKey, captureId, screenshot } = input;
      if (!isVideoScreenshotCachePageKey(pageKey)) {
        return {
          status: 'skipped',
          reason: 'invalid-metadata',
          field: 'pageKey'
        };
      }

      if (!hasBlobContent(screenshot)) {
        return {
          status: 'skipped',
          reason: 'missing-blob-content'
        };
      }

      if (screenshot.content.byteLength > maxContentBytes) {
        return {
          status: 'skipped',
          reason: 'content-too-large',
          byteLength: screenshot.content.byteLength,
          maxContentBytes
        };
      }

      let serializedContent;
      try {
        serializedContent = await serializeBlobAttachmentContent(screenshot.content.blob);
      } catch (error) {
        return {
          status: 'skipped',
          reason: 'serialize-failed',
          error: 'VIDEO_SCREENSHOT_CACHE_SERIALIZE_FAILED'
        };
      }

      if (serializedContent.byteLength > maxContentBytes) {
        return {
          status: 'skipped',
          reason: 'content-too-large',
          byteLength: serializedContent.byteLength,
          maxContentBytes
        };
      }

      const operationTime = now();
      const writeTime = Math.max(operationTime, screenshot.capturedAt);
      const expiresAt = writeTime + ttlMs;
      const entry = normalizeVideoScreenshotCacheEntry({
        schemaVersion: 1,
        key: createVideoScreenshotCacheStorageKey({
          pageKey,
          captureId,
          screenshotId: screenshot.id
        }),
        pageKey,
        captureId,
        id: screenshot.id,
        fileName: screenshot.fileName,
        mimeType: screenshot.mimeType,
        byteLength: serializedContent.byteLength,
        capturedAt: screenshot.capturedAt,
        createdAt: writeTime,
        updatedAt: writeTime,
        expiresAt,
        content: serializedContent
      });

      if (entry === null) {
        return {
          status: 'skipped',
          reason: 'serialize-failed',
          error: 'VIDEO_SCREENSHOT_CACHE_ENTRY_REJECTED'
        };
      }

      const ref = buildRef(entry);
      const nextIndexEntry = buildIndexEntry(entry);
      await runSerializedVideoScreenshotCacheIndexMutation(area, async () => {
        const indexState = await readIndexState();
        const replacedKeys = indexState.entries
          .filter(
            (currentEntry) =>
              currentEntry.key !== nextIndexEntry.key &&
              currentEntry.pageKey === nextIndexEntry.pageKey &&
              currentEntry.captureId === nextIndexEntry.captureId
          )
          .map((currentEntry) => currentEntry.key);

        const nextState = pruneVideoScreenshotCacheIndexEntries(
          [
            nextIndexEntry,
            ...indexState.entries.filter(
              (currentEntry) =>
                currentEntry.key !== nextIndexEntry.key &&
                !(
                  currentEntry.pageKey === nextIndexEntry.pageKey &&
                  currentEntry.captureId === nextIndexEntry.captureId
                )
            )
          ],
          {
            now: operationTime,
            maxGlobalEntries,
            maxPageEntries,
            applyLimits: true
          }
        );

        await area.setMany({
          [entry.key]: entry,
          [VIDEO_SCREENSHOT_CACHE_INDEX_KEY]: createVideoScreenshotCacheIndex(nextState.entries)
        });

        const removedKeys = Array.from(
          new Set([...replacedKeys, ...nextState.removedKeys.filter((key) => key !== entry.key)])
        );
        if (removedKeys.length > 0) {
          await area.remove(removedKeys);
        }
      });

      return {
        status: 'saved',
        ref
      };
    },

    async load(ref) {
      const normalizedRef = normalizeVideoScreenshotCacheRef(ref);
      if (normalizedRef === null) {
        return null;
      }

      const operationTime = now();
      const rawEntry = await area.get(normalizedRef.key);
      if (rawEntry === undefined) {
        await removeKeys([normalizedRef.key]);
        return null;
      }

      const entry = normalizeVideoScreenshotCacheEntry(rawEntry);
      if (entry === null || entry.expiresAt <= operationTime || !matchesRef(entry, normalizedRef)) {
        await removeKeys([normalizedRef.key]);
        return null;
      }

      let blob: Blob;
      try {
        blob = serializedAttachmentContentToBlob(
          {
            kind: 'base64',
            binary: entry.content
          },
          entry.mimeType
        );
      } catch {
        await removeKeys([normalizedRef.key]);
        return null;
      }

      return {
        id: entry.id,
        fileName: entry.fileName,
        mimeType: entry.mimeType,
        capturedAt: entry.capturedAt,
        content: {
          kind: 'blob',
          blob,
          byteLength: entry.byteLength
        }
      };
    },

    async remove(ref) {
      const normalizedRef = normalizeVideoScreenshotCacheRef(ref);
      if (normalizedRef === null) {
        return;
      }
      await removeKeys([normalizedRef.key]);
    },

    async removeMany(refs) {
      const keys = refs
        .map((ref) => normalizeVideoScreenshotCacheRef(ref))
        .filter((ref): ref is VideoScreenshotCacheRef => ref !== null)
        .map((ref) => ref.key);
      await removeKeys(keys);
    },

    async pruneExpired() {
      await prune(false);
    },

    async pruneToLimits() {
      await prune(true);
    }
  };
}
