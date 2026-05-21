import { normalizeToAppError } from '../../shared/errors';
import type { ContentRuntimeState } from './contentRuntimeState';
import type { ContentSelectionTracker } from './contentSelectionTracker';
import type { MessagingService } from '../../platform/interfaces/messaging';
import type { ExtractorRegistryApi } from '../extractors/registry';
import type { SupportProgressReporter } from './supportProgress';
import type { ClipFlowResult } from './clipFlowDispatch';
import {
  handleAutoSelectionClip,
  handleModifierKey,
  handlePrimaryMouseDown,
  handleWindowBlur
} from './autoSelectionTrigger';

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
    messaging,
    runtimeState,
    selectionTracker,
    selectionController,
    extractorRegistry,
    showSupportProgress
  } = options;

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
      let result: ClipFlowResult | undefined;

      if (clipMode === 'selection') {
        const { prepareSelectionClip } = await import('./clipFlowSelection');
        result = await prepareSelectionClip(
          doc,
          url,
          runtimeState,
          selectionTracker,
          selectionController,
          showSupportProgress
        );
        if (!result) {
          return;
        }
      } else {
        result = await extractorRegistry.extract({ url, document: doc });
      }

      const { sendClipResult } = await import('./clipFlowDispatch');
      await sendClipResult(messaging, result, url);
    } catch (error) {
      const appError = normalizeToAppError(error, {
        code: 'CONTENT_CLIP_FAILURE',
        domain: 'content',
        defaultMessage: 'Clip failed unexpectedly.',
        context: { url, mode: clipMode }
      });
      const { emitClipError } = await import('./clipFlowDispatch');
      await emitClipError(messaging, appError);
    }
  }

  const handleSelectionChange = (): void => {
    selectionTracker.handleSelectionChange();
  };

  const handleSelectStart = (_event: Event): void => {
    selectionTracker.handleSelectStart();
  };

  return {
    handleClip,
    handleAutoSelectionClip: (event) =>
      handleAutoSelectionClip(document, runtimeState, selectionTracker, handleClip, event),
    handleModifierKey: (event) => handleModifierKey(runtimeState, event),
    handleWindowBlur: () => handleWindowBlur(runtimeState),
    handlePrimaryMouseDown: (event) => handlePrimaryMouseDown(runtimeState, event),
    handleSelectionChange,
    handleSelectStart
  };
}
