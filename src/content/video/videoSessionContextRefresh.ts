import type { VideoSessionState } from './sessionState';
import type { VideoSessionPlatformController } from './sessionPlatformController';
import type { FragmentHighlightCoordinator } from './fragmentHighlightCoordinator';
import type { VideoHintState } from './videoHintManager';

export function handleVideoSessionUrlChange(args: {
  platformController: VideoSessionPlatformController;
  state: VideoSessionState;
  refreshContext: () => Promise<void>;
}): void {
  args.platformController.updateVideoContext();
  args.platformController.syncPlatformAdapter();
  args.state.videoTitle = args.platformController.extractVideoTitle();
  void args.refreshContext();
}

export function handleVideoSessionVideoElementChange(args: {
  element: HTMLVideoElement | null;
  state: VideoSessionState;
  applyHint: (state: VideoHintState) => void;
  resolveHintState: (videoAvailable: boolean, captureCount: number) => VideoHintState;
}): void {
  if (!args.element) {
    if (args.state.videoElement) {
      args.state.videoElement = null;
      args.applyHint('noVideo');
    }
    return;
  }
  if (args.state.videoElement === args.element) {
    return;
  }
  args.state.videoElement = args.element;
  args.applyHint(args.resolveHintState(true, args.state.captures.length));
}

export async function refreshVideoSessionContext(args: {
  platformController: VideoSessionPlatformController;
  applyHint: (state: VideoHintState) => void;
  syncPanel: () => void;
  fragmentHighlightCoordinator: FragmentHighlightCoordinator;
}): Promise<void> {
  const result = await args.platformController.refreshContext();
  args.applyHint(result.hintState);
  args.syncPanel();
  args.fragmentHighlightCoordinator.start();
  if (result.shouldScheduleFragmentRestore) {
    args.fragmentHighlightCoordinator.scheduleRestore();
  }
}
