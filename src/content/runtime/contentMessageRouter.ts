import type { AppError } from '../../shared/errors';
import {
  isLocalVaultPermissionPromptMessage,
  isSupportPromptMessage,
  type LocalVaultPermissionPromptMessage,
  type LocalVaultPermissionPromptResponse
} from '../../shared/types';
import { isAppError } from '../../shared/errors';
import type {
  MessageListener,
  MessagePayload,
  MessagingService
} from '../../platform/interfaces/messaging';
import type { ActiveSelectionInfo, SelectionSnapshot } from './contentSelectionTracker';

type SupportPromptStatus = 'success' | 'failure' | 'warning' | 'progress';
type ClipMode = 'full' | 'selection';

interface SupportPromptOptions {
  vaultName?: string;
  status?: SupportPromptStatus;
  error?: AppError;
  errorMessage?: string;
  progress?: {
    value: number;
    label?: string;
    variant?: 'progress' | 'success' | 'failure' | 'warning';
  };
}

interface SupportPromptLike {
  show(options?: SupportPromptOptions): Promise<void> | void;
}

interface LocalVaultPermissionPromptLike {
  request(message: LocalVaultPermissionPromptMessage): Promise<LocalVaultPermissionPromptResponse>;
}

interface VideoSessionLike {
  start(): Promise<void>;
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
  localVaultPermissionPrompt: LocalVaultPermissionPromptLike;
  setClipMode: (mode: ClipMode) => void;
  runClip: () => void;
  selectionController: VideoSelectionController;
  createVideoSession: () => VideoSessionLike;
  isVideoSessionActive: () => boolean;
  getVideoSession: () => VideoSessionLike | null;
  resolveActiveSelection: () => ActiveSelectionInfo | null;
  restoreSelectionFromSnapshot: (snapshot: SelectionSnapshot | null) => ActiveSelectionInfo | null;
  getLastSelectionSnapshot: () => SelectionSnapshot | null;
  clearLastSelectionSnapshot: () => void;
}

export interface ContentMessageRouter {
  attach(): () => void;
  handleMessage: MessageListener;
}

function createSuccessPayload(extra: Record<string, MessagePayload> = {}): MessagePayload {
  return {
    success: true,
    ...extra
  };
}

function createFailurePayload(
  error: string,
  extra: Record<string, MessagePayload> = {}
): MessagePayload {
  return {
    success: false,
    error,
    ...extra
  };
}

export function createContentMessageRouter(
  options: CreateContentMessageRouterOptions
): ContentMessageRouter {
  const {
    document,
    window,
    messaging,
    supportPrompt,
    localVaultPermissionPrompt,
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
      const progress = message.progress;
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
      if (progress !== undefined) {
        supportPromptOptions.progress = progress;
      }

      void supportPrompt.show(supportPromptOptions);
      return;
    }

    if (isLocalVaultPermissionPromptMessage(rawMessage)) {
      return localVaultPermissionPrompt.request(rawMessage) as unknown as Promise<MessagePayload>;
    }

    const message = rawMessage as Record<string, unknown>;
    const action = message.action as string | undefined;
    if (!action) {
      return;
    }

    if (action === 'startVideoMode') {
      if (isVideoSessionActive() && getVideoSession()) {
        return createSuccessPayload({ alreadyActive: true });
      }
      const session = createVideoSession();
      return session
        .start()
        .then(() => createSuccessPayload())
        .catch((error: unknown) => {
          console.error('[content] Failed to start video mode:', error);
          const messageText = error instanceof Error ? error.message : String(error);
          return createFailurePayload(messageText);
        });
    }

    if (action === 'clipSelection') {
      setClipMode('selection');
      runClip();
      return createSuccessPayload();
    }

    if (action === 'videoClipSelection') {
      if (window !== window.top && typeof message.frameId === 'number') {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          return createFailurePayload('No text selected');
        }

        const range = selection.getRangeAt(0).cloneRange();
        const container = document.createElement('div');
        container.appendChild(range.cloneContents());
        const selectedHtml = container.innerHTML;
        const selectedText = selection.toString();

        void messaging
          .send({
            type: 'AIIOB_FORWARD_VIDEO_SELECTION',
            payload: {
              selectedHtml,
              selectedText,
              sourceUrl: location.href
            }
          })
          .catch(() => undefined);

        selection.removeAllRanges();
        return createSuccessPayload({ forwarded: true });
      }

      let selectionInfo = resolveActiveSelection();
      if (
        (!selectionInfo ||
          selectionInfo.selection.rangeCount === 0 ||
          selectionInfo.selection.isCollapsed) &&
        getLastSelectionSnapshot()
      ) {
        selectionInfo = restoreSelectionFromSnapshot(getLastSelectionSnapshot());
      }
      if (
        !selectionInfo ||
        selectionInfo.selection.rangeCount === 0 ||
        selectionInfo.selection.isCollapsed
      ) {
        return createFailurePayload('No text selected');
      }
      return selectionController
        .handleVideoSelectionClip(document, location.href, selectionInfo.selection)
        .then(() => {
          clearLastSelectionSnapshot();
          return createSuccessPayload();
        })
        .catch((error: unknown) => {
          console.error('[content] Video selection clip failed:', error);
          const messageText = error instanceof Error ? error.message : String(error);
          return createFailurePayload(messageText);
        });
    }

    if (action === 'videoClipSelectionFromFrame') {
      const payload = message.payload as Record<string, unknown> | undefined;
      const selectedHtml = typeof payload?.selectedHtml === 'string' ? payload.selectedHtml : '';
      const selectedText = typeof payload?.selectedText === 'string' ? payload.selectedText : '';
      return selectionController
        .handleVideoSelectionClipFromData(document, location.href, selectedHtml, selectedText)
        .then(() => createSuccessPayload())
        .catch((error: unknown) => {
          console.error('[content] Remote video selection clip failed:', error);
          const messageText = error instanceof Error ? error.message : String(error);
          return createFailurePayload(messageText);
        });
    }

    if (action === 'clipFull') {
      if (window !== window.top) {
        return createFailurePayload('Ignored in child frame', { ignored: true });
      }
      setClipMode('full');
      runClip();
      return createSuccessPayload();
    }

    return;
  };

  return {
    attach: () => messaging.addListener(handleMessage),
    handleMessage
  };
}
