import { isAppError } from '../../shared/errors';
import { queueNextClipAnalyticsSource } from './clipFlow';
import type { ClipAnalyticsSource } from './clipFlowTypes';
import type {
  LocalVaultPermissionPromptMessage,
  LocalVaultPermissionPromptResponse
} from '../../shared/types';
import type { MessagePayload, MessagingService } from '../../platform/interfaces/messaging';
import type { ActiveSelectionInfo, SelectionSnapshot } from './contentSelectionTracker';
import { hasUsableSelection } from './selectionSnapshot';
import type { SupportPromptMessage, SupportPromptOptions } from './contentMessageGuards';

export type ClipMode = 'full' | 'selection';

export interface SupportPromptLike {
  show(options?: SupportPromptOptions): Promise<void> | void;
}
export interface LocalVaultPermissionPromptLike {
  request(message: LocalVaultPermissionPromptMessage): Promise<LocalVaultPermissionPromptResponse>;
}
export type VideoSessionLike = { start(): Promise<void> };

export interface VideoSelectionController {
  handleVideoSelectionClip(document: Document, url: string, selection: Selection): Promise<void>;
  handleVideoSelectionClipFromData(
    document: Document,
    url: string,
    selectedHtml: string,
    selectedText: string
  ): Promise<void>;
}

export interface ContentMessageHandlerContext {
  document: Document;
  window: Window;
  messaging: Pick<MessagingService, 'send'>;
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

export function showSupportPrompt(
  supportPrompt: SupportPromptLike,
  message: SupportPromptMessage
): void {
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
}

export function requestLocalVaultPermission(
  localVaultPermissionPrompt: LocalVaultPermissionPromptLike,
  message: LocalVaultPermissionPromptMessage
): Promise<MessagePayload> {
  return localVaultPermissionPrompt.request(message) as unknown as Promise<MessagePayload>;
}

export function handleContentAction(
  context: ContentMessageHandlerContext,
  message: Record<string, unknown>
): MessagePayload | Promise<MessagePayload> | void {
  const action = message.action as string | undefined;
  if (!action) {
    return;
  }

  if (action === 'startVideoMode') {
    return startVideoMode(context);
  }
  if (action === 'clipSelection') {
    queueNextClipAnalyticsSource(deriveClipAnalyticsSource(message) ?? 'unknown');
    context.setClipMode('selection');
    context.runClip();
    return createSuccessPayload();
  }
  if (action === 'videoClipSelection') {
    return handleVideoClipSelection(context, message);
  }
  if (action === 'videoClipSelectionFromFrame') {
    return handleVideoClipSelectionFromFrame(context, message);
  }
  if (action === 'clipFull') {
    if (context.window !== context.window.top) {
      return createFailurePayload('Ignored in child frame', { ignored: true });
    }
    queueNextClipAnalyticsSource(deriveClipAnalyticsSource(message) ?? 'unknown');
    context.setClipMode('full');
    context.runClip();
    return createSuccessPayload();
  }
  return;
}

const CLIP_ANALYTICS_SOURCES = new Set<ClipAnalyticsSource>([
  'menu',
  'toolbar',
  'shortcut',
  'unknown'
]);

export function deriveClipAnalyticsSource(
  message: Record<string, unknown>
): ClipAnalyticsSource | null {
  const action = message.action;
  if (action !== 'clipFull' && action !== 'clipSelection') {
    return null;
  }

  const explicitSource = message.analyticsSource;
  if (
    typeof explicitSource === 'string' &&
    CLIP_ANALYTICS_SOURCES.has(explicitSource as ClipAnalyticsSource)
  ) {
    return explicitSource as ClipAnalyticsSource;
  }

  if (typeof message.tabId === 'number' || typeof message.frameId === 'number') {
    return 'menu';
  }

  if (action === 'clipFull') {
    return 'toolbar';
  }

  return 'unknown';
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

function startVideoMode(
  context: ContentMessageHandlerContext
): Promise<MessagePayload> | MessagePayload {
  if (context.isVideoSessionActive() && context.getVideoSession()) {
    return createSuccessPayload({ alreadyActive: true });
  }
  const session = context.createVideoSession();
  return session
    .start()
    .then(() => createSuccessPayload())
    .catch((error: unknown) => {
      console.error('[content] startVideoMode:', error);
      const messageText = error instanceof Error ? error.message : String(error);
      return createFailurePayload(messageText);
    });
}

function handleVideoClipSelection(
  context: ContentMessageHandlerContext,
  message: Record<string, unknown>
): Promise<MessagePayload> | MessagePayload {
  const { document, window, messaging, selectionController } = context;
  if (window !== window.top && typeof message.frameId === 'number') {
    const selection = window.getSelection();
    if (!selection || !hasUsableSelection(selection)) {
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
        payload: { selectedHtml, selectedText, sourceUrl: location.href }
      })
      .catch(() => undefined);

    selection.removeAllRanges();
    return createSuccessPayload({ forwarded: true });
  }

  let selectionInfo = context.resolveActiveSelection();
  if (
    (!selectionInfo || !hasUsableSelection(selectionInfo.selection)) &&
    context.getLastSelectionSnapshot()
  ) {
    selectionInfo = context.restoreSelectionFromSnapshot(context.getLastSelectionSnapshot());
  }
  if (!selectionInfo || !hasUsableSelection(selectionInfo.selection)) {
    return createFailurePayload('No text selected');
  }
  return selectionController
    .handleVideoSelectionClip(document, location.href, selectionInfo.selection)
    .then(() => {
      context.clearLastSelectionSnapshot();
      return createSuccessPayload();
    })
    .catch((error: unknown) => {
      console.error('[content] videoSelection:', error);
      const messageText = error instanceof Error ? error.message : String(error);
      return createFailurePayload(messageText);
    });
}

function handleVideoClipSelectionFromFrame(
  context: ContentMessageHandlerContext,
  message: Record<string, unknown>
): Promise<MessagePayload> {
  const payload = message.payload as Record<string, unknown> | undefined;
  const selectedHtml = typeof payload?.selectedHtml === 'string' ? payload.selectedHtml : '';
  const selectedText = typeof payload?.selectedText === 'string' ? payload.selectedText : '';
  return context.selectionController
    .handleVideoSelectionClipFromData(context.document, location.href, selectedHtml, selectedText)
    .then(() => createSuccessPayload())
    .catch((error: unknown) => {
      console.error('[content] frameVideoSelection:', error);
      const messageText = error instanceof Error ? error.message : String(error);
      return createFailurePayload(messageText);
    });
}
