import type { VideoCapture } from './types';
import type { VideoSessionDraftControllerOptions } from './videoSessionRuntimePorts';
import { restoreVideoDraftCachedScreenshots } from './videoSessionDraftScreenshotCache';

interface RestoredVideoDraftScreenshotHydrationArgs {
  captures: VideoCapture[];
  screenshotCache: VideoSessionDraftControllerOptions['screenshotCache'];
  isCurrent: () => boolean;
  onScreenshotHydrationStart?: (() => void) | undefined;
  onScreenshotHydrationChange?: (() => void) | undefined;
  onScreenshotHydrationSettled?: ((result: { isCurrent: boolean }) => void) | undefined;
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
  try {
    const result = await restoreVideoDraftCachedScreenshots(captures, screenshotCache);
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
    onScreenshotHydrationSettled?.({ isCurrent: isHydrationCurrent });
  }
}
