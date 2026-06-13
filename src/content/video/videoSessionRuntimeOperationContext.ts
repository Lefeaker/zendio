import type { VideoFragmentCapture } from './types';
import type { VideoSessionDependencies } from './sessionTypes';
import type { VideoSessionState } from './sessionState';
import type { VideoSessionMessages } from './sessionMessages';
import type { VideoHintManager, VideoHintState } from './videoHintManager';
import type { FragmentHighlighter } from './fragmentHighlighter';
import type { PendingSelectionTracker } from './pendingSelectionTracker';
import type { ShadowSelectionBridge } from './shadowSelectionBridge';
import type { FragmentHighlightCoordinator } from './fragmentHighlightCoordinator';
import type { SelectionCaptureController } from './selectionCaptureController';
import type { VideoSessionLifecycle } from './sessionLifecycle';
import type { VideoSessionExporter } from './videoSessionExporter';
import type { VideoFragmentSelectionController } from './videoFragmentSelectionController';
import type { VideoSessionPlatformController } from './sessionPlatformController';
import type { VideoSessionDomController } from './sessionDom';
import type { ContentExportDestinationState } from '../shared/exportDestinationState';
import type { VideoCommentEditorPlaybackController } from './videoCommentEditorPlaybackController';
import type { VideoScreenshotPreparationCoordinator } from './videoScreenshotPreparationCoordinator';
import type { VideoCaptureMutationTransaction } from './videoCaptureMutationTypes';
import { getSelectionForVideoNode, highlightVideoFragmentText } from './videoSessionSelection';
import { createVideoSessionOperationContext } from './videoSessionOperationContext';
import type {
  VideoSessionDraftRuntimePort,
  VideoSessionPlaybackEditLeasePort,
  VideoSessionScreenshotsPort
} from './videoSessionRuntimePorts';

interface VideoSessionRuntimeOperationContextOptions {
  session: object;
  doc: Document;
  state: VideoSessionState;
  dependencies: VideoSessionDependencies;
  dom: VideoSessionDomController;
  exporter: VideoSessionExporter;
  fragmentHighlighter: FragmentHighlighter;
  fragmentHighlightCoordinator: FragmentHighlightCoordinator;
  shadowSelectionBridge: ShadowSelectionBridge;
  pendingSelection: PendingSelectionTracker;
  selectionCaptureController: SelectionCaptureController;
  fragmentSelectionController: VideoFragmentSelectionController;
  lifecycle: VideoSessionLifecycle;
  platformController: VideoSessionPlatformController;
  hintManager: VideoHintManager;
  messages: VideoSessionMessages;
  destinationState: ContentExportDestinationState;
  commentEditorPlayback: VideoCommentEditorPlaybackController;
  screenshotPreparation: VideoScreenshotPreparationCoordinator;
  applyHint: (state: VideoHintState) => void;
  syncPanel: () => void;
  runCaptureMutation: <Result>(
    transaction: VideoCaptureMutationTransaction<Result>
  ) => Promise<boolean>;
  ensureCaptureHighlight: (capture: VideoFragmentCapture) => void;
  drafts: VideoSessionDraftRuntimePort;
}

export function createVideoSessionRuntimeOperationContext({
  session,
  doc,
  state,
  dependencies,
  dom,
  exporter,
  fragmentHighlighter,
  fragmentHighlightCoordinator,
  shadowSelectionBridge,
  pendingSelection,
  selectionCaptureController,
  fragmentSelectionController,
  lifecycle,
  platformController,
  hintManager,
  messages,
  destinationState,
  commentEditorPlayback,
  screenshotPreparation,
  applyHint,
  syncPanel,
  runCaptureMutation,
  ensureCaptureHighlight,
  drafts
}: VideoSessionRuntimeOperationContextOptions) {
  const playbackEditLease: VideoSessionPlaybackEditLeasePort = {
    begin: (captureId: string) => commentEditorPlayback.beginPlaybackEditLease(captureId),
    release: (captureId: string, restorePlayback: boolean) =>
      commentEditorPlayback.releaseForCapture(captureId, restorePlayback),
    reset: () => commentEditorPlayback.reset()
  };
  const screenshots: VideoSessionScreenshotsPort = {
    prepareRequested: (captureId: string) =>
      screenshotPreparation.prepareRequestedScreenshot(captureId)
  };

  return createVideoSessionOperationContext({
    session,
    doc,
    state,
    dependencies,
    dom,
    exporter,
    fragmentHighlighter,
    fragmentHighlightCoordinator,
    shadowSelectionBridge,
    pendingSelection,
    selectionCaptureController,
    fragmentSelectionController,
    lifecycle,
    platformController,
    hintManager,
    messages,
    updateVideoContext: () => platformController.updateVideoContext(),
    findVideoElement: () => doc.querySelector('video'),
    buildTimestampUrl: (timeSec: number) => platformController.buildTimestampUrl(timeSec),
    applyHint,
    syncPanel,
    runCaptureMutation,
    ensureCaptureHighlight,
    getSelectionForNode: (node: Node | null) => getSelectionForVideoNode(doc, node),
    highlightFragmentText: (text: string) => highlightVideoFragmentText({ doc, state, text }),
    getExportDestinationMetadata: () => destinationState.metadata,
    drafts,
    playbackEditLease,
    screenshots
  });
}
