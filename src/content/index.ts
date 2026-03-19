import { createSelectionController } from './clipper/services/selectionController';
import { createClipperDialogPromptGateway } from './clipper/presentation/clipperDialogPrompt';
import { VideoSession, initializeDefaultVideoSessionDependencies } from './video/session';
import { ReaderSession, initializeDefaultReaderSessionDependencies } from './reader/session';
import { SupportPrompt } from './ui/supportPrompt';
import { AppError } from '../shared/errors';
import { initVideoPrompt, initializeDefaultVideoPromptDependencies } from './video/prompt';
import { getPlatformServices } from '../platform';
import { ensureContentI18n } from './i18n/context';
import { createDefaultExtractorRegistry } from './extractors/registry';
import { bootstrapContentScript, configureContentBootstrapStorage } from './bootstrap';
import { getVideoSession, isReaderSessionActive, isVideoSessionActive, markContentRuntimeInitialized } from './runtime/contentSessionRegistry';
import { createContentRuntimeState } from './runtime/contentRuntimeState';
import { createContentMessageRouter } from './runtime/contentMessageRouter';
import { createContentSelectionTracker } from './runtime/contentSelectionTracker';
import { createContentRuntime } from './runtime/bootstrapRuntime';
import { resolveRepository } from '../shared/di/serviceRegistry';
import { DI_TOKENS } from '../shared/di/tokens';
import type { IOptionsRepository } from '../shared/repositories/IOptionsRepository';

if (markContentRuntimeInitialized(document)) {
  initializeClipperRuntime();
}

function initializeClipperRuntime(): void {
  // 引导内容脚本的依赖注入系统
  const platform = getPlatformServices();
  configureContentBootstrapStorage(platform.storage);
  bootstrapContentScript();
  const { messaging } = platform;
  const primaryOptionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);

  const videoSessionDependencies = initializeDefaultVideoSessionDependencies({
    optionsRepository: primaryOptionsRepository,
    storage: platform.storage
  });
  initializeDefaultReaderSessionDependencies({
    optionsRepository: primaryOptionsRepository,
    storage: platform.storage,
    messaging: platform.messaging
  });
  initializeDefaultVideoPromptDependencies({
    storage: platform.storage,
    runtime: platform.runtime
  });

  void ensureContentI18n(document);

  const supportPrompt = new SupportPrompt(document);
  const runtimeState = createContentRuntimeState({
    optionsRepository: primaryOptionsRepository,
    window
  });
  const clipPromptGateway = createClipperDialogPromptGateway();
  const selectionController = createSelectionController({
    prompt: clipPromptGateway,
    optionsRepository: primaryOptionsRepository,
    createReaderSession: (doc, url) => new ReaderSession(doc, url, clipPromptGateway),
    createVideoSession: (doc) => new VideoSession(doc, videoSessionDependencies)
  });
  const extractorRegistry = createDefaultExtractorRegistry({
    optionsRepository: primaryOptionsRepository
  });
  const selectionTracker = createContentSelectionTracker({
    document,
    window,
    getLastSelectionSnapshot: () => runtimeState.getLastSelectionSnapshot(),
    setLastSelectionSnapshot: (snapshot) => {
      runtimeState.setLastSelectionSnapshot(snapshot);
    }
  });
  // composition below moved to runtime/bootstrapRuntime

  void runtimeState.refreshFragmentConfig();
  void initVideoPrompt();

  const runtime = createContentRuntime({
    document,
    window,
    messaging,
    runtimeState,
    selectionTracker,
    selectionController,
    extractorRegistry,
    supportPrompt,
    createRouter: (runClip) => createContentMessageRouter({
      document,
      window,
      messaging,
      supportPrompt,
      setClipMode: (mode) => runtimeState.setClipMode(mode),
      runClip,
      selectionController,
      createVideoSession: () => new VideoSession(document, videoSessionDependencies),
      isVideoSessionActive: () => isVideoSessionActive(document),
      getVideoSession: () => getVideoSession<VideoSession>(),
      resolveActiveSelection: () => selectionTracker.resolveActiveSelection(),
      restoreSelectionFromSnapshot: (snapshot) => selectionTracker.restoreSelectionFromSnapshot(snapshot),
      getLastSelectionSnapshot: () => runtimeState.getLastSelectionSnapshot(),
      clearLastSelectionSnapshot: () => runtimeState.setLastSelectionSnapshot(null)
    })
  });
  runtime.start();
  window.addEventListener('pagehide', () => runtime.stop(), { passive: true });
}
