import type { VideoPlatformContext } from './platforms';
import type { VideoFragmentCapture } from './types';
import type { VideoSessionDependencies } from './sessionTypes';
import { FragmentHighlighter } from './fragmentHighlighter';
import { PendingSelectionTracker } from './pendingSelectionTracker';
import { ShadowSelectionBridge } from './shadowSelectionBridge';
import { FragmentHighlightCoordinator } from './fragmentHighlightCoordinator';
import { SelectionCaptureController } from './selectionCaptureController';
import { VideoSessionLifecycle } from './sessionLifecycle';
import { VideoSessionExporter } from './videoSessionExporter';
import type { VideoSessionMessages } from './sessionMessages';
import { VideoHintManager } from './videoHintManager';
import { VideoFragmentSelectionController } from './videoFragmentSelectionController';
import { VideoSessionState } from './sessionState';
import { VideoSessionPlatformController } from './sessionPlatformController';
import { VideoSessionDomController } from './sessionDom';

export interface VideoSessionControllers {
  fragmentHighlighter: FragmentHighlighter;
  hintManager: VideoHintManager;
  pendingSelection: PendingSelectionTracker;
  shadowSelectionBridge: ShadowSelectionBridge;
  fragmentHighlightCoordinator: FragmentHighlightCoordinator;
  selectionCaptureController: SelectionCaptureController;
  fragmentSelectionController: VideoFragmentSelectionController;
  lifecycle: VideoSessionLifecycle;
  exporter: VideoSessionExporter;
  platformController: VideoSessionPlatformController;
  dom: VideoSessionDomController;
}

export function createVideoSessionControllers(args: {
  doc: Document;
  dependencies: VideoSessionDependencies;
  state: VideoSessionState;
  getMessages: () => VideoSessionMessages;
  createPlatformContext: () => VideoPlatformContext;
  getDocumentSelection: () => Selection | null;
  isRangeInsideUi: (range: Range | null) => boolean;
  ensureCaptureHighlight: (capture: VideoFragmentCapture) => void;
  onSelectionAccepted: (payload: {
    selectedHtml: string;
    selectedText: string;
    range?: Range | null;
  }) => void;
  findVideoElement: () => HTMLVideoElement | null;
  handleUrlChange: () => void;
  handleVideoElementChange: (element: HTMLVideoElement | null) => void;
}): VideoSessionControllers {
  const {
    doc,
    dependencies,
    state,
    getMessages,
    createPlatformContext,
    getDocumentSelection,
    isRangeInsideUi,
    ensureCaptureHighlight,
    onSelectionAccepted,
    findVideoElement,
    handleUrlChange,
    handleVideoElementChange
  } = args;

  const fragmentHighlighter = new FragmentHighlighter(doc);
  const hintManager = new VideoHintManager(getMessages);
  const pendingSelection = new PendingSelectionTracker();
  const shadowSelectionBridge = new ShadowSelectionBridge({
    suppressSelectionCapture: () => state.suppressSelectionCapture,
    getDocumentSelection,
    isRangeInsideUi,
    pendingSelection
  });
  const fragmentHighlightCoordinator = new FragmentHighlightCoordinator({
    doc,
    highlighter: fragmentHighlighter,
    getFragments: () =>
      state.captures.filter(
        (capture): capture is VideoFragmentCapture => capture.kind === 'fragment'
      ),
    ensureCaptureHighlight
  });
  const fragmentSelectionController = new VideoFragmentSelectionController(
    {
      doc,
      pendingSelection,
      getFragmentConfig: () => state.fragmentConfig,
      getPlatformAdapter: () => state.platformAdapter
    },
    {
      onSelectionAccepted
    }
  );
  const selectionCaptureController = new SelectionCaptureController({
    doc,
    pendingSelection,
    shouldTrackSelection: () => fragmentSelectionController.shouldTrackSelection(),
    suppressSelectionCapture: () => state.suppressSelectionCapture,
    isRangeInsideUi,
    getDocumentSelection,
    onSelectionActivated: (payload) =>
      fragmentSelectionController.processActivatedSelection(payload),
    onSelectionCleared: () => {
      // no-op for now; handled by fragment selection controller when needed
    }
  });
  const lifecycle = new VideoSessionLifecycle(
    {
      doc,
      locateVideoElement: findVideoElement
    },
    {
      onUrlChange: handleUrlChange,
      onVideoElementChange: handleVideoElementChange
    }
  );
  const exporter = new VideoSessionExporter(dependencies.videoRepository);
  const platformController = new VideoSessionPlatformController({
    doc,
    storage: dependencies.storage.local,
    state,
    createPlatformContext,
    onAdapterChange: (adapter) => fragmentHighlightCoordinator.updateAdapter(adapter),
    ensureCaptureHighlight
  });
  const dom = new VideoSessionDomController(doc, dependencies.viewFactory, hintManager);

  return {
    fragmentHighlighter,
    hintManager,
    pendingSelection,
    shadowSelectionBridge,
    fragmentHighlightCoordinator,
    selectionCaptureController,
    fragmentSelectionController,
    lifecycle,
    exporter,
    platformController,
    dom
  };
}
