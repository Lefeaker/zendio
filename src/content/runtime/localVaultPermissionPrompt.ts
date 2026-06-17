import { DEFAULT_LANGUAGE, getMessagesForLanguage } from '@i18n';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type {
  LocalVaultPermissionPromptMessage,
  LocalVaultPermissionPromptResponse
} from '../../shared/types';
import { ensureContentI18n } from '../i18n/context';

interface LocalVaultPermissionFrameMessage {
  type: 'AIIOB_LOCAL_VAULT_PERMISSION_RESULT';
  response: LocalVaultPermissionPromptResponse;
}

interface LocalVaultPermissionPromptLocalization {
  language: string;
  title: string;
}

export interface LocalVaultPermissionPrompt {
  request(message: LocalVaultPermissionPromptMessage): Promise<LocalVaultPermissionPromptResponse>;
}

function isLocalVaultPermissionFrameMessage(
  data: object | null | undefined
): data is LocalVaultPermissionFrameMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    Reflect.get(data, 'type') === 'AIIOB_LOCAL_VAULT_PERMISSION_RESULT' &&
    typeof Reflect.get(data, 'response') === 'object' &&
    Reflect.get(data, 'response') !== null
  );
}

async function getEnglishPromptLocalization(): Promise<LocalVaultPermissionPromptLocalization> {
  const messages = await getMessagesForLanguage(DEFAULT_LANGUAGE);
  return {
    language: DEFAULT_LANGUAGE,
    title: messages.localVaultPermissionTitle
  };
}

async function resolvePromptLocalization(
  doc: Document
): Promise<LocalVaultPermissionPromptLocalization> {
  try {
    const controller = await ensureContentI18n(doc);
    const resource = controller.getCurrentResource();
    if (resource) {
      return {
        language: resource.language,
        title: resource.messages.localVaultPermissionTitle
      };
    }
  } catch {
    // Fall back to English if the content-page i18n path is unavailable.
  }

  return getEnglishPromptLocalization();
}

export function createLocalVaultPermissionPrompt(params: {
  document: Document;
  window: Window;
  runtime: Pick<RuntimeService, 'getURL'>;
  resolveLocalization?: (document: Document) => Promise<LocalVaultPermissionPromptLocalization>;
}): LocalVaultPermissionPrompt {
  const { document, window, runtime } = params;
  const resolveLocalization = params.resolveLocalization ?? resolvePromptLocalization;
  let activeCleanup: (() => void) | null = null;

  function cleanupActive(): void {
    activeCleanup?.();
    activeCleanup = null;
  }

  function buildFrameUrl(message: LocalVaultPermissionPromptMessage, language: string): string {
    const url = new URL(runtime.getURL('local-vault-permission.html'));
    url.searchParams.set('folderId', message.folderId);
    url.searchParams.set('language', language);
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
        let settled = false;
        const settle = (response: LocalVaultPermissionPromptResponse): void => {
          if (settled) {
            return;
          }
          settled = true;
          cleanupActive();
          resolve(response);
        };

        void (async () => {
          const localization = await resolveLocalization(document).catch(() =>
            getEnglishPromptLocalization()
          );
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
          frame.title = localization.title;
          frame.src = buildFrameUrl(message, localization.language);
          frame.style.cssText = [
            'width:min(420px,calc(100vw - 32px))',
            'height:264px',
            'border:0',
            'border-radius:16px',
            'box-shadow:0 24px 80px rgba(15,23,42,0.28)',
            'background:#fff'
          ].join(';');
          overlay.appendChild(frame);

          const handleMessage = (event: MessageEvent): void => {
            if (event.origin !== extensionOrigin || event.source !== frame.contentWindow) {
              return;
            }
            const data: object | null | undefined =
              typeof event.data === 'object' ? event.data : undefined;
            if (!isLocalVaultPermissionFrameMessage(data)) {
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
        })();
      });
    }
  };
}
