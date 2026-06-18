import type { VideoCapture } from './types';
import type { VideoSessionDraftControllerOptions } from './videoSessionRuntimePorts';
import { restoreVideoDraftCachedScreenshots } from './videoSessionDraftScreenshotCache';

export interface RestoredVideoDraftScreenshotHydrationSettledResult {
  isCurrent: boolean;
  hydratedCount: number;
  invalidRefCount: number;
  staleRefCount: number;
  failedCount: number;
}

interface RestoredVideoDraftScreenshotHydrationArgs {
  captures: VideoCapture[];
  screenshotCache: VideoSessionDraftControllerOptions['screenshotCache'];
  isCurrent: () => boolean;
  onScreenshotHydrationStart?: (() => void) | undefined;
  onScreenshotHydrationChange?: (() => void) | undefined;
  onScreenshotHydrationSettled?:
    | ((result: RestoredVideoDraftScreenshotHydrationSettledResult) => void)
    | undefined;
  scheduleSave: () => Promise<void>;
}

export function scheduleRestoredVideoDraftScreenshotHydration(
  args: RestoredVideoDraftScreenshotHydrationArgs
): void {
  args.onScreenshotHydrationStart?.();
  void hydrateRestoredScreenshots(args);
}

async function hydrateRestoredScreenshots({
  captures,
  screenshotCache,
  isCurrent,
  onScreenshotHydrationStart: _onScreenshotHydrationStart,
  onScreenshotHydrationChange,
  onScreenshotHydrationSettled,
  scheduleSave
}: RestoredVideoDraftScreenshotHydrationArgs): Promise<void> {
  let isHydrationCurrent = false;
  let settledResult: Omit<RestoredVideoDraftScreenshotHydrationSettledResult, 'isCurrent'> = {
    hydratedCount: 0,
    invalidRefCount: 0,
    staleRefCount: 0,
    failedCount: 0
  };
  try {
    const result = await restoreVideoDraftCachedScreenshots(captures, screenshotCache);
    settledResult = result;
    isHydrationCurrent = isCurrent();
    if (!isHydrationCurrent) {
      return;
    }

    const removedRefCount = result.invalidRefCount + result.staleRefCount;
    if (result.hydratedCount > 0 || removedRefCount > 0) {
      onScreenshotHydrationChange?.();
    }
    if (removedRefCount > 0) {
      void scheduleSave().catch((error) => {
        console.warn(
          '[VideoSession] Failed to save draft after clearing stale screenshot refs:',
          error
        );
      });
    }
  } finally {
    onScreenshotHydrationSettled?.({
      isCurrent: isHydrationCurrent,
      ...settledResult
    });
  }
}
