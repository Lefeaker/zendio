import type { VideoCapture } from './types';
import type { VideoScreenshotCacheRepository } from './videoScreenshotCacheRepository';
import {
  normalizeVideoScreenshotCacheRef,
  type VideoScreenshotCacheRef
} from './videoScreenshotCacheTypes';

export type VideoSessionDraftScreenshotCache = Pick<
  VideoScreenshotCacheRepository,
  'load' | 'removeMany'
>;

export async function restoreVideoDraftCachedScreenshots(
  captures: VideoCapture[],
  screenshotCache?: Pick<VideoSessionDraftScreenshotCache, 'load'>
): Promise<void> {
  if (!screenshotCache) {
    return;
  }

  for (const capture of captures) {
    if (capture.kind !== 'timestamp') {
      continue;
    }

    const screenshotRef = normalizeVideoScreenshotCacheRef(capture.screenshotRef);
    if (!screenshotRef) {
      delete capture.screenshotRef;
      continue;
    }

    try {
      const screenshot = await screenshotCache.load(screenshotRef);
      if (screenshot) {
        capture.screenshot = screenshot;
      }
    } catch (error) {
      console.warn('[VideoSession] Failed to load cached screenshot during draft restore:', error);
    }
  }
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
