import type { VideoFragmentCapture } from './types';
import type { VideoSessionDependencies } from './sessionTypes';
import type { VideoSessionState } from './sessionState';
import type { FragmentHighlighter } from './fragmentHighlighter';
import type { FragmentHighlightCoordinator } from './fragmentHighlightCoordinator';
import type { SelectionCaptureController } from './selectionCaptureController';
import type { VideoSessionLifecycle } from './sessionLifecycle';
import type { VideoSessionExporter } from './videoSessionExporter';
import type { VideoSessionMessages } from './sessionMessages';
import type { VideoHintManager, VideoHintState } from './videoHintManager';
import type { VideoFragmentSelectionController } from './videoFragmentSelectionController';
import type { PendingSelectionTracker } from './pendingSelectionTracker';
import type { ShadowSelectionBridge } from './shadowSelectionBridge';
import type { VideoSessionPlatformController } from './sessionPlatformController';
import type { VideoSessionDomController } from './sessionDom';
import type { VideoSessionOperationContext } from './sessionOperations';
import type { ExportDestinationMetadata } from '../../shared/exportDestination';

interface CreateVideoSessionOperationContextArgs {
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
  updateVideoContext: () => void;
  findVideoElement: () => HTMLVideoElement | null;
  buildTimestampUrl: (timeSec: number) => string | null;
  applyHint: (state: VideoHintState) => void;
  syncPanel: () => void;
  ensureCaptureHighlight: (capture: VideoFragmentCapture) => void;
  getSelectionForNode: (node: Node | null) => Selection | null;
  highlightFragmentText: (text: string) => void;
  getExportDestinationMetadata?: () => ExportDestinationMetadata | undefined;
  prepareRequestedScreenshot?: (captureId: string) => void | Promise<void>;
}

export function createVideoSessionOperationContext(
  args: CreateVideoSessionOperationContextArgs
): VideoSessionOperationContext {
  return {
    session: args.session,
    doc: args.doc,
    state: args.state,
    dependencies: args.dependencies,
    dom: args.dom,
    exporter: args.exporter,
    fragmentHighlighter: args.fragmentHighlighter,
    fragmentHighlightCoordinator: args.fragmentHighlightCoordinator,
    shadowSelectionBridge: args.shadowSelectionBridge,
    pendingSelection: args.pendingSelection,
    selectionCaptureController: args.selectionCaptureController,
    fragmentSelectionController: args.fragmentSelectionController,
    lifecycle: args.lifecycle,
    platformController: args.platformController,
    hintManager: args.hintManager,
    messages: args.messages,
    updateVideoContext: args.updateVideoContext,
    findVideoElement: args.findVideoElement,
    buildTimestampUrl: args.buildTimestampUrl,
    applyHint: args.applyHint,
    syncPanel: args.syncPanel,
    ensureCaptureHighlight: args.ensureCaptureHighlight,
    getSelectionForNode: args.getSelectionForNode,
    highlightFragmentText: args.highlightFragmentText,
    ...(args.prepareRequestedScreenshot
      ? { prepareRequestedScreenshot: args.prepareRequestedScreenshot }
      : {}),
    ...(args.getExportDestinationMetadata
      ? { getExportDestinationMetadata: args.getExportDestinationMetadata }
      : {})
  };
}
