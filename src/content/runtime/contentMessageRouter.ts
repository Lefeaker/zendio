import type { MessageListener, MessagingService } from '../../platform/interfaces/messaging';
import type { ActiveSelectionInfo, SelectionSnapshot } from './contentSelectionTracker';
import {
  isLocalVaultPermissionPromptMessage,
  isSupportPromptMessage
} from './contentMessageGuards';
import {
  handleContentAction,
  requestLocalVaultPermission,
  showSupportPrompt,
  type ClipMode,
  type LocalVaultPermissionPromptLike,
  type SupportPromptLike,
  type VideoSelectionController,
  type VideoSessionLike
} from './contentMessageHandlers';
import {
  SessionDraftOwnerProbeRequestSchema,
  type SessionDraftOwnerProbeResponse
} from '../../shared/sessionDrafts';
import type { SessionDraftLeaseOwnerRegistry } from '../sessionDrafts/sessionDraftLeaseOwnerRegistry';

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
  sessionDraftLeaseOwners?: SessionDraftLeaseOwnerRegistry;
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

    const ownerProbe = SessionDraftOwnerProbeRequestSchema.safeParse(rawMessage);
    if (ownerProbe.success) {
      return {
        probeId: ownerProbe.data.probeId,
        active:
          options.sessionDraftLeaseOwners?.owns(ownerProbe.data.key, ownerProbe.data.leaseId) ===
          true
      } satisfies SessionDraftOwnerProbeResponse;
    }

    if (isSupportPromptMessage(rawMessage)) {
      showSupportPrompt(supportPrompt, rawMessage);
      return;
    }

    if (isLocalVaultPermissionPromptMessage(rawMessage)) {
      return requestLocalVaultPermission(localVaultPermissionPrompt, rawMessage);
    }

    return handleContentAction(
      {
        document,
        window,
        messaging,
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
      },
      rawMessage as Record<string, unknown>
    );
  };

  return {
    attach: () => messaging.addListener(handleMessage),
    handleMessage
  };
}
