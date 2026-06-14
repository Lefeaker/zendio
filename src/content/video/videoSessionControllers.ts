import type { VideoPlatformContext } from './platforms';
import type { VideoFragmentCapture } from './types';
import type { VideoSessionDependencies } from './sessionTypes';
import { createSessionDraftPageKey } from '../sessionDrafts';
import type { ContentExportDestinationState } from '../shared/exportDestinationState';
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
import { VideoSessionDraftController } from './videoSessionDraftController';
import type { VideoHintState } from './videoHintManager';
import type { VideoCaptureScreenshot } from './types';
import type {
  VideoScreenshotCacheRepository,
  VideoScreenshotCacheSaveResult
} from './videoScreenshotCacheRepository';

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
  draftController: VideoSessionDraftController;
  persistPreparedScreenshot: (
    captureId: string,
    screenshot: VideoCaptureScreenshot
  ) => Promise<VideoScreenshotCacheSaveResult>;
}

const SCREENSHOT_CACHE_UNAVAILABLE_RESULT: VideoScreenshotCacheSaveResult = {
  status: 'skipped',
  reason: 'serialize-failed',
  error: 'Video screenshot cache repository is unavailable.'
};

function createUnavailableVideoScreenshotCacheRepository(): VideoScreenshotCacheRepository {
  return {
    save: async () => SCREENSHOT_CACHE_UNAVAILABLE_RESULT,
    load: async () => null,
    remove: async () => undefined,
    removeMany: async () => undefined,
    pruneExpired: async () => undefined,
    pruneToLimits: async () => undefined
  };
}

export function createVideoSessionControllers(args: {
  doc: Document;
  dependencies: VideoSessionDependencies;
  state: VideoSessionState;
  destinationState: Pick<ContentExportDestinationState, 'metadata' | 'applyMetadata'>;
  getMessages: () => VideoSessionMessages;
  applyHint: (state: VideoHintState) => void;
  readCleanupState: () => { isCleaningUp: boolean; shouldTrackSavingState: boolean };
  onDraftRestored?: () => void;
  onDraftScreenshotHydrated?: () => void;
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
    destinationState,
    getMessages,
    applyHint,
    readCleanupState,
    onDraftRestored,
    onDraftScreenshotHydrated,
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
  const shadowSelectionBridge = new ShadowSelectionBridge({
    suppressSelectionCapture: () => state.suppressSelectionCapture,
    getDocumentSelection,
    isRangeInsideUi,
    pendingSelection,
    activatePendingSelection: (event, options) =>
      selectionCaptureController.activatePendingSelection(event, options)
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
  // Production content sessions inject the background-owned client. No-messaging harnesses that
  // need durable screenshot cache behavior must inject a repository explicitly.
  const screenshotCache =
    dependencies.screenshotCacheRepository ?? createUnavailableVideoScreenshotCacheRepository();
  const persistPreparedScreenshot = (
    captureId: string,
    screenshot: VideoCaptureScreenshot
  ): Promise<VideoScreenshotCacheSaveResult> =>
    screenshotCache.save({
      pageKey: createSessionDraftPageKey('video', doc.location.href),
      captureId,
      screenshot
    });
  const dom = new VideoSessionDomController(doc, dependencies.viewFactory, hintManager);
  const draftController = new VideoSessionDraftController({
    doc,
    state,
    destinationState,
    storageArea: dependencies.storage.local,
    screenshotCache,
    dom,
    applyHint,
    onScreenshotHydrationChange: onDraftScreenshotHydrated,
    readCleanupState
  });
  const platformController = new VideoSessionPlatformController({
    doc,
    storage: dependencies.storage.local,
    state,
    createPlatformContext,
    onAdapterChange: (adapter) => fragmentHighlightCoordinator.updateAdapter(adapter),
    ensureCaptureHighlight,
    restoreDraftState: async () => {
      const restored = await draftController.restoreDraftState();
      if (restored) {
        onDraftRestored?.();
      }
      return restored;
    },
    onLegacyRestore: (storageKey) => draftController.handleLegacyRestore(storageKey)
  });

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
    dom,
    draftController,
    persistPreparedScreenshot
  };
}
