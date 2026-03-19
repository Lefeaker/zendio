import type { AppError } from '../../shared/errors';
import { isSupportPromptMessage } from '../../shared/types';
import { isAppError } from '../../shared/errors';
import type { MessageListener, MessagePayload, MessagingService } from '../../platform/interfaces/messaging';
import type { VideoSession } from '../video/session';
import type { ActiveSelectionInfo, SelectionSnapshot } from './contentSelectionTracker';

type SupportPromptStatus = 'success' | 'failure' | 'warning';
type ClipMode = 'full' | 'selection';

interface SupportPromptOptions {
  vaultName?: string;
  status?: SupportPromptStatus;
  error?: AppError;
  errorMessage?: string;
}

interface SupportPromptLike {
  show(options?: SupportPromptOptions): Promise<void> | void;
}

interface VideoSelectionController {
  handleVideoSelectionClip(document: Document, url: string, selection: Selection): Promise<void>;
  handleVideoSelectionClipFromData(
    document: Document,
    url: string,
    selectedHtml: string,
    selectedText: string
  ): Promise<void>;
}

export interface CreateContentMessageRouterOptions {
  document: Document;
  window: Window;
  messaging: Pick<MessagingService, 'addListener' | 'send'>;
  supportPrompt: SupportPromptLike;
  setClipMode: (mode: ClipMode) => void;
  runClip: () => void;
  selectionController: VideoSelectionController;
  createVideoSession: () => VideoSession;
  isVideoSessionActive: () => boolean;
  getVideoSession: () => VideoSession | null;
  resolveActiveSelection: () => ActiveSelectionInfo | null;
  restoreSelectionFromSnapshot: (snapshot: SelectionSnapshot | null) => ActiveSelectionInfo | null;
  getLastSelectionSnapshot: () => SelectionSnapshot | null;
  clearLastSelectionSnapshot: () => void;
}

export interface ContentMessageRouter {
  attach(): () => void;
  handleMessage: MessageListener;
}

export function createContentMessageRouter(
  options: CreateContentMessageRouterOptions
): ContentMessageRouter {
  const {
    document,
    window,
    messaging,
    supportPrompt,
    setClipMode,
    runClip,
    selectionController,
    createVideoSession,
    isVideoSessionActive,
    getVideoSession,
    resolveActiveSelection,
    restoreSelectionFromSnapshot,
    getLastSelectionSnapshot,
    clearLastSelectionSnapshot
  } = options;

  const handleMessage: MessageListener = (rawMessage) => {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return;
    }

    if (isSupportPromptMessage(rawMessage)) {
      const message = rawMessage;
      const status = message.status;
      const rawError = message.error;
      const error = isAppError(rawError) ? rawError : undefined;
      const errorMessage = message.errorMessage;
      const supportPromptOptions: SupportPromptOptions = {};

      const vaultName = message.vaultName;
      if (vaultName !== undefined) {
        supportPromptOptions.vaultName = vaultName;
      }
      if (status !== undefined) {
        supportPromptOptions.status = status;
      }
      if (error !== undefined) {
        supportPromptOptions.error = error;
      }
      if (errorMessage !== undefined) {
        supportPromptOptions.errorMessage = errorMessage;
      }

      void supportPrompt.show(supportPromptOptions);
      return;
    }

    const message = rawMessage as Record<string, unknown>;
    const action = message.action as string | undefined;
    if (!action) {
      return;
    }

    if (action === 'startVideoMode') {
      if (isVideoSessionActive() && getVideoSession()) {
        return { success: true, alreadyActive: true } satisfies MessagePayload;
      }
      const session = createVideoSession();
      return session.start()
        .then(() => ({ success: true }))
        .catch((error: unknown) => {
          console.error('[content] Failed to start video mode:', error);
          const messageText = error instanceof Error ? error.message : String(error);
          return { success: false, error: messageText };
        });
    }

    if (action === 'clipSelection') {
      setClipMode('selection');
      runClip();
      return { success: true } satisfies MessagePayload;
    }

    if (action === 'videoClipSelection') {
      if (window !== window.top && typeof message.frameId === 'number') {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          return { success: false, error: 'No text selected' } satisfies MessagePayload;
        }

        const range = selection.getRangeAt(0).cloneRange();
        const container = document.createElement('div');
        container.appendChild(range.cloneContents());
        const selectedHtml = container.innerHTML;
        const selectedText = selection.toString();

        void messaging.send({
          type: 'AIIOB_FORWARD_VIDEO_SELECTION',
          payload: {
            selectedHtml,
            selectedText,
            sourceUrl: location.href
          }
        }).catch(() => undefined);

        selection.removeAllRanges();
        return { success: true, forwarded: true } satisfies MessagePayload;
      }

      let selectionInfo = resolveActiveSelection();
      if ((!selectionInfo || selectionInfo.selection.rangeCount === 0 || selectionInfo.selection.isCollapsed) && getLastSelectionSnapshot()) {
        selectionInfo = restoreSelectionFromSnapshot(getLastSelectionSnapshot());
      }
      if (!selectionInfo || selectionInfo.selection.rangeCount === 0 || selectionInfo.selection.isCollapsed) {
        return { success: false, error: 'No text selected' } satisfies MessagePayload;
      }
      return selectionController.handleVideoSelectionClip(document, location.href, selectionInfo.selection)
        .then(() => {
          clearLastSelectionSnapshot();
          return { success: true } as const;
        })
        .catch((error: unknown) => {
          console.error('[content] Video selection clip failed:', error);
          const messageText = error instanceof Error ? error.message : String(error);
          return { success: false, error: messageText };
        });
    }

    if (action === 'videoClipSelectionFromFrame') {
      const payload = message.payload as Record<string, unknown> | undefined;
      const selectedHtml = typeof payload?.selectedHtml === 'string' ? payload.selectedHtml : '';
      const selectedText = typeof payload?.selectedText === 'string' ? payload.selectedText : '';
      return selectionController.handleVideoSelectionClipFromData(document, location.href, selectedHtml, selectedText)
        .then(() => ({ success: true }))
        .catch((error: unknown) => {
          console.error('[content] Remote video selection clip failed:', error);
          const messageText = error instanceof Error ? error.message : String(error);
          return { success: false, error: messageText };
        });
    }

    if (action === 'clipFull') {
      if (window !== window.top) {
        return { success: false, ignored: true } satisfies MessagePayload;
      }
      setClipMode('full');
      runClip();
      return { success: true } satisfies MessagePayload;
    }

    return;
  };

  return {
    attach: () => messaging.addListener(handleMessage),
    handleMessage
  };
}
