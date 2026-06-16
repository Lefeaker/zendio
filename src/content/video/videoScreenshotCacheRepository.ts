import {
  serializeBlobAttachmentContent,
  serializedAttachmentContentToBlob
} from '../../shared/attachments/clipAttachmentBinary';
import type { StorageAreaService } from '../../platform/interfaces/storage';
import type { VideoCaptureScreenshot } from './types';
import { runSerializedVideoScreenshotCacheIndexMutation } from './videoScreenshotCacheIndexMutationQueue';
import {
  buildVideoScreenshotCacheRef,
  matchesVideoScreenshotCacheRef,
  pruneVideoScreenshotCacheIndexEntries,
  persistVideoScreenshotCacheIndex,
  readVideoScreenshotCacheIndexState,
  requireVideoScreenshotCacheIndexEntry
} from './videoScreenshotCacheIndex';
import type {
  VideoScreenshotCacheBlobEntry,
  VideoScreenshotCacheBlobStore
} from './videoScreenshotCacheStore';
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

export interface VideoScreenshotCacheRepositoryDependencies {
  blobStore: VideoScreenshotCacheBlobStore;
  legacyArea?: StorageAreaService;
}

export interface VideoScreenshotCacheSaveInput {
  pageKey: string;
  captureId: string;
  screenshot: VideoCaptureScreenshot;
}

export type VideoScreenshotCacheSaveResult =
  | { status: 'saved'; ref: VideoScreenshotCacheRef }
  | { status: 'skipped'; reason: 'missing-blob-content' }
  | { status: 'skipped'; reason: 'invalid-metadata'; field: 'pageKey' }
  | {
      status: 'skipped';
      reason: 'content-too-large';
      byteLength: number;
      maxContentBytes: number;
    }
  | { status: 'skipped'; reason: 'serialize-failed'; error: string };

export interface VideoScreenshotCacheRepository {
  save(input: VideoScreenshotCacheSaveInput): Promise<VideoScreenshotCacheSaveResult>;
  load(ref: VideoScreenshotCacheRef): Promise<VideoCaptureScreenshot | null>;
  remove(ref: VideoScreenshotCacheRef): Promise<void>;
  removeMany(refs: readonly VideoScreenshotCacheRef[]): Promise<void>;
  pruneExpired(): Promise<void>;
  pruneToLimits(): Promise<void>;
}

interface ResolvedOptions {
  ttlMs: number;
  maxGlobalEntries: number;
  maxPageEntries: number;
  maxContentBytes: number;
  now: () => number;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function resolveOptions(options: VideoScreenshotCacheRepositoryOptions): ResolvedOptions {
  return {
    ttlMs: normalizePositiveInteger(options.ttlMs, VIDEO_SCREENSHOT_CACHE_TTL_MS),
    maxGlobalEntries: normalizePositiveInteger(
      options.maxGlobalEntries,
      VIDEO_SCREENSHOT_CACHE_MAX_GLOBAL_ENTRIES
    ),
    maxPageEntries: normalizePositiveInteger(
      options.maxPageEntries,
      VIDEO_SCREENSHOT_CACHE_MAX_PAGE_ENTRIES
    ),
    maxContentBytes: normalizePositiveInteger(
      options.maxContentBytes,
      VIDEO_SCREENSHOT_CACHE_MAX_CONTENT_BYTES
    ),
    now: options.now ?? (() => Date.now())
  };
}

function hasBlobContent(
  screenshot: VideoCaptureScreenshot
): screenshot is VideoCaptureScreenshot & {
  content: NonNullable<VideoCaptureScreenshot['content']>;
} {
  return screenshot.content?.kind === 'blob';
}

function isStorageAreaService(
  value: StorageAreaService | VideoScreenshotCacheRepositoryDependencies
): value is StorageAreaService {
  return typeof (value as StorageAreaService).get === 'function';
}

function createMutationSerializer() {
  let chain = Promise.resolve();
  return async function runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const current = chain.then(operation, operation);
    chain = current.then(
      () => undefined,
      () => undefined
    );
    return current;
  };
}

function buildEntryMetadata(
  pageKey: string,
  captureId: string,
  screenshot: Pick<
    VideoCaptureScreenshot,
    'id' | 'fileName' | 'mimeType' | 'capturedAt'
  >,
  byteLength: number,
  options: ResolvedOptions,
  operationTime: number
): VideoScreenshotCacheIndexEntry {
  const writeTime = Math.max(operationTime, screenshot.capturedAt);
  return requireVideoScreenshotCacheIndexEntry({
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
    byteLength,
    capturedAt: screenshot.capturedAt,
    createdAt: writeTime,
    updatedAt: writeTime,
    expiresAt: writeTime + options.ttlMs
  });
}

function tryBuildEntryMetadata(
  pageKey: string,
  captureId: string,
  screenshot: Pick<
    VideoCaptureScreenshot,
    'id' | 'fileName' | 'mimeType' | 'capturedAt'
  >,
  byteLength: number,
  options: ResolvedOptions,
  operationTime: number
): VideoScreenshotCacheIndexEntry | null {
  try {
    return buildEntryMetadata(pageKey, captureId, screenshot, byteLength, options, operationTime);
  } catch {
    return null;
  }
}

function toScreenshot(
  entry: Pick<
    VideoScreenshotCacheIndexEntry,
    'id' | 'fileName' | 'mimeType' | 'capturedAt' | 'byteLength'
  >,
  blob: Blob
): VideoCaptureScreenshot {
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
}

async function removeLegacyKeys(
  area: StorageAreaService | undefined,
  keys: Iterable<string>
): Promise<void> {
  if (!area) {
    return;
  }
  const keySet = new Set([...keys].filter((key) => typeof key === 'string' && key.length > 0));
  if (keySet.size === 0) {
    return;
  }

  await runSerializedVideoScreenshotCacheIndexMutation(area, async () => {
    const indexState = await readVideoScreenshotCacheIndexState(area);
    const nextEntries = indexState.entries.filter((entry) => !keySet.has(entry.key));
    await persistVideoScreenshotCacheIndex(
      area,
      nextEntries,
      [...keySet],
      indexState.dirty || nextEntries.length !== indexState.entries.length
    );
  });
}

function pruneLegacyEntries(
  entries: readonly VideoScreenshotCacheIndexEntry[],
  options: ResolvedOptions,
  applyLimits: boolean,
  now = options.now()
) {
  return pruneVideoScreenshotCacheIndexEntries(entries, {
    now,
    maxGlobalEntries: options.maxGlobalEntries,
    maxPageEntries: options.maxPageEntries,
    applyLimits
  });
}

async function loadLegacyEntry(
  area: StorageAreaService | undefined,
  ref: VideoScreenshotCacheRef,
  operationTime: number
): Promise<{ entry: VideoScreenshotCacheEntry; blob: Blob } | null> {
  if (!area) {
    return null;
  }

  const rawEntry = await area.get(ref.key);
  if (rawEntry === undefined) {
    await removeLegacyKeys(area, [ref.key]);
    return null;
  }

  const entry = normalizeVideoScreenshotCacheEntry(rawEntry);
  if (entry === null || entry.expiresAt <= operationTime || !matchesVideoScreenshotCacheRef(entry, ref)) {
    await removeLegacyKeys(area, [ref.key]);
    return null;
  }

  try {
    return {
      entry,
      blob: serializedAttachmentContentToBlob(
        {
          kind: 'base64',
          binary: entry.content
        },
        entry.mimeType
      )
    };
  } catch {
    await removeLegacyKeys(area, [ref.key]);
    return null;
  }
}

export function createVideoScreenshotCacheRepository(
  area: StorageAreaService,
  options?: VideoScreenshotCacheRepositoryOptions
): VideoScreenshotCacheRepository;
export function createVideoScreenshotCacheRepository(
  dependencies: VideoScreenshotCacheRepositoryDependencies,
  options?: VideoScreenshotCacheRepositoryOptions
): VideoScreenshotCacheRepository;
export function createVideoScreenshotCacheRepository(
  target: StorageAreaService | VideoScreenshotCacheRepositoryDependencies,
  options: VideoScreenshotCacheRepositoryOptions = {}
): VideoScreenshotCacheRepository {
  const resolved = resolveOptions(options);
  const legacyMode = isStorageAreaService(target);
  const legacyArea = legacyMode ? target : target.legacyArea;
  const legacyStore = legacyMode ? target : undefined;
  const blobStore = legacyMode ? undefined : target.blobStore;
  const runBlobMutation = legacyMode ? undefined : createMutationSerializer();

  async function prune(applyLimits: boolean): Promise<void> {
    if (blobStore && runBlobMutation) {
      await runBlobMutation(async () => {
        const result = await blobStore.prune({
          now: resolved.now(),
          maxGlobalEntries: resolved.maxGlobalEntries,
          maxPageEntries: resolved.maxPageEntries,
          applyLimits
        });
        await removeLegacyKeys(legacyArea, result.removedKeys);
      });
      return;
    }
    if (!legacyStore) {
      return;
    }
    await runSerializedVideoScreenshotCacheIndexMutation(legacyStore, async () => {
      const indexState = await readVideoScreenshotCacheIndexState(legacyStore);
      const nextState = pruneLegacyEntries(indexState.entries, resolved, applyLimits);
      if (!indexState.dirty && !nextState.dirty && nextState.removedKeys.length === 0) {
        return;
      }
      await persistVideoScreenshotCacheIndex(legacyStore, nextState.entries, nextState.removedKeys, true);
    });
  }

  return {
    async save(input) {
      const { pageKey, captureId, screenshot } = input;
      if (!isVideoScreenshotCachePageKey(pageKey)) {
        return { status: 'skipped', reason: 'invalid-metadata', field: 'pageKey' };
      }
      if (!hasBlobContent(screenshot)) {
        return { status: 'skipped', reason: 'missing-blob-content' };
      }

      const operationTime = resolved.now();
      if (legacyMode) {
        if (screenshot.content.byteLength > resolved.maxContentBytes) {
          return {
            status: 'skipped',
            reason: 'content-too-large',
            byteLength: screenshot.content.byteLength,
            maxContentBytes: resolved.maxContentBytes
          };
        }

        let serializedContent;
        try {
          serializedContent = await serializeBlobAttachmentContent(screenshot.content.blob);
        } catch (error) {
          return {
            status: 'skipped',
            reason: 'serialize-failed',
            error: error instanceof Error ? error.message : 'Unknown serialization failure.'
          };
        }

        if (serializedContent.byteLength > resolved.maxContentBytes) {
          return {
            status: 'skipped',
            reason: 'content-too-large',
            byteLength: serializedContent.byteLength,
            maxContentBytes: resolved.maxContentBytes
          };
        }

        const metadata = tryBuildEntryMetadata(
          pageKey,
          captureId,
          screenshot,
          serializedContent.byteLength,
          resolved,
          operationTime
        );
        const entry =
          metadata === null
            ? null
            : normalizeVideoScreenshotCacheEntry({
                ...metadata,
                content: serializedContent
              });
        if (entry === null || !legacyStore) {
          return {
            status: 'skipped',
            reason: 'serialize-failed',
            error: 'Repository rejected the normalized cache entry.'
          };
        }

        const ref = buildVideoScreenshotCacheRef(entry);
        await runSerializedVideoScreenshotCacheIndexMutation(legacyStore, async () => {
          const indexState = await readVideoScreenshotCacheIndexState(legacyStore);
          const replacedKeys = indexState.entries
            .filter(
              (currentEntry) =>
                currentEntry.key !== entry.key &&
                currentEntry.pageKey === entry.pageKey &&
                currentEntry.captureId === entry.captureId
            )
            .map((currentEntry) => currentEntry.key);
          const nextState = pruneLegacyEntries(
            [
              entry,
              ...indexState.entries.filter(
                (currentEntry) =>
                  currentEntry.key !== entry.key &&
                  !(
                    currentEntry.pageKey === entry.pageKey &&
                    currentEntry.captureId === entry.captureId
                  )
              )
            ],
            resolved,
            true,
            operationTime
          );

          await legacyStore.setMany({
            [entry.key]: entry,
            [VIDEO_SCREENSHOT_CACHE_INDEX_KEY]: createVideoScreenshotCacheIndex(nextState.entries)
          });

          const removedKeys = Array.from(
            new Set([...replacedKeys, ...nextState.removedKeys.filter((key) => key !== entry.key)])
          );
          if (removedKeys.length > 0) {
            await legacyStore.remove(removedKeys);
          }
        });

        return { status: 'saved', ref };
      }

      const byteLength = screenshot.content.blob.size;
      if (byteLength > resolved.maxContentBytes || !blobStore || !runBlobMutation) {
        return {
          status: 'skipped',
          reason: 'content-too-large',
          byteLength,
          maxContentBytes: resolved.maxContentBytes
        };
      }

      const entry = tryBuildEntryMetadata(
        pageKey,
        captureId,
        screenshot,
        byteLength,
        resolved,
        operationTime
      );
      if (entry === null) {
        return {
          status: 'skipped',
          reason: 'serialize-failed',
          error: 'Repository rejected the normalized cache entry.'
        };
      }
      const ref = buildVideoScreenshotCacheRef(entry);

      await runBlobMutation(async () => {
        const replacedKeys = (await blobStore.listByPageKey(entry.pageKey))
          .filter(
            (currentEntry) =>
              currentEntry.key !== entry.key && currentEntry.captureId === entry.captureId
          )
          .map((currentEntry) => currentEntry.key);

        await blobStore.put({
          ...entry,
          blob: screenshot.content.blob
        } satisfies VideoScreenshotCacheBlobEntry);

        if (replacedKeys.length > 0) {
          await blobStore.deleteMany(replacedKeys);
        }

        const pruneResult = await blobStore.prune({
          now: operationTime,
          maxGlobalEntries: resolved.maxGlobalEntries,
          maxPageEntries: resolved.maxPageEntries,
          applyLimits: true
        });

        await removeLegacyKeys(legacyArea, [...replacedKeys, ...pruneResult.removedKeys]);
      });

      return { status: 'saved', ref };
    },

    async load(ref) {
      const normalizedRef = normalizeVideoScreenshotCacheRef(ref);
      if (normalizedRef === null) {
        return null;
      }

      const operationTime = resolved.now();
      if (blobStore) {
        const blobEntry = await blobStore.get(normalizedRef.key);
        if (
          blobEntry &&
          blobEntry.expiresAt > operationTime &&
          matchesVideoScreenshotCacheRef(blobEntry, normalizedRef)
        ) {
          return toScreenshot(blobEntry, blobEntry.blob);
        }
        if (blobEntry) {
          await blobStore.delete(normalizedRef.key);
        }
      }

      const legacyLoaded = await loadLegacyEntry(legacyArea, normalizedRef, operationTime);
      if (!legacyLoaded) {
        return null;
      }

      if (blobStore) {
        try {
          await blobStore.put({
            ...legacyLoaded.entry,
            blob: legacyLoaded.blob
          } satisfies VideoScreenshotCacheBlobEntry);
          await removeLegacyKeys(legacyArea, [normalizedRef.key]);
        } catch {
          // Best-effort migration. A valid legacy load still returns the screenshot.
        }
      }

      return toScreenshot(legacyLoaded.entry, legacyLoaded.blob);
    },

    async remove(ref) {
      const normalizedRef = normalizeVideoScreenshotCacheRef(ref);
      if (normalizedRef === null) {
        return;
      }

      if (blobStore && runBlobMutation) {
        await runBlobMutation(async () => {
          await blobStore.delete(normalizedRef.key);
          await removeLegacyKeys(legacyArea, [normalizedRef.key]);
        });
        return;
      }

      await removeLegacyKeys(legacyStore, [normalizedRef.key]);
    },

    async removeMany(refs) {
      const keys = refs
        .map((ref) => normalizeVideoScreenshotCacheRef(ref))
        .filter((ref): ref is VideoScreenshotCacheRef => ref !== null)
        .map((ref) => ref.key);
      if (keys.length === 0) {
        return;
      }

      if (blobStore && runBlobMutation) {
        await runBlobMutation(async () => {
          await blobStore.deleteMany(keys);
          await removeLegacyKeys(legacyArea, keys);
        });
        return;
      }

      await removeLegacyKeys(legacyStore, keys);
    },

    async pruneExpired() {
      await prune(false);
    },

    async pruneToLimits() {
      await prune(true);
    }
  };
}
