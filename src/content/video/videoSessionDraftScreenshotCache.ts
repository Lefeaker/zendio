import type { VideoCapture } from './types';
import type { VideoScreenshotCacheRepository } from './videoScreenshotCacheRepository';
import { clearTimestampScreenshotRef, setTimestampScreenshot } from './screenshotIntent';
import {
  normalizeVideoScreenshotCacheRef,
  type VideoScreenshotCacheRef
} from './videoScreenshotCacheTypes';

export type VideoSessionDraftScreenshotCache = Pick<
  VideoScreenshotCacheRepository,
  'load' | 'removeMany'
>;

export interface VideoDraftCachedScreenshotRestoreResult {
  hydratedCount: number;
  invalidRefCount: number;
  staleRefCount: number;
  failedCount: number;
}

interface VideoDraftCachedScreenshotRestoreCandidate {
  capture: Extract<VideoCapture, { kind: 'timestamp' }>;
  ref: VideoScreenshotCacheRef;
}

const DEFAULT_DRAFT_SCREENSHOT_RESTORE_CONCURRENCY = 4;

export async function restoreVideoDraftCachedScreenshots(
  captures: VideoCapture[],
  screenshotCache?: Pick<VideoSessionDraftScreenshotCache, 'load'>,
  options: { concurrency?: number } = {}
): Promise<VideoDraftCachedScreenshotRestoreResult> {
  const result: VideoDraftCachedScreenshotRestoreResult = {
    hydratedCount: 0,
    invalidRefCount: 0,
    staleRefCount: 0,
    failedCount: 0
  };

  if (!screenshotCache) {
    return result;
  }

  const candidates: VideoDraftCachedScreenshotRestoreCandidate[] = [];
  for (const capture of captures) {
    if (capture.kind !== 'timestamp') {
      continue;
    }

    const screenshotRef = normalizeVideoScreenshotCacheRef(capture.screenshotRef);
    if (!screenshotRef) {
      if (Object.prototype.hasOwnProperty.call(capture, 'screenshotRef')) {
        clearTimestampScreenshotRef(capture);
        result.invalidRefCount += 1;
      }
      continue;
    }

    candidates.push({ capture, ref: screenshotRef });
  }

  await runBounded(
    candidates,
    normalizeConcurrency(options.concurrency),
    async ({ capture, ref }) => {
      try {
        const screenshot = await screenshotCache.load(ref);
        if (screenshot) {
          setTimestampScreenshot(capture, screenshot);
          result.hydratedCount += 1;
          return;
        }
        clearTimestampScreenshotRef(capture);
        result.staleRefCount += 1;
      } catch (error) {
        result.failedCount += 1;
        console.warn(
          '[VideoSession] Failed to load cached screenshot during draft restore:',
          error
        );
      }
    }
  );

  return result;
}

export async function cleanupVideoDraftTerminalArtifacts(options: {
  removeDraft: () => Promise<void>;
  captures: readonly VideoCapture[];
  screenshotCache?: Pick<VideoSessionDraftScreenshotCache, 'removeMany'> | undefined;
}): Promise<void> {
  const cleanupErrors: Error[] = [];

  try {
    await options.removeDraft();
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
  }

  try {
    await removeVideoDraftCachedScreenshots(options.captures, options.screenshotCache);
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
  }

  if (cleanupErrors.length > 0) {
    throw cleanupErrors[0];
  }
}

export async function removeVideoDraftCachedScreenshots(
  captures: readonly VideoCapture[],
  screenshotCache?: Pick<VideoSessionDraftScreenshotCache, 'removeMany'>
): Promise<void> {
  const refs = collectVideoDraftScreenshotRefs(captures);
  if (refs.length === 0 || !screenshotCache) {
    return;
  }

  await screenshotCache.removeMany(refs);
}

export function collectVideoDraftScreenshotRefs(
  captures: readonly VideoCapture[]
): VideoScreenshotCacheRef[] {
  const refs: VideoScreenshotCacheRef[] = [];
  const seenKeys = new Set<string>();

  for (const capture of captures) {
    if (capture.kind !== 'timestamp') {
      continue;
    }

    const screenshotRef = normalizeVideoScreenshotCacheRef(capture.screenshotRef);
    if (!screenshotRef || seenKeys.has(screenshotRef.key)) {
      continue;
    }

    seenKeys.add(screenshotRef.key);
    refs.push(screenshotRef);
  }

  return refs;
}

function normalizeConcurrency(value: number | undefined): number {
  return Number.isInteger(value) && typeof value === 'number' && value > 0
    ? value
    : DEFAULT_DRAFT_SCREENSHOT_RESTORE_CONCURRENCY;
}

async function runBounded<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        if (item !== undefined) {
          await worker(item);
        }
      }
    })
  );
}
