import { normalizeToAppError } from '../../shared/errors';
import type { ClipFlowHandlers, ClipFlowResult, InitClipFlowOptions } from './clipFlowTypes';
import {
  handleAutoSelectionClip,
  handleModifierKey,
  handlePrimaryMouseDown,
  handleWindowBlur
} from './autoSelectionTrigger';

export type {
  ClipFlowHandlers,
  InitClipFlowOptions,
  VideoSelectionController
} from './clipFlowTypes';

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
