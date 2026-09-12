import { watchContentRuntimeConnection } from './runtime/contentRuntimeConnection';
import { createSelectionController } from './clipper/services/selectionController';
import { createClipperDialogPromptGateway } from './clipper/presentation/clipperDialogPrompt';
import { getPlatformServices } from '../platform';
import { bootstrapContentScript, configureContentBootstrapStorage } from './bootstrap';
import {
  getVideoSession,
  getReaderSession,
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
import { resolveRepository } from '../shared/di/serviceRegistry';
import { registerRepositories } from '../shared/di/serviceRegistry';
import { DI_TOKENS } from '../shared/di/tokens';
import type { IOptionsRepository } from '../shared/repositories/IOptionsRepository';
import { startRuntimeThemeSync } from './stitch/runtimeTheme';
import type { SupportProgressUpdate } from './runtime/supportProgress';
import { startLazyDraftRestore } from './runtime/sessionDraftAutoRestoreBootstrap';
import { createSessionDraftLeaseOwnerRegistry } from './sessionDrafts/sessionDraftLeaseOwnerRegistry';

if (markContentRuntimeInitialized(document)) {
  initializeClipperRuntime();
}

function initializeClipperRuntime(): void {
  const platform = getPlatformServices();
  const { storage, messaging, tabs, runtime: extensionRuntime } = platform;
  registerRepositories({
    storage,
    messaging,
    tabs,
    runtime: extensionRuntime
  });
  configureContentBootstrapStorage(storage);
  bootstrapContentScript();
  const primaryOptionsRepository = resolveRepository<IOptionsRepository>(
    DI_TOKENS.IOptionsRepository
  );
  const runtimeState = createContentRuntimeState({
    optionsRepository: primaryOptionsRepository,
    window
  });
  const sessionDraftLeaseOwners = createSessionDraftLeaseOwnerRegistry();
  const stopRuntimeThemeSync = startRuntimeThemeSync(primaryOptionsRepository, window);
  const clipPromptGateway = createClipperDialogPromptGateway();
  const supportPrompt = createLazySupportPrompt(document);
  const localVaultPermissionPrompt = createLazyLocalVaultPermissionPrompt({
    document,
    window,
    runtime: extensionRuntime
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
    storage,
    messaging,
    runtime: extensionRuntime,
    promptGateway: clipPromptGateway,
    sessionDraftLeaseOwners,
    showSupportProgress
  });
  const createVideoSession = createLazyVideoSessionFactory({
    document,
    optionsRepository: primaryOptionsRepository,
    storage,
    messaging,
    runtime: extensionRuntime,
    sessionDraftLeaseOwners,
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
      storage,
      messaging,
      runtime: extensionRuntime,
      sessionDraftLeaseOwners,
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
        clearLastSelectionSnapshot: () => runtimeState.setLastSelectionSnapshot(null),
        sessionDraftLeaseOwners
      })
  });
  runtime.start();
  const stopDraftRestore = startLazyDraftRestore(
    () => import('./runtime/sessionDraftAutoRestore'),
    {
      document,
      window,
      storage,
      currentUrl: () => window.location.href,
      createReaderSession: (claimedDraft, signal, onStartCommitted) =>
        createReaderSession(document, window.location.href, claimedDraft, signal, onStartCommitted),
      createVideoSession: (claimedDraft, signal, onStartCommitted) =>
        createVideoSession(document, claimedDraft, signal, onStartCommitted),
      isReaderSessionActive: () => isReaderSessionActive(document),
      isVideoSessionActive: () => isVideoSessionActive(document),
      isVideoCandidateUrl: isVideoPromptCandidateUrl
    },
    (error) => {
      console.warn('[content] Failed to start session draft auto-restore:', error);
    }
  );
  const stopConnectionWatch = watchContentRuntimeConnection({
    document,
    window,
    runtime: extensionRuntime,
    disconnect: () => {
      type Session = { suspendForReload?(): void };
      const actions = [
        () => getReaderSession<Session>(document)?.suspendForReload?.(),
        () => getVideoSession<Session>(document)?.suspendForReload?.(),
        stopDraftRestore,
        () => sessionDraftLeaseOwners.clear(),
        stopRuntimeThemeSync,
        () => runtime.stop()
      ];
      for (const action of actions) {
        try {
          action();
        } catch {
          /* The old API is unavailable. */
        }
      }
    }
  });
  window.addEventListener(
    'pagehide',
    () => {
      stopConnectionWatch();
      stopDraftRestore();
      sessionDraftLeaseOwners.clear();
      stopRuntimeThemeSync();
      runtime.stop();
    },
    { passive: true }
  );
}
