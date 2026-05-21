import {
  getErrorHandler,
  extractionErrors,
  normalizeToAppError,
  type AppError
} from '../../shared/errors';
import {
  shouldTriggerSelectionWithModifiers,
  syncModifierState
} from '../clipper/services/fragmentConfig';
import type { ContentRuntimeState } from './contentRuntimeState';
import type { ContentSelectionTracker, SelectionSnapshot } from './contentSelectionTracker';
import type { MessagePayload, MessagingService } from '../../platform/interfaces/messaging';
import type { ExtractorRegistryApi } from '../extractors/registry';
import { isReaderSessionActive, isVideoSessionActive } from './contentSessionRegistry';
import type { SupportProgressReporter } from './supportProgress';

export interface VideoSelectionController {
  handleSelectionClip(
    document: Document,
    url: string,
    selection: Selection
  ): Promise<{ markdown?: string; type?: string } | null>;
  handleVideoSelectionClip(document: Document, url: string, selection: Selection): Promise<void>;
}

export interface InitClipFlowOptions {
  document: Document;
  window: Window;
  messaging: Pick<MessagingService, 'send'>;
  runtimeState: ContentRuntimeState;
  selectionTracker: ContentSelectionTracker;
  selectionController: VideoSelectionController;
  extractorRegistry: ExtractorRegistryApi;
  showSupportProgress?: SupportProgressReporter;
}

export interface ClipFlowHandlers {
  handleClip(): Promise<void>;
  handleAutoSelectionClip(event: MouseEvent): void;
  handleModifierKey(event: KeyboardEvent): void;
  handleWindowBlur(): void;
  handlePrimaryMouseDown(event: MouseEvent): void;
  handleSelectionChange(): void;
  handleSelectStart(event: Event): void;
}

export function initClipFlow(options: InitClipFlowOptions): ClipFlowHandlers {
  const {
    document,
    window,
    messaging,
    runtimeState,
    selectionTracker,
    selectionController,
    extractorRegistry,
    showSupportProgress
  } = options;

  async function emitClipError(error: AppError): Promise<void> {
    const errorHandler = getErrorHandler();
    await errorHandler.handle(error, { suppressNotifications: true });

    try {
      await messaging.send({ type: 'CLIP_ERROR', error });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      const contextInput: { url: string; type?: string } = { url: location.href };
      const errorType = error.context?.type as string | undefined;
      if (errorType !== undefined) {
        contextInput.type = errorType;
      }
      const dispatchError = extractionErrors.dispatchFailure(message, contextInput);
      const handler = getErrorHandler();
      await handler.handle(dispatchError, { suppressNotifications: true });
    }
  }

  async function handleClip(): Promise<void> {
    const url = location.href;
    const doc = document;
    const clipMode = runtimeState.getClipMode();
    if (clipMode !== 'selection') {
      showSupportProgress?.({
        value: 8,
        label: '正在准备网页剪藏'
      });
    }
    try {
      let result: { markdown?: string; type?: string } | undefined;

      if (clipMode === 'selection') {
        let selectionInfo = selectionTracker.resolveActiveSelection();
        if (
          (!selectionInfo ||
            selectionInfo.selection.rangeCount === 0 ||
            selectionInfo.selection.isCollapsed) &&
          runtimeState.getLastSelectionSnapshot()
        ) {
          selectionInfo = selectionTracker.restoreSelectionFromSnapshot(
            runtimeState.getLastSelectionSnapshot()
          );
        }

        const selection = selectionInfo?.selection ?? null;

        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          throw extractionErrors.noSelection({
            url,
            type: 'selection',
            selectionLength: selection ? selection.toString().length : 0
          });
        }

        if (isVideoSessionActive(doc)) {
          await selectionController.handleVideoSelectionClip(doc, url, selection);
          runtimeState.setClipMode('full');
          runtimeState.setLastSelectionSnapshot(null);
          return;
        }

        const clip = await selectionController.handleSelectionClip(doc, url, selection);
        runtimeState.setClipMode('full');
        runtimeState.setLastSelectionSnapshot(null);
        if (!clip) {
          return;
        }
        showSupportProgress?.({
          value: 16,
          label: '正在发送选区剪藏'
        });
        result = clip;
      } else {
        result = await extractorRegistry.extract({ url, document: doc });
      }

      if (!result || !result.markdown) {
        const noMarkdownContext: { url: string; type?: string } = { url };
        const resultType = result?.type;
        if (resultType !== undefined) {
          noMarkdownContext.type = resultType;
        }
        throw extractionErrors.noMarkdown(noMarkdownContext);
      }

      try {
        await messaging.send({ type: 'CLIP_RESULT', payload: result as MessagePayload });
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError);
        const dispatchContext: { url: string; type?: string } = { url };
        const resultType = result?.type;
        if (resultType !== undefined) {
          dispatchContext.type = resultType;
        }
        throw extractionErrors.dispatchFailure(message, dispatchContext);
      }
    } catch (error) {
      const appError = normalizeToAppError(error, {
        code: 'CONTENT_CLIP_FAILURE',
        domain: 'content',
        defaultMessage: 'Clip failed due to an unexpected error.',
        context: { url, mode: clipMode }
      });
      await emitClipError(appError);
    }
  }

  const handleModifierKey = (event: KeyboardEvent): void => {
    syncModifierState(runtimeState.getModifierState(), event);
  };

  const handleWindowBlur = (): void => {
    runtimeState.resetSelectionTracking();
  };

  const handlePrimaryMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) {
      runtimeState.setSelectionModifierActive(false);
      return;
    }
    syncModifierState(runtimeState.getModifierState(), event);
    const fragmentClipperConfig = runtimeState.getFragmentClipperConfig();
    if (!fragmentClipperConfig.selectionModifierEnabled) {
      runtimeState.setSelectionModifierActive(false);
      return;
    }
    runtimeState.setSelectionModifierActive(
      shouldTriggerSelectionWithModifiers(fragmentClipperConfig, runtimeState.getModifierState())
    );
  };

  const handleAutoSelectionClip = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }
    if (isReaderSessionActive(document)) {
      return;
    }
    syncModifierState(runtimeState.getModifierState(), event);
    const fragmentClipperConfig = runtimeState.getFragmentClipperConfig();
    const modifierRequired = fragmentClipperConfig.selectionModifierEnabled;
    const modifiersSatisfied =
      runtimeState.isSelectionModifierActive() ||
      shouldTriggerSelectionWithModifiers(fragmentClipperConfig, runtimeState.getModifierState());
    if (modifierRequired && !modifiersSatisfied) {
      runtimeState.setSelectionModifierActive(false);
      return;
    }

    const selectionInfo = selectionTracker.resolveActiveSelection();
    if (!selectionInfo) {
      runtimeState.setSelectionModifierActive(false);
      return;
    }

    const selection = selectionInfo.selection;
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      runtimeState.setSelectionModifierActive(false);
      return;
    }
    if (!selection.toString().trim()) {
      runtimeState.setSelectionModifierActive(false);
      return;
    }
    if (
      selectionTracker.isSelectionInsideUi(selection) ||
      selectionTracker.isSelectionEditable(selection)
    ) {
      runtimeState.setSelectionModifierActive(false);
      return;
    }
    if (runtimeState.getAutoSelectionInFlight()) {
      return;
    }

    runtimeState.setAutoSelectionInFlight(true);
    runtimeState.setClipMode('selection');
    void handleClip().finally(() => {
      runtimeState.setAutoSelectionInFlight(false);
      runtimeState.setSelectionModifierActive(false);
    });
  };

  const handleSelectionChange = (): void => {
    selectionTracker.handleSelectionChange();
  };

  const handleSelectStart = (_event: Event): void => {
    selectionTracker.handleSelectStart();
  };

  return {
    handleClip,
    handleAutoSelectionClip,
    handleModifierKey,
    handleWindowBlur,
    handlePrimaryMouseDown,
    handleSelectionChange,
    handleSelectStart
  };
}
