import type { AppError } from '../../shared/errors';
import { extractionErrors, getErrorHandler, normalizeToAppError } from '../../shared/errors';
import type { MessagingService } from '../../platform/interfaces/messaging';
import type { ExtractionResult } from '../../shared/types/extraction';
import type { ContentRuntimeState } from './contentRuntimeState';
import type { ContentSelectionTracker } from './contentSelectionTracker';
import type { SelectionController } from '../clipper/services/selectionController';
import type { ExtractorRegistryApi } from '../extractors/registry';
import type { SupportProgressReporter } from './supportProgress';

interface ClipPayloadLike {
  markdown?: string;
  type?: string;
}

export interface CreateContentClipOrchestratorOptions {
  document: Document;
  messaging: Pick<MessagingService, 'send'>;
  runtimeState: ContentRuntimeState;
  selectionTracker: ContentSelectionTracker;
  selectionController: SelectionController;
  extractorRegistry: Pick<ExtractorRegistryApi, 'extract'>;
  isVideoSessionActive: (doc: Document) => boolean;
  showSupportProgress?: SupportProgressReporter;
}

export interface ContentClipOrchestrator {
  runClip(): Promise<void>;
}

export function createContentClipOrchestrator(
  options: CreateContentClipOrchestratorOptions
): ContentClipOrchestrator {
  const {
    document,
    messaging,
    runtimeState,
    selectionTracker,
    selectionController,
    extractorRegistry,
    isVideoSessionActive,
    showSupportProgress
  } = options;

  async function emitClipError(error: AppError): Promise<void> {
    const errorHandler = getErrorHandler();
    await errorHandler.handle(error, { suppressNotifications: true });

    try {
      await messaging.send({ type: 'CLIP_ERROR', error });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      const contextInput: { url: string; type?: string } = {
        url: location.href
      };

      const errorType = error.context?.type as string | undefined;
      if (errorType !== undefined) {
        contextInput.type = errorType;
      }

      const dispatchError = extractionErrors.dispatchFailure(message, contextInput);
      const dispatchErrorHandler = getErrorHandler();
      await dispatchErrorHandler.handle(dispatchError, { suppressNotifications: true });
    }
  }

  async function dispatchClipResult(url: string, result: ClipPayloadLike): Promise<void> {
    if (!result.markdown) {
      const noMarkdownContext: { url: string; type?: string } = { url };

      const resultType = result.type;
      if (resultType !== undefined) {
        noMarkdownContext.type = resultType;
      }

      throw extractionErrors.noMarkdown(noMarkdownContext);
    }

    try {
      await messaging.send({ type: 'CLIP_RESULT', payload: result });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      const dispatchContext: { url: string; type?: string } = { url };

      const resultType = result.type;
      if (resultType !== undefined) {
        dispatchContext.type = resultType;
      }

      throw extractionErrors.dispatchFailure(message, dispatchContext);
    }
  }

  async function resolveSelectionClip(url: string): Promise<ClipPayloadLike | null> {
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

    if (isVideoSessionActive(document)) {
      await selectionController.handleVideoSelectionClip(document, url, selection);
      runtimeState.setClipMode('full');
      runtimeState.setLastSelectionSnapshot(null);
      return null;
    }

    const clip = await selectionController.handleSelectionClip(document, url, selection);
    runtimeState.setClipMode('full');
    runtimeState.setLastSelectionSnapshot(null);
    return clip;
  }

  async function resolveFullPageClip(url: string): Promise<ExtractionResult> {
    return extractorRegistry.extract({ url, document });
  }

  async function runClip(): Promise<void> {
    const url = location.href;
    const clipMode = runtimeState.getClipMode();
    if (clipMode !== 'selection') {
      showSupportProgress?.({
        value: 8,
        message: {
          key: 'supportProgressPreparingPageClip',
          fallback: 'Preparing page clip'
        }
      });
    }

    try {
      const result =
        clipMode === 'selection' ? await resolveSelectionClip(url) : await resolveFullPageClip(url);

      if (!result) {
        return;
      }
      if (clipMode === 'selection') {
        showSupportProgress?.({
          value: 16,
          message: {
            key: 'supportProgressPreparingSelectionClip',
            fallback: 'Preparing selection clip'
          }
        });
      }

      await dispatchClipResult(url, result);
    } catch (error) {
      const appError = normalizeToAppError(error, {
        code: 'CONTENT_CLIP_FAILURE',
        domain: 'content',
        defaultMessage: 'Clip failed due to an unexpected error.',
        context: {
          url,
          mode: clipMode
        }
      });
      await emitClipError(appError);
    }
  }

  return {
    runClip
  };
}
