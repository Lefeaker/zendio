import type { MessagingService } from '../../platform/interfaces/messaging';
import type { ExtractorRegistryApi } from '../extractors/registry';
import type { SelectionController } from '../clipper/services/selectionController';
import type { ContentRuntimeState } from './contentRuntimeState';
import type { ContentSelectionTracker } from './contentSelectionTracker';
import type { ContentMessageRouter } from './contentMessageRouter';
import type { SupportPrompt } from '../ui/supportPrompt';
import { initClipFlow } from './clipFlow';
import { wireDomEvents } from './domEvents';
import { registerMessageRouter } from './messageRouter';

export interface CreateContentRuntimeOptions {
  document: Document;
  window: Window;
  messaging: MessagingService;
  runtimeState: ContentRuntimeState;
  selectionTracker: ContentSelectionTracker;
  selectionController: SelectionController;
  extractorRegistry: ExtractorRegistryApi;
  supportPrompt: SupportPrompt;
  createRouter: (runClip: () => void) => ContentMessageRouter;
}

export interface ContentRuntime {
  start(): void;
  stop(): void;
}

export function createContentRuntime(options: CreateContentRuntimeOptions): ContentRuntime {
  const { document, window, messaging, runtimeState, selectionTracker, selectionController, extractorRegistry, createRouter } = options;

  let domDisposer: { dispose(): void } | null = null;
  let messageDisposer: { dispose(): void } | null = null;

  return {
    start: () => {
      const clipFlow = initClipFlow({
        document,
        window,
        messaging,
        runtimeState,
        selectionTracker,
        selectionController,
        extractorRegistry
      });

      const router = createRouter(() => { void clipFlow.handleClip(); });
      messageDisposer = registerMessageRouter({ messaging, router });

      domDisposer = wireDomEvents({
        document,
        window,
        handlers: clipFlow
      });

      runtimeState.startOptionsLifecycle();
    },
    stop: () => {
      domDisposer?.dispose();
      messageDisposer?.dispose();
      runtimeState.stopOptionsLifecycle();
    }
  };
}
