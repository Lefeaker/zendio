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
import type { VideoCaptureMutationTransaction } from './videoCaptureMutationTransaction';
import type { SessionDraftTerminalStatus } from '../sessionDrafts';
import { getSelectionForVideoNode, highlightVideoFragmentText } from './videoSessionSelection';
import { createVideoSessionOperationContext } from './videoSessionOperationContext';
import { syncVideoSessionCommentDraftsFromDom } from './videoSessionDraftSync';

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
  scheduleDraftSave: () => Promise<void>;
  flushDraftNow: (status?: 'active' | 'restorable') => Promise<VideoHintState | null>;
  removeDraft: () => Promise<void>;
  finalizeTerminalDraft: (status: SessionDraftTerminalStatus) => Promise<boolean>;
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
  scheduleDraftSave,
  flushDraftNow,
  removeDraft,
  finalizeTerminalDraft
}: VideoSessionRuntimeOperationContextOptions) {
  const context = createVideoSessionOperationContext({
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
    prepareRequestedScreenshot: (captureId: string) =>
      screenshotPreparation.prepareRequestedScreenshot(captureId)
  });

  return Object.assign(context, {
    syncCommentDrafts: () => syncVideoSessionCommentDraftsFromDom(state, dom),
    scheduleDraftSave,
    flushDraftNow,
    removeDraft,
    finalizeTerminalDraft,
    beginPlaybackEditLease: (captureId: string) =>
      commentEditorPlayback.beginPlaybackEditLease(captureId),
    releasePlaybackEditLease: (captureId: string, restorePlayback: boolean) =>
      commentEditorPlayback.releaseForCapture(captureId, restorePlayback),
    resetPlaybackEditLease: () => commentEditorPlayback.reset()
  });
}
