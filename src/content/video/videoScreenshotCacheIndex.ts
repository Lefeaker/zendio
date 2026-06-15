import type { VideoScreenshotCacheIndexEntry } from './videoScreenshotCacheTypes';

export interface VideoScreenshotCacheIndexState {
  entries: VideoScreenshotCacheIndexEntry[];
  dirty: boolean;
}

export interface VideoScreenshotCachePruneOptions {
  now: number;
  maxGlobalEntries: number;
  maxPageEntries: number;
  applyLimits: boolean;
}

export interface VideoScreenshotCachePruneResult {
  entries: VideoScreenshotCacheIndexEntry[];
  removedKeys: string[];
  dirty: boolean;
}

export function sortVideoScreenshotCacheEntriesNewestFirst(
  entries: readonly VideoScreenshotCacheIndexEntry[]
): VideoScreenshotCacheIndexEntry[] {
  return [...entries].sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }
    if (right.createdAt !== left.createdAt) {
      return right.createdAt - left.createdAt;
    }
    return right.capturedAt - left.capturedAt;
  });
}

export function pruneVideoScreenshotCacheIndexEntries(
  entries: readonly VideoScreenshotCacheIndexEntry[],
  options: VideoScreenshotCachePruneOptions
): VideoScreenshotCachePruneResult {
  const newestFirst = sortVideoScreenshotCacheEntriesNewestFirst(entries);
  const uniqueEntries: VideoScreenshotCacheIndexEntry[] = [];
  const seenKeys = new Set<string>();

  for (const entry of newestFirst) {
    if (seenKeys.has(entry.key)) {
      continue;
    }
    seenKeys.add(entry.key);
    uniqueEntries.push(entry);
  }

  const removedKeys: string[] = [];
  let retained = uniqueEntries.filter((entry) => {
    if (entry.expiresAt <= options.now) {
      removedKeys.push(entry.key);
      return false;
    }
    return true;
  });

  if (options.applyLimits) {
    const perPageRetained: VideoScreenshotCacheIndexEntry[] = [];
    const groupedByPage = new Map<string, VideoScreenshotCacheIndexEntry[]>();

    for (const entry of retained) {
      const pageEntries = groupedByPage.get(entry.pageKey);
      if (pageEntries) {
        pageEntries.push(entry);
      } else {
        groupedByPage.set(entry.pageKey, [entry]);
      }
    }

    for (const pageEntries of groupedByPage.values()) {
      const sorted = sortVideoScreenshotCacheEntriesNewestFirst(pageEntries);
      perPageRetained.push(...sorted.slice(0, options.maxPageEntries));
      for (const entry of sorted.slice(options.maxPageEntries)) {
        removedKeys.push(entry.key);
      }
    }

    retained = sortVideoScreenshotCacheEntriesNewestFirst(perPageRetained);

    if (retained.length > options.maxGlobalEntries) {
      for (const entry of retained.slice(options.maxGlobalEntries)) {
        removedKeys.push(entry.key);
      }
      retained = retained.slice(0, options.maxGlobalEntries);
    }
  }

  const finalEntries = sortVideoScreenshotCacheEntriesNewestFirst(retained);
  const originalKeys = entries.map((entry) => entry.key);
  const finalKeys = finalEntries.map((entry) => entry.key);
  const dirty =
    removedKeys.length > 0 ||
    uniqueEntries.length !== entries.length ||
    originalKeys.length !== finalKeys.length ||
    originalKeys.some((key, index) => finalKeys[index] !== key);

  return {
    entries: finalEntries,
    removedKeys: Array.from(new Set(removedKeys)),
    dirty
  };
}
