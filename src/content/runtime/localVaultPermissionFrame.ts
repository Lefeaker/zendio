import type { LocalVaultPermissionPromptResponse } from '../../shared/types';
import {
  resolveLocalVaultPermissionService,
  type LocalVaultPermissionService
} from './localVaultPermissionFrameAdapter';

export interface LocalVaultPermissionFrameOptions {
  document?: Document;
  window?: Window;
  permissionService?: LocalVaultPermissionService;
}

function getParam(frameWindow: Window, name: string): string {
  return new URL(frameWindow.location.href).searchParams.get(name)?.trim() ?? '';
}

function postResult(frameWindow: Window, response: LocalVaultPermissionPromptResponse): void {
  frameWindow.parent.postMessage(
    {
      type: 'AIIOB_LOCAL_VAULT_PERMISSION_RESULT',
      response
    },
    '*'
  );
}

function render(
  doc: Document,
  frameWindow: Window,
  permissionService: LocalVaultPermissionService
): void {
  const folderId = getParam(frameWindow, 'folderId');
  const folderName =
    getParam(frameWindow, 'folderName') || getParam(frameWindow, 'vaultName') || '本地仓库目录';

  doc.body.innerHTML = `
    <main class="permission-card">
      <div class="permission-heading">
        <span class="permission-kicker">All in Ob</span>
        <h1>允许写入本地仓库目录</h1>
      </div>
      <p class="permission-copy">
        Chrome 需要重新确认 <strong></strong> 的目录读写权限。允许后，本次保存会继续写入本地目录。
      </p>
      <p class="permission-status" data-role="status"></p>
      <div class="permission-actions">
        <button type="button" class="primary" data-action="authorize">授权并继续</button>
        <button type="button" class="secondary" data-action="rest-once">本次改用 REST</button>
        <button type="button" class="ghost" data-action="rest-always">不再询问</button>
      </div>
    </main>
  `;

  const strong = doc.querySelector('strong');
  if (strong) {
    strong.textContent = folderName;
  }

  const status = doc.querySelector<HTMLElement>('[data-role="status"]');
  const authorize = doc.querySelector<HTMLButtonElement>('[data-action="authorize"]');
  const restOnce = doc.querySelector<HTMLButtonElement>('[data-action="rest-once"]');
  const restAlways = doc.querySelector<HTMLButtonElement>('[data-action="rest-always"]');

  authorize?.addEventListener('click', () => {
    void (async () => {
      if (!folderId) {
        postResult(frameWindow, {
          action: 'use-rest',
          permissionState: 'missing',
          errorMessage: 'Local folder id is missing.'
        });
        return;
      }
      if (status) {
        status.textContent = '正在打开 Chrome 权限确认...';
      }
      authorize.disabled = true;
      restOnce?.setAttribute('disabled', 'true');
      restAlways?.setAttribute('disabled', 'true');
      try {
        const permissionState = await permissionService.ensurePermission(folderId);
        if (permissionState === 'granted') {
          postResult(frameWindow, { action: 'granted', permissionState });
          return;
        }
        postResult(frameWindow, {
          action: 'use-rest',
          permissionState,
          persistRest: permissionState === 'denied'
        });
      } catch (error) {
        postResult(frameWindow, {
          action: 'use-rest',
          permissionState: 'prompt',
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    })();
  });

  restOnce?.addEventListener('click', () => {
    postResult(frameWindow, { action: 'use-rest', permissionState: 'prompt' });
  });

  restAlways?.addEventListener('click', () => {
    postResult(frameWindow, {
      action: 'use-rest',
      permissionState: 'denied',
      persistRest: true
    });
  });
}

function ensureStyles(doc: Document): void {
  if (doc.getElementById('aiob-local-vault-permission-frame-style')) {
    return;
  }
  const style = doc.createElement('style');
  style.id = 'aiob-local-vault-permission-frame-style';
  style.textContent = `
  :root {
    color-scheme: light;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-height: 100vh;
    background: #ffffff;
    color: #172033;
  }

  .permission-card {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 22px;
  }

  .permission-kicker {
    display: block;
    margin-bottom: 5px;
    color: #667085;
    font-size: 12px;
    font-weight: 700;
  }

  h1 {
    margin: 0;
    font-size: 19px;
    line-height: 1.28;
    font-weight: 760;
  }

  .permission-copy {
    margin: 0;
    color: #475467;
    font-size: 14px;
    line-height: 1.58;
  }

  strong {
    color: #172033;
    font-weight: 750;
  }

  .permission-status {
    min-height: 19px;
    margin: 0;
    color: #2f6b4f;
    font-size: 13px;
  }

  .permission-actions {
    display: flex;
    gap: 8px;
    margin-top: auto;
  }

  button {
    min-height: 36px;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 0 12px;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.64;
  }

  .primary {
    background: #13795b;
    color: #ffffff;
  }

  .secondary {
    border-color: #d0d5dd;
    background: #ffffff;
    color: #344054;
  }

  .ghost {
    background: transparent;
    color: #667085;
  }
`;
  doc.head.appendChild(style);
}

export function mountLocalVaultPermissionFrame(
  options: LocalVaultPermissionFrameOptions = {}
): void {
  const frameDocument = options.document ?? document;
  const frameWindow = options.window ?? window;
  const permissionService = options.permissionService ?? resolveLocalVaultPermissionService();
  ensureStyles(frameDocument);
  render(frameDocument, frameWindow, permissionService);
}

mountLocalVaultPermissionFrame();
