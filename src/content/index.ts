import { createSelectionController } from './clipper/services/selectionController';
import { createClipperDialogPromptGateway } from './clipper/presentation/clipperDialogPrompt';
import { getPlatformServices } from '../platform';
import { bootstrapContentScript, configureContentBootstrapStorage } from './bootstrap';
import {
  getVideoSession,
  isReaderSessionActive,
  isVideoSessionActive,
  markContentRuntimeInitialized
} from './runtime/contentSessionRegistry';
import { createContentRuntimeState } from './runtime/contentRuntimeState';
import { createContentMessageRouter } from './runtime/contentMessageRouter';
import { createContentSelectionTracker } from './runtime/contentSelectionTracker';
import { createContentRuntime } from './runtime/bootstrapRuntime';
import {
  createLazyExtractorRegistry,
  createLazyLocalVaultPermissionPrompt,
  createLazyReaderSessionFactory,
  createLazySupportPrompt,
  createLazyVideoSessionFactory,
  isVideoPromptCandidateUrl,
  initializeVideoPromptOnDemand
} from './runtime/contentLazyRuntime';
import { startSessionDraftAutoRestore } from './runtime/sessionDraftAutoRestore';
import { resolveRepository } from '../shared/di/serviceRegistry';
import { registerRepositories } from '../shared/di/serviceRegistry';
import { DI_TOKENS } from '../shared/di/tokens';
import type { IOptionsRepository } from '../shared/repositories/IOptionsRepository';
import { startRuntimeThemeSync } from './stitch/runtimeTheme';
import type { SupportProgressUpdate } from './runtime/supportProgress';

if (markContentRuntimeInitialized(document)) {
  initializeClipperRuntime();
}

function initializeClipperRuntime(): void {
  const platform = getPlatformServices();
  registerRepositories({
    storage: platform.storage,
    messaging: platform.messaging,
    tabs: platform.tabs,
    runtime: platform.runtime
  });
  configureContentBootstrapStorage(platform.storage);
  bootstrapContentScript();
  const { messaging } = platform;
  const primaryOptionsRepository = resolveRepository<IOptionsRepository>(
    DI_TOKENS.IOptionsRepository
  );
  const runtimeState = createContentRuntimeState({
    optionsRepository: primaryOptionsRepository,
    window
  });
  const stopRuntimeThemeSync = startRuntimeThemeSync(primaryOptionsRepository, window);
  const clipPromptGateway = createClipperDialogPromptGateway();
  const supportPrompt = createLazySupportPrompt(document);
  const localVaultPermissionPrompt = createLazyLocalVaultPermissionPrompt({
    document,
    window,
    runtime: platform.runtime
  });
  const showSupportProgress = (progress: SupportProgressUpdate): void => {
    const variant = progress.variant ?? 'progress';
    const status = variant === 'progress' ? 'progress' : variant;
    void supportPrompt.show({
      status,
      progress: {
        ...progress,
        variant
      }
    });
  };
  const createReaderSession = createLazyReaderSessionFactory({
    document,
    optionsRepository: primaryOptionsRepository,
    storage: platform.storage,
    messaging: platform.messaging,
    runtime: platform.runtime,
    promptGateway: clipPromptGateway,
    showSupportProgress
  });
  const createVideoSession = createLazyVideoSessionFactory({
    document,
    optionsRepository: primaryOptionsRepository,
    storage: platform.storage,
    messaging: platform.messaging,
    runtime: platform.runtime,
    showSupportProgress
  });
  const selectionController = createSelectionController({
    prompt: clipPromptGateway,
    optionsRepository: primaryOptionsRepository,
    createReaderSession,
    createVideoSession
  });
  const extractorRegistry = createLazyExtractorRegistry(primaryOptionsRepository);
  const selectionTracker = createContentSelectionTracker({
    document,
    window,
    enablePlatformShadowSelection: /(^|\.)bilibili\.com$/i.test(window.location.hostname),
    getLastSelectionSnapshot: () => runtimeState.getLastSelectionSnapshot(),
    setLastSelectionSnapshot: (snapshot) => {
      runtimeState.setLastSelectionSnapshot(snapshot);
    }
  });
  void runtimeState.refreshFragmentConfig();
  void initializeVideoPromptOnDemand(
    {
      optionsRepository: primaryOptionsRepository,
      storage: platform.storage,
      runtime: platform.runtime,
      showSupportProgress
    },
    window.location.href
  );

  const runtime = createContentRuntime({
    document,
    window,
    messaging,
    runtimeState,
    selectionTracker,
    selectionController,
    extractorRegistry,
    showSupportProgress,
    createRouter: (runClip) =>
      createContentMessageRouter({
        document,
        window,
        messaging,
        supportPrompt,
        localVaultPermissionPrompt,
        setClipMode: (mode) => runtimeState.setClipMode(mode),
        runClip,
        selectionController,
        createVideoSession: () => createVideoSession(document),
        isVideoSessionActive: () => isVideoSessionActive(document),
        getVideoSession: () => getVideoSession<ReturnType<typeof createVideoSession>>(document),
        resolveActiveSelection: () => selectionTracker.resolveActiveSelection(),
        restoreSelectionFromSnapshot: (snapshot) =>
          selectionTracker.restoreSelectionFromSnapshot(snapshot),
        getLastSelectionSnapshot: () => runtimeState.getLastSelectionSnapshot(),
        clearLastSelectionSnapshot: () => runtimeState.setLastSelectionSnapshot(null)
      })
  });
  runtime.start();
  const stopSessionDraftAutoRestore = startSessionDraftAutoRestore({
    document,
    window,
    storage: platform.storage,
    currentUrl: () => window.location.href,
    createReaderSession: () => createReaderSession(document, window.location.href),
    createVideoSession: () => createVideoSession(document),
    isReaderSessionActive: () => isReaderSessionActive(document),
    isVideoSessionActive: () => isVideoSessionActive(document),
    isVideoCandidateUrl: isVideoPromptCandidateUrl
  });
  window.addEventListener(
    'pagehide',
    () => {
      stopSessionDraftAutoRestore();
      stopRuntimeThemeSync();
      runtime.stop();
    },
    { passive: true }
  );
}
