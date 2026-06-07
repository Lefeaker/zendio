import { normalizeToAppError } from '../../shared/errors';
import type { ClipAnalyticsSession } from './clipFlowAnalytics';
import type {
  ClipAnalyticsSource,
  ClipFlowHandlers,
  ClipFlowResult,
  InitClipFlowOptions
} from './clipFlowTypes';
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

let queuedClipAnalyticsSource: ClipAnalyticsSource | null = null;

export function queueNextClipAnalyticsSource(source: ClipAnalyticsSource): void {
  queuedClipAnalyticsSource = source;
}

export function initClipFlow(options: InitClipFlowOptions): ClipFlowHandlers {
  const {
    document: doc,
    messaging,
    runtimeState,
    selectionTracker,
    selectionController,
    extractorRegistry,
    showSupportProgress
  } = options;

  async function handleClip(): Promise<void> {
    const url = location.href;
    const clipMode = runtimeState.getClipMode();
    const source = queuedClipAnalyticsSource ?? 'unknown';
    queuedClipAnalyticsSource = null;
    let analytics: ClipAnalyticsSession | undefined;
    try {
      const { createClipAnalyticsSession } = await import('./clipFlowAnalytics');
      analytics = createClipAnalyticsSession({ clipMode, document: doc, messaging, source, url });
    } catch {
      // Analytics must not block clipping if the lazy telemetry chunk cannot load.
    }
    if (clipMode !== 'selection') {
      showSupportProgress?.({
        value: 8,
        label: '正在准备网页剪藏'
      });
    }
    analytics?.emitStarted();

    try {
      let result: ClipFlowResult | undefined;

      if (clipMode === 'selection') {
        const { prepareSelectionClip } = await import('./clipFlowSelection');
        const promptLifecycle = analytics?.createSelectionPromptLifecycle();
        result = await prepareSelectionClip(
          doc,
          url,
          runtimeState,
          selectionTracker,
          selectionController,
          showSupportProgress,
          promptLifecycle
        );
        if (!result) {
          return;
        }
      } else {
        result = await extractorRegistry.extract({ url, document: doc });
      }

      analytics?.emitExtractionCompleted(result);

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
      handleAutoSelectionClip(
        doc,
        runtimeState,
        selectionTracker,
        () => {
          queueNextClipAnalyticsSource(
            runtimeState.isSelectionModifierActive() ? 'shortcut' : 'unknown'
          );
          return handleClip();
        },
        event
      ),
    handleModifierKey: (event) => handleModifierKey(runtimeState, event),
    handleWindowBlur: () => handleWindowBlur(runtimeState),
    handlePrimaryMouseDown: (event) => handlePrimaryMouseDown(runtimeState, event),
    handleSelectionChange,
    handleSelectStart
  };
}
