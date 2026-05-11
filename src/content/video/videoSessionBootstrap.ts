import { ensureContentI18n } from '../i18n/context';
import type { ReaderHighlightTheme } from '../../shared/types/options';
import type { VideoSessionState } from './sessionState';
import type { VideoSessionDependencies } from './sessionTypes';
import type { VideoSessionDomController, VideoSessionDomListenerHandlers } from './sessionDom';
import type { VideoSessionMessages } from './sessionMessages';
import type { VideoSessionLifecycle } from './sessionLifecycle';
import type { VideoSessionPlatformController } from './sessionPlatformController';
import type { VideoSessionOperationContext } from './sessionOperations';
import type { FragmentHighlightCoordinator } from './fragmentHighlightCoordinator';
import type { SelectionCaptureController } from './selectionCaptureController';
import type { VideoHintState } from './videoHintManager';
import type { VideoPanelCallbacks } from './application/videoPanelModel';
import {
  loadVideoSessionFragmentConfig,
  loadVideoSessionMessages,
  watchVideoSessionLanguage
} from './sessionLocalization';
import { watchVideoSessionHighlightTheme } from './sessionOperations';

export async function initializeVideoSessionEnvironment(args: {
  doc: Document;
  state: VideoSessionState;
  dependencies: VideoSessionDependencies;
  dom: VideoSessionDomController;
  interactionHandlers: VideoSessionDomListenerHandlers;
  selectionCaptureController: SelectionCaptureController;
  fragmentHighlightCoordinator: FragmentHighlightCoordinator;
  refreshHint: () => void;
  updateMessages: (messages: VideoSessionMessages) => void;
  updatePanelTexts: (messages: VideoSessionMessages['panel']) => void;
}): Promise<void> {
  args.state.controller = await ensureContentI18n(args.doc);
  args.state.controller.registerDynamic(() => {
    void refreshVideoSessionMessages(args.updateMessages, args.updatePanelTexts, args.refreshHint);
  });
  await refreshVideoSessionMessages(args.updateMessages, args.updatePanelTexts, args.refreshHint);
  args.state.stopLanguageWatcher?.();
  args.state.stopLanguageWatcher = watchVideoSessionLanguage(args.dependencies.storage, () => {
    void refreshVideoSessionMessages(args.updateMessages, args.updatePanelTexts, args.refreshHint);
  });
  args.state.fragmentConfig = await loadVideoSessionFragmentConfig(
    args.dependencies.optionsRepository
  );
  args.dom.registerInteractionHandlers(args.interactionHandlers);
  args.selectionCaptureController.start();
}

export async function finalizeVideoSessionStart(args: {
  state: VideoSessionState;
  dom: VideoSessionDomController;
  messages: VideoSessionMessages;
  initialCollapsed?: boolean;
  platformController: VideoSessionPlatformController;
  lifecycle: VideoSessionLifecycle;
  operationContext: VideoSessionOperationContext;
  fragmentHighlightCoordinator: FragmentHighlightCoordinator;
  highlightThemePromise: Promise<ReaderHighlightTheme>;
  panelCallbacks: VideoPanelCallbacks;
  applyHighlightTheme: (theme: ReaderHighlightTheme) => void;
  applyHint: (state: VideoHintState) => void;
  refreshContext: () => Promise<void>;
}): Promise<void> {
  const highlightTheme = await args.highlightThemePromise;

  args.state.highlightTheme = highlightTheme;
  args.applyHighlightTheme(args.state.highlightTheme);
  args.dom.mountPanel(args.panelCallbacks, args.messages.panel, {
    initialCollapsed: Boolean(args.initialCollapsed)
  });
  args.applyHint('noVideo');

  args.platformController.updateVideoContext();
  args.platformController.syncPlatformAdapter();
  args.state.videoTitle = args.platformController.extractVideoTitle();
  await args.refreshContext();

  args.lifecycle.start();

  watchVideoSessionHighlightTheme(args.operationContext, (theme) =>
    args.applyHighlightTheme(theme)
  );

  args.fragmentHighlightCoordinator.ensureStartedForFragments();
  if (args.state.captures.some((capture) => capture.kind === 'fragment')) {
    args.fragmentHighlightCoordinator.scheduleRestore();
  }

  console.info('[VideoSession] Panel mounted and session ready.');
}

async function refreshVideoSessionMessages(
  updateMessages: (messages: VideoSessionMessages) => void,
  updatePanelTexts: (messages: VideoSessionMessages['panel']) => void,
  refreshHint: () => void
): Promise<void> {
  const messages = await loadVideoSessionMessages(updatePanelTexts, refreshHint);
  updateMessages(messages);
}
