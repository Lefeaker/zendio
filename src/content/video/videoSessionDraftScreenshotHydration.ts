import type { VideoCapture } from './types';
import type { VideoSessionDraftControllerOptions } from './videoSessionRuntimePorts';
import { restoreVideoDraftCachedScreenshots } from './videoSessionDraftScreenshotCache';

interface RestoredVideoDraftScreenshotHydrationArgs {
  captures: VideoCapture[];
  screenshotCache: VideoSessionDraftControllerOptions['screenshotCache'];
  isCurrent: () => boolean;
  onScreenshotHydrationChange?: (() => void) | undefined;
  scheduleSave: () => Promise<void>;
}

export function scheduleRestoredVideoDraftScreenshotHydration(
  args: RestoredVideoDraftScreenshotHydrationArgs
): void {
  void hydrateRestoredScreenshots(args);
}

async function hydrateRestoredScreenshots({
  captures,
  screenshotCache,
  isCurrent,
  onScreenshotHydrationChange,
  scheduleSave
}: RestoredVideoDraftScreenshotHydrationArgs): Promise<void> {
  const result = await restoreVideoDraftCachedScreenshots(captures, screenshotCache);
  if (!isCurrent()) {
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
}
