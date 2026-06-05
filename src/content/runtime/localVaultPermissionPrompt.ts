import type { RuntimeService } from '../../platform/interfaces/runtime';
import type {
  LocalVaultPermissionPromptMessage,
  LocalVaultPermissionPromptResponse
} from '../../shared/types';

interface LocalVaultPermissionFrameMessage {
  type: 'AIIOB_LOCAL_VAULT_PERMISSION_RESULT';
  response: LocalVaultPermissionPromptResponse;
}

export interface LocalVaultPermissionPrompt {
  request(message: LocalVaultPermissionPromptMessage): Promise<LocalVaultPermissionPromptResponse>;
}

export function createLocalVaultPermissionPrompt(params: {
  document: Document;
  window: Window;
  runtime: Pick<RuntimeService, 'getURL'>;
}): LocalVaultPermissionPrompt {
  const { document, window, runtime } = params;
  let activeCleanup: (() => void) | null = null;

  function cleanupActive(): void {
    activeCleanup?.();
    activeCleanup = null;
  }

  function buildFrameUrl(message: LocalVaultPermissionPromptMessage): string {
    const url = new URL(runtime.getURL('local-vault-permission.html'));
    url.searchParams.set('folderId', message.folderId);
    if (message.folderName) {
      url.searchParams.set('folderName', message.folderName);
    }
    if (message.vaultName) {
      url.searchParams.set('vaultName', message.vaultName);
    }
    return url.href;
  }

  return {
    request(message): Promise<LocalVaultPermissionPromptResponse> {
      cleanupActive();

      return new Promise<LocalVaultPermissionPromptResponse>((resolve) => {
        const extensionOrigin = new URL(runtime.getURL('')).origin;
        const overlay = document.createElement('div');
        overlay.className = 'aiob-local-vault-permission-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText = [
          'position:fixed',
          'inset:0',
          'z-index:2147483647',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'padding:24px',
          'background:rgba(15,23,42,0.28)',
          'backdrop-filter:blur(2px)'
        ].join(';');

        const frame = document.createElement('iframe');
        frame.title = 'Zendio local vault permission';
        frame.src = buildFrameUrl(message);
        frame.style.cssText = [
          'width:min(420px,calc(100vw - 32px))',
          'height:264px',
          'border:0',
          'border-radius:16px',
          'box-shadow:0 24px 80px rgba(15,23,42,0.28)',
          'background:#fff'
        ].join(';');
        overlay.appendChild(frame);

        let settled = false;
        const settle = (response: LocalVaultPermissionPromptResponse): void => {
          if (settled) {
            return;
          }
          settled = true;
          cleanupActive();
          resolve(response);
        };

        const handleMessage = (event: MessageEvent): void => {
          if (event.origin !== extensionOrigin || event.source !== frame.contentWindow) {
            return;
          }
          const data = event.data as Partial<LocalVaultPermissionFrameMessage> | null;
          if (!data || data.type !== 'AIIOB_LOCAL_VAULT_PERMISSION_RESULT' || !data.response) {
            return;
          }
          settle(data.response);
        };

        const handleKeydown = (event: KeyboardEvent): void => {
          if (event.key === 'Escape') {
            settle({ action: 'cancelled' });
          }
        };

        const handlePointerDown = (event: PointerEvent): void => {
          if (event.target === overlay) {
            settle({ action: 'cancelled' });
          }
        };

        window.addEventListener('message', handleMessage);
        window.addEventListener('keydown', handleKeydown, true);
        overlay.addEventListener('pointerdown', handlePointerDown);
        document.documentElement.appendChild(overlay);

        activeCleanup = () => {
          window.removeEventListener('message', handleMessage);
          window.removeEventListener('keydown', handleKeydown, true);
          overlay.removeEventListener('pointerdown', handlePointerDown);
          overlay.remove();
        };
      });
    }
  };
}
